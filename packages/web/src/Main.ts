import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { SHELF } from "@prosody/domain/Library/Shelf.view";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Effect, Match, Option, Schema, Stream } from "effect";
import { Command, Subscription } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { load, pushUrl, replaceUrl } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import { toString as urlToString } from "foldkit/url";

import { lostConnection, networkChanges } from "./Connection.ts";
import { deskView } from "./Desk.ts";
import {
	changeCopying,
	keepCopy,
	keptCopy,
	removeCopy,
	startCopy,
	withoutCopy,
} from "./DeviceCopies.ts";
import { announced } from "./LockScreen.ts";
import { Book, Message, Model, Page } from "./Model.ts";
import type { Flags } from "./Model.ts";
import { Stamp, sendMove } from "./Nightstand.ts";
import {
	answered,
	heard,
	keepIn,
	placeOn,
	sendWaiting,
	WaitForPlace,
} from "./Places.ts";
import type { Kept } from "./Places.ts";
import { Pause, Play, Seek, SetRate } from "./Player.ts";
import { Prosody } from "./Prosody.ts";
import type { Reader } from "./Prosody.ts";
import { roomView } from "./Room.ts";
import {
	answeredRemake,
	follow,
	hearOwn,
	realigned,
	remake,
	reopen,
	route,
	skip,
	stampIn,
	toChapter,
	unmade,
} from "./Rooms.ts";
import { AppRoute, shelfRouter, urlToAppRoute } from "./Route.ts";
import { shelfView } from "./Shelf.ts";
import {
	andThen,
	goTo,
	goToPlace,
	inRoom,
	isElsewhere,
	settle,
	spotOf,
	turnTo,
	withRoom,
} from "./Steps.ts";
import type { Return } from "./Steps.ts";
import { Show } from "./Text.ts";
import { pageOf, sentenceOf, spanOf, startOf } from "./Timeline.ts";
import {
	changeDesk,
	deskFailed,
	sendAbout,
	sendWant,
	submitWant,
} from "./Wants.ts";

/** The speeds the rate button steps through. */
const RATES = [1, 1.2, 1.5, 1.8, 2, 0.8];

// COMMANDS

const Navigate = Command.define("Navigate", {
	args: { url: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ url }) =>
		pushUrl(url).pipe(Effect.as(Message.CompletedNavigate())),
});

/** Close the room by putting the shelf in its place, so going back does not open the book again. */
const CloseRoom = Command.define("CloseRoom", {
	messages: [Message.CompletedNavigate],
	execute: replaceUrl(shelfRouter()).pipe(
		Effect.as(Message.CompletedNavigate())
	),
});

const Leave = Command.define("Leave", {
	args: { href: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ href }) =>
		load(href).pipe(Effect.as(Message.CompletedNavigate())),
});

// INIT

/** Start on the page the address names, and send any place an earlier visit could not. */
export const init = (flags: Flags, url: Url): Return =>
	andThen(
		route(
			Model.make({
				route: AppRoute.Shelf(),
				commandIds: DomainFoldkit.CommandIds.make({
					session: flags.session,
					sent: 0,
				}),
				isOnline: flags.isOnline,
				places: flags.places,
				copies: flags.copies,
				copying: Option.none(),
				shelf: Option.none(),
				hasAnswered: false,
				error: Option.none(),
				nightstand: Option.none(),
				room: Option.none(),
				wanted: Option.none(),
				desk: { title: "", author: "", problem: Option.none() },
			}),
			urlToAppRoute(url)
		),
		(model) => ({
			model,
			commands: model.isOnline ? sendWaiting(model) : [],
		})
	);

// UPDATE

/** Every message, then the lock screen told if what is playing changed. */
export const update = (model: Model, message: Message): Return =>
	announced(model, handle(model, message));

const handle = (model: Model, message: Message): Return =>
	Message.match<Return>(message, {
		ClickedLink: ({ request }) =>
			Match.value(request).pipe(
				Match.tagsExhaustive({
					Internal: ({ url }) => ({
						model,
						commands: [Navigate({ url: urlToString(url) })],
					}),
					External: ({ href }) => ({ model, commands: [Leave({ href })] }),
				})
			),
		ChangedUrl: ({ url }) => route(model, urlToAppRoute(url)),
		CompletedNavigate: () => ({ model }),

		ReceivedShelf: ({ state }) =>
			realigned(
				modifyFields(model, {
					shelf: () => state,
					hasAnswered: () => true,
					error: () => Option.none(),
				})
			),
		FailedWatchShelf: ({ reason }) =>
			lostConnection(
				modifyFields(model, {
					hasAnswered: () => true,
					error: () => Option.some(reason),
				})
			),

		// The device keeps the newer of its own place and the model's, and the room first opens there.
		ReceivedPlace: ({ state }) => {
			const place = Option.flatMap(state, (s) => Option.fromNullishOr(s.place));

			const [known, saves] = Option.match(Option.product(model.room, place), {
				onNone: () => [model, []] as const,
				onSome: ([room, p]) => heard(model, room.work, p),
			});

			return andThen({ model: known, commands: saves }, (next) =>
				inRoom(next, (room) =>
					room.hasHeardPlace
						? [
								{
									...room,
									heardPlace: place,
									elsewhere: Option.filter(place, (p) => isElsewhere(room, p)),
								},
								[],
							]
						: settle({
								...room,
								hasHeardPlace: true,
								heardPlace: placeOn(next, room.work),
							})
				)
			);
		},
		FailedWatchPlace: () => andThen(lostConnection(model), hearOwn),

		ReceivedNightstand: ({ state }) => ({
			model: modifyFields(model, { nightstand: () => state }),
		}),
		FailedWatchNightstand: () => lostConnection(model),

		// The book goes on the nightstand, once a visit, and shows its first page until your place
		// arrives, waiting only a moment for it.
		OpenedCopy: ({ work, contents, timeline }) =>
			withRoom(model, work, (room) => {
				const open = { ...room, book: Book.Open({ contents, timeline }) };
				const [settled, commands] = settle(open);
				const stamps = room.hasOpened ? [] : [Stamp({ work, move: "open" })];

				if (commands.length > 0) {
					return [settled, [...commands, ...stamps]];
				}

				const [turned, fetches] = turnTo(settled, settled.shown);

				return [turned, [...fetches, WaitForPlace({ work }), ...stamps]];
			}),
		WaitedForPlace: ({ work }) =>
			Option.exists(model.room, (room) => room.work === work)
				? hearOwn(model)
				: { model },
		FoundUnmade: ({ work }) => unmade(model, work),
		FailedOpenCopy: ({ work, reason }) =>
			withRoom(model, work, (room) => [
				{ ...room, book: Book.Failed({ reason }) },
				[],
			]),

		FetchedPage: ({ work, path, html }) =>
			withRoom(model, work, (room) => [
				{ ...room, pages: { ...room.pages, [path]: Page.Fetched({ html }) } },
				Option.match(
					Option.filter(room.sentence, (sentence) => pageOf(sentence) === path),
					{
						onNone: () => [],
						onSome: (sentence) => [Show({ id: spanOf(sentence) })],
					}
				),
			]),
		FailedFetchPage: ({ work, path, reason }) =>
			withRoom(model, work, (room) => [
				{ ...room, pages: { ...room.pages, [path]: Page.Failed({ reason }) } },
				[],
			]),

		ClickedChapter: ({ index }) => toChapter(model, index),
		ClickedSkip: ({ seconds }) => skip(model, seconds),

		PressedSentence: ({ id, at }) =>
			keepIn(model, (room) =>
				Book.match<Option.Option<Kept>>(room.book, {
					Open: ({ contents }) => {
						const sentence = sentenceOf(
							contents.pages[room.shown]?.path ?? "",
							id
						);

						const [moved, commands] = goTo(room, sentence);

						return Option.some([
							moved,
							{ sentence, time: null },
							at,
							commands,
						] as const);
					},
					Opening: () => Option.none(),
					Unmade: () => Option.none(),
					Failed: () => Option.none(),
				})
			),
		// Reading on with the audio stopped: the place follows the page, and so does the audio.
		ReadTo: ({ id, at }) =>
			Option.exists(model.room, (room) => room.isPlaying)
				? { model }
				: keepIn(model, (room) =>
						Book.match<Option.Option<Kept>>(room.book, {
							Open: ({ contents, timeline }) => {
								const sentence = sentenceOf(
									contents.pages[room.shown]?.path ?? "",
									id
								);

								const start = startOf(timeline, sentence);

								return Option.some([
									{
										...room,
										sentence: Option.some(sentence),
										time: start ?? room.time,
									},
									{ sentence, time: null },
									at,
									start === undefined
										? []
										: [Seek({ time: start, play: false })],
								] as const);
							},
							Opening: () => Option.none(),
							Unmade: () => Option.none(),
							Failed: () => Option.none(),
						})
					),

		ClickedPlay: () => ({ model, commands: [Play()] }),
		ClickedPause: () => ({ model, commands: [Pause()] }),
		ClickedRate: () =>
			inRoom(model, (room) => {
				const rate = RATES[(RATES.indexOf(room.rate) + 1) % RATES.length] ?? 1;

				return [{ ...room, rate }, [SetRate({ rate })]];
			}),
		ClickedElsewhere: () =>
			inRoom(model, (room) =>
				Option.match(room.elsewhere, {
					onNone: () => [room, []],
					onSome: (place) =>
						goToPlace(
							{ ...room, elsewhere: Option.none(), kept: Option.some(place) },
							place
						),
				})
			),
		ClickedRealign: () => remake(model),
		ClickedFinish: () => stampIn(model, "finish"),
		ClickedSetAside: () => stampIn(model, "setAside"),
		// Finishing a book or setting it aside closes it, so neither a reload nor Back opens it again.
		Stamped: ({ work, move, at }) =>
			andThen(sendMove(model, work, move, at), (next) => ({
				model: next,
				commands: move === "open" ? [] : [CloseRoom()],
			})),

		Played: () => inRoom(model, (room) => [{ ...room, isPlaying: true }, []]),
		Paused: ({ time, at }) =>
			keepIn(model, (room) => {
				const paused = { ...room, isPlaying: false, time };

				return Option.map(
					spotOf(paused),
					(spot) => [paused, spot, at, []] as const
				);
			}),
		Ticked: ({ time, at }) => follow(model, time, at),
		CompletedPlayer: () => ({ model }),
		CompletedShow: () => ({ model }),

		ReceivedResult: ({ result }) =>
			Prosody.Message.match(result, {
				SucceededKeepPlace: ({ commandId }) => answered(model, commandId),
				FailedKeepPlace: ({ commandId, failure }) =>
					Match.value(failure).pipe(
						Match.tagsExhaustive({
							// A newer place was kept elsewhere: the Place view brings it.
							Rejected: () => answered(model, commandId),
							Denied: () => answered(model, commandId),
							// The answer was lost: the place waits, and is sent again with the same id.
							Unknown: () => lostConnection(model),
						})
					),
				// The open was heard, so coming back online does not send it again.
				SucceededOpenBook: () =>
					inRoom(model, (room) => [{ ...room, hasOpened: true }, []]),
				// The nightstand brings what each of these changed.
				FailedOpenBook: () => ({ model }),
				SucceededFinishBook: () => ({ model }),
				FailedFinishBook: () => ({ model }),
				SucceededSetAside: () => ({ model }),
				FailedSetAside: () => ({ model }),
				// The desk's view brings what each of these changed.
				SucceededWantBook: () => ({ model }),
				FailedWantBook: ({ failure }) => deskFailed(model, failure),
				SucceededSearchAgain: () => ({ model }),
				FailedSearchAgain: ({ failure }) => deskFailed(model, failure),
				SucceededWithdrawWant: () => ({ model }),
				FailedWithdrawWant: ({ failure }) => deskFailed(model, failure),
				SucceededRealignNarration: () => answeredRemake(model, "aligning"),
				SucceededRemakeCopy: () => answeredRemake(model, "aligning"),
				FailedRealignNarration: () => answeredRemake(model, "idle"),
				FailedRemakeCopy: () => answeredRemake(model, "idle"),
			}),
		SavedPlaces: () => ({ model }),

		ClickedKeepCopy: () => startCopy(model),
		ClickedStopCopy: () => ({
			model: modifyFields(model, { copying: () => Option.none() }),
		}),
		ClickedRemoveCopy: () => removeCopy(model),
		CopiedPart: ({ work, done, of }) =>
			changeCopying(model, work, (copying) => ({ ...copying, done, of })),
		KeptCopy: ({ work, copy }) => keptCopy(model, work, copy),
		FailedCopy: ({ work, reason }) =>
			changeCopying(model, work, (copying) => ({
				...copying,
				problem: reason,
			})),
		RemovedCopy: ({ work }) => withoutCopy(model, work),

		WentOnline: () =>
			andThen(
				{
					model: modifyFields(model, { isOnline: () => true }),
					commands: sendWaiting(model),
				},
				reopen
			),
		WentOffline: () => ({
			model: modifyFields(model, { isOnline: () => false }),
		}),

		// A desk where nothing was ever wanted answers with no state: an empty desk.
		ReceivedWanted: ({ state }) => ({
			model: modifyFields(model, {
				wanted: () =>
					Option.orElseSome(state, () => ({ wants: {}, catalogue: {} })),
			}),
		}),
		FailedWatchWanted: () => lostConnection(model),
		ChangedWantTitle: ({ value }) => ({
			model: changeDesk(model, (desk) => ({ ...desk, title: value })),
		}),
		ChangedWantAuthor: ({ value }) => ({
			model: changeDesk(model, (desk) => ({ ...desk, author: value })),
		}),
		SubmittedWant: () => submitWant(model),
		MintedWork: ({ work, title, author }) =>
			sendWant(model, work, title, author),
		ClickedSearchAgain: ({ work }) => sendAbout(model, work, "searchAgain"),
		ClickedWithdraw: ({ work }) => sendAbout(model, work, "withdraw"),
	});

// SUBSCRIPTION

/** What the place watch is keyed by while no room is open and it reads nothing. No work has it. */
const NO_ROOM = WorkId.make("w-none");

/**
 * Follow the browser's network and the copy on its way to the device, and while the model can be
 * reached, the one shelf, the nightstand beside it, your place in the work that is open, and the
 * books you want while the desk is open.
 */
export const subscriptions = Subscription.make<Model, Message, Reader>()(
	(entry) => ({
		network: entry(
			{},
			{
				modelToDependencies: () => ({}),
				dependenciesToStream: () => networkChanges,
			}
		),
		copying: entry(
			{
				copy: Schema.Option(
					Schema.Struct({
						work: Schema.String,
						title: Schema.String,
						author: Schema.String,
					})
				),
			},
			{
				modelToDependencies: (model) => ({
					copy: Option.map(
						Option.filter(model.copying, ({ problem }) => problem === null),
						({ work, title, author }) => ({ work, title, author })
					),
				}),
				dependenciesToStream: ({ copy }) =>
					Option.match(copy, {
						onNone: () => Stream.empty,
						onSome: ({ work, title, author }) => keepCopy(work, title, author),
					}),
			}
		),
		shelf: Prosody.Shelf.watch({
			key: () => SHELF,
			isEnabled: (model: Model) => model.isOnline,
			toMessage: (snapshot): Message => Message.ReceivedShelf(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchShelf({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchShelf({ reason: "The connection failed" }),
		}),
		nightstand: Prosody.Nightstand.watch({
			key: () => SHELF,
			isEnabled: (model: Model) => model.isOnline,
			toMessage: (snapshot): Message => Message.ReceivedNightstand(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchNightstand({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchNightstand({ reason: "The connection failed" }),
		}),
		wanted: Prosody.Wanted.watch({
			key: () => SHELF,
			isEnabled: (model: Model) =>
				model.isOnline && AppRoute.guards.Desk(model.route),
			toMessage: (snapshot): Message => Message.ReceivedWanted(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchWanted({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchWanted({ reason: "The connection failed" }),
		}),
		place: Prosody.Place.watch({
			key: (model: Model) =>
				Option.match(model.room, {
					onNone: () => NO_ROOM,
					onSome: (room) => WorkId.make(room.work),
				}),
			isEnabled: (model: Model) => model.isOnline && Option.isSome(model.room),
			toMessage: (snapshot): Message => Message.ReceivedPlace(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchPlace({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchPlace({ reason: "The connection failed" }),
		}),
	})
);

// VIEW

export const view = (model: Model, h: HtmlBuilder<Message>): Document =>
	AppRoute.guards.Desk(model.route)
		? deskView(model, h)
		: Option.match(model.room, {
				onNone: () => shelfView(model, h),
				onSome: (room) => roomView(model, room, h),
			});
