import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { SHELF } from "@prosody/domain/Library/Shelf.view";
import { WorkId } from "@prosody/domain/Library/Work.id";
import type {
	Bookmark,
	Position,
	Sentence,
} from "@prosody/domain/Reading/Sentence";
import { Duration, Effect, Match, Option, Schema } from "effect";
import type { HttpClient } from "effect/http";
import { Command, Subscription } from "foldkit";
import type { Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { load, pushUrl } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import { toString as urlToString } from "foldkit/url";

import { FetchPage, OpenBook } from "./Copy.ts";
import { Book, Message, Model, Page, Room } from "./Model.ts";
import type { Flags } from "./Model.ts";
import { Pause, Play, Seek, SetRate } from "./Player.ts";
import { Prosody } from "./Prosody.ts";
import type { Reader } from "./Prosody.ts";
import { roomView } from "./Room.ts";
import { AppRoute, urlToAppRoute } from "./Route.ts";
import { shelfView } from "./Shelf.ts";
import { Show, ToTop } from "./Text.ts";
import {
	firstOn,
	heardOf,
	indexOf,
	pageOf,
	sentenceAt,
	sentenceOf,
	spanOf,
	startOf,
} from "./Timeline.ts";

/** What commands may need: the reader's Api, and HTTP for the reading copies. */
type Resources = Reader | HttpClient.HttpClient;

type Return = Update.Return<Model, Message, Resources>;

type Commands = ReadonlyArray<Command.Command<Message, never, Resources>>;

/** A change to the room, and what it sets off. */
type Step = readonly [Room, Commands];

/** How often a place is kept while the audio plays. A pause keeps it at once. */
const KEEP_EVERY = 15_000;

/** How long to wait before sending a place again when its answer was lost. */
const RETRY_AFTER = Duration.seconds(5);

/** The speeds the rate button steps through. */
const RATES = [1, 1.2, 1.5, 1.8, 2, 0.8];

// COMMANDS

const Navigate = Command.define("Navigate", {
	args: { url: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ url }) =>
		pushUrl(url).pipe(Effect.as(Message.CompletedNavigate())),
});

const Leave = Command.define("Leave", {
	args: { href: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ href }) =>
		load(href).pipe(Effect.as(Message.CompletedNavigate())),
});

/** Wait, then say a place may be sent again. */
const RetryKeep = Command.define("RetryKeep", {
	args: { commandId: Schema.String },
	messages: [Message.RetriedKeep],
	execute: ({ commandId }) =>
		Effect.sleep(RETRY_AFTER).pipe(
			Effect.as(Message.RetriedKeep({ commandId }))
		),
});

// ROOM

const roomOf = (work: string): Room =>
	Room.make({
		work,
		book: Book.Opening(),
		pages: {},
		shown: 0,
		sentence: Option.none(),
		hasHeardPlace: false,
		heardPlace: Option.none(),
		time: 0,
		isPlaying: false,
		rate: 1,
		kept: Option.none(),
		keeping: Option.none(),
		elsewhere: Option.none(),
	});

/** The model with its room changed, when there is a room for `work`. */
const withRoom = (
	model: Model,
	work: string,
	change: (room: Room) => Step
): Return =>
	Option.match(
		Option.filter(model.room, (room) => room.work === work),
		{
			onNone: () => ({ model }),
			onSome: (room) => {
				const [next, commands] = change(room);

				return {
					model: modifyFields(model, { room: () => Option.some(next) }),
					commands,
				};
			},
		}
	);

/** The same, for the room that is open, whatever its work. */
const inRoom = (model: Model, change: (room: Room) => Step): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => withRoom(model, room.work, change),
	});

/** Fetch a page unless it is fetched or on its way. */
const fetchIfNeeded = (room: Room, path: string): Step =>
	path === "" || room.pages[path] !== undefined
		? [room, []]
		: [
				{ ...room, pages: { ...room.pages, [path]: Page.Fetching() } },
				[FetchPage({ work: room.work, path })],
			];

/** Show the page at `index`, fetching it and the one after it. */
const turnTo = (room: Room, index: number): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents }) => {
			const path = contents.pages[index]?.path ?? "";
			const next = contents.pages[index + 1]?.path ?? "";
			const [fetched, first] = fetchIfNeeded({ ...room, shown: index }, path);
			const [ahead, second] = fetchIfNeeded(fetched, next);

			return [ahead, [...first, ...second]];
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

/**
 * Go to a sentence: show its page, underline it, bring it into view, and move the audio to it,
 * playing on if it was playing.
 */
const goTo = (room: Room, sentence: Sentence): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) => {
			const index = indexOf(contents, pageOf(sentence));
			const [turned, fetches] = turnTo(room, Math.max(0, index));
			const start = startOf(timeline, sentence);

			const seek =
				start === undefined
					? []
					: [Seek({ time: start, play: room.isPlaying })];

			return [
				{
					...turned,
					sentence: Option.some(sentence),
					time: start ?? room.time,
				},
				[...fetches, ...seek, Show({ id: spanOf(sentence) })],
			];
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

/**
 * Once both the book and your place have arrived, open the book at your place, or at its first
 * page when you have none.
 */
const settle = (room: Room): Step => {
	if (!room.hasHeardPlace || Option.isSome(room.sentence)) {
		return [room, []];
	}

	return Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) =>
			Option.match(room.heardPlace, {
				onSome: (place) =>
					goTo({ ...room, kept: Option.some(place) }, place.sentence),
				onNone: () => {
					const first = firstOn(timeline, contents.pages[0]?.path ?? "");

					return first === undefined ? turnTo(room, 0) : goTo(room, first);
				},
			}),
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});
};

/** Send your place to the model, under a new command id. */
const keep = (
	model: Model,
	room: Room,
	sentence: Sentence,
	at: number
): readonly [Model, Room, Commands] => {
	const allocation = DomainFoldkit.next(model.commandIds);
	const place: Position = { sentence, at };

	return [
		modifyFields(model, { commandIds: () => allocation.commandIds }),
		{
			...room,
			kept: Option.some(place),
			keeping: Option.some({ commandId: allocation.commandId, place }),
		},
		[send(room.work, allocation.commandId, place)],
	];
};

/** Send a place to the model. Which device sent it, the Session says. */
const send = (work: string, commandId: string, place: Position) =>
	Command.mapMessage(
		Prosody.KeepPlace({ target: WorkId.make(work), input: place, commandId }),
		(result) => Message.ReceivedResult({ result })
	);

/** What an update of the room does when it also keeps your place. */
type Kept = readonly [Room, Sentence, number, Commands];

/** Change the open room and keep the place it ends on, at the time given. */
const keepIn = (
	model: Model,
	change: (room: Room) => Option.Option<Kept>
): Return =>
	Option.match(
		Option.flatMap(model.room, (room) =>
			Option.map(change(room), ([next, sentence, at, commands]) => {
				const [kept, room2, sends] = keep(model, next, sentence, at);

				return { kept, room: room2, commands: [...sends, ...commands] };
			})
		),
		{
			onNone: () => ({ model }),
			onSome: ({ kept, room, commands }) => ({
				model: modifyFields(kept, { room: () => Option.some(room) }),
				commands,
			}),
		}
	);

/**
 * A place kept elsewhere that is newer than anything this page has. A place this page kept is never
 * newer than the last one it kept.
 */
const isElsewhere = (room: Room, place: Bookmark): boolean =>
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => place.at > kept.at,
	}) &&
	Option.match(room.sentence, {
		onNone: () => true,
		onSome: (sentence) => sentence !== place.sentence,
	});

/** Whether it is time to keep the place again while the audio plays. */
const isDue = (room: Room, at: number): boolean =>
	room.isPlaying &&
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => at - kept.at >= KEEP_EVERY,
	});

/**
 * Follow the audio: underline the sentence it is in, turn the page when it does, and keep the
 * place every so often.
 */
const follow = (model: Model, time: number, at: number): Return => {
	const step = (room: Room): Step =>
		Book.match<Step>(room.book, {
			Open: ({ contents, timeline }) => {
				const moved = { ...room, time };
				const sentence = sentenceAt(heardOf(timeline), time);

				if (
					sentence === undefined ||
					Option.contains(room.sentence, sentence)
				) {
					return [moved, []];
				}

				const index = indexOf(contents, pageOf(sentence));

				const [turned, fetches] =
					index === room.shown || index === -1
						? [moved, []]
						: turnTo(moved, index);

				return [
					{ ...turned, sentence: Option.some(sentence) },
					[...fetches, Show({ id: spanOf(sentence) })],
				];
			},
			Opening: () => [{ ...room, time }, []],
			Unmade: () => [{ ...room, time }, []],
			Failed: () => [{ ...room, time }, []],
		});

	return Option.exists(model.room, (room) => isDue(room, at))
		? keepIn(model, (room) => {
				const [next, commands] = step(room);

				return Option.map(next.sentence, (sentence) => [
					next,
					sentence,
					at,
					commands,
				]);
			})
		: inRoom(model, step);
};

/** Open the room a route asks for, or close it. */
const route = (model: Model, next: AppRoute): Return =>
	AppRoute.match<Return>(next, {
		Room: ({ work }) =>
			Option.exists(model.room, (room) => room.work === work)
				? { model: modifyFields(model, { route: () => next }) }
				: {
						model: modifyFields(model, {
							route: () => next,
							room: () => Option.some(roomOf(work)),
						}),
						commands: [OpenBook({ work })],
					},
		Shelf: () => ({
			model: modifyFields(model, {
				route: () => next,
				room: () => Option.none(),
			}),
		}),
		NotFound: () => ({
			model: modifyFields(model, {
				route: () => next,
				room: () => Option.none(),
			}),
		}),
	});

/** The shelf's word on a work's sync, if it has one. */
const syncOf = (model: Model, work: string) =>
	Option.flatMap(model.shelf, ({ syncs }) =>
		Option.fromUndefinedOr(syncs[work])
	);

/** Move a realign along as the shelf reports the press at work, and reopen the book when it is done. */
const realigned = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Unmade: ({ phase }) => {
				const state = Option.getOrUndefined(
					Option.map(syncOf(model, room.work), (sync) => sync.state)
				);

				if (phase === "asked" && state === "syncing") {
					return [{ ...room, book: Book.Unmade({ phase: "aligning" }) }, []];
				}

				if (phase === "aligning" && state !== "syncing") {
					return [
						{ ...roomOf(room.work), book: Book.Opening() },
						[OpenBook({ work: room.work })],
					];
				}

				return [room, []];
			},
			Opening: () => [room, []],
			Open: () => [room, []],
			Failed: () => [room, []],
		})
	);

// INIT

export const init = (flags: Flags, url: Url): Return =>
	route(
		Model.make({
			route: AppRoute.Shelf(),
			commandIds: DomainFoldkit.CommandIds.make({
				session: flags.session,
				sent: 0,
			}),
			shelf: Option.none(),
			hasAnswered: false,
			error: Option.none(),
			room: Option.none(),
		}),
		urlToAppRoute(url)
	);

// UPDATE

export const update = (model: Model, message: Message): Return =>
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
		FailedWatchShelf: ({ reason }) => ({
			model: modifyFields(model, {
				hasAnswered: () => true,
				error: () => Option.some(reason),
			}),
		}),

		ReceivedPlace: ({ state }) =>
			inRoom(model, (room) => {
				const place = Option.flatMap(state, (s) =>
					Option.fromNullishOr(s.place)
				);

				const heard = { ...room, hasHeardPlace: true, heardPlace: place };

				if (!room.hasHeardPlace) {
					return settle(heard);
				}

				return [
					{
						...heard,
						elsewhere: Option.filter(place, (p) => isElsewhere(room, p)),
					},
					[],
				];
			}),
		FailedWatchPlace: () => ({ model }),

		OpenedBook: ({ work, contents, timeline }) =>
			withRoom(model, work, (room) => {
				const open = { ...room, book: Book.Open({ contents, timeline }) };
				const [settled, commands] = settle(open);

				return commands.length === 0
					? turnTo(settled, settled.shown)
					: [settled, commands];
			}),
		FoundUnmade: ({ work }) =>
			withRoom(model, work, (room) => [
				{ ...room, book: Book.Unmade({ phase: "idle" }) },
				[],
			]),
		FailedOpenBook: ({ work, reason }) =>
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

		ClickedChapter: ({ index }) =>
			inRoom(model, (room) => {
				const [turned, fetches] = turnTo(room, index);

				return [turned, [...fetches, ToTop()]];
			}),

		PressedSentence: ({ id, at }) =>
			keepIn(model, (room) =>
				Book.match<Option.Option<Kept>>(room.book, {
					Open: ({ contents }) => {
						const sentence = sentenceOf(
							contents.pages[room.shown]?.path ?? "",
							id
						);

						const [moved, commands] = goTo(room, sentence);

						return Option.some([moved, sentence, at, commands] as const);
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
									sentence,
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
						goTo(
							{ ...room, elsewhere: Option.none(), kept: Option.some(place) },
							place.sentence
						),
				})
			),
		ClickedRealign: () =>
			Option.match(model.room, {
				onNone: () => ({ model }),
				onSome: (room) => {
					const allocation = DomainFoldkit.next(model.commandIds);

					return {
						model: modifyFields(model, {
							commandIds: () => allocation.commandIds,
							room: () =>
								Option.some({ ...room, book: Book.Unmade({ phase: "asked" }) }),
						}),
						commands: [
							Command.mapMessage(
								Prosody.RealignNarration({
									target: WorkId.make(room.work),
									input: {},
									commandId: allocation.commandId,
								}),
								(result) => Message.ReceivedResult({ result })
							),
						],
					};
				},
			}),

		Played: () => inRoom(model, (room) => [{ ...room, isPlaying: true }, []]),
		Paused: ({ time, at }) =>
			keepIn(model, (room) =>
				Option.map(
					room.sentence,
					(sentence) =>
						[{ ...room, isPlaying: false, time }, sentence, at, []] as const
				)
			),
		Ticked: ({ time, at }) => follow(model, time, at),
		CompletedPlayer: () => ({ model }),
		CompletedShow: () => ({ model }),

		ReceivedResult: ({ result }) =>
			Prosody.Message.match(result, {
				SucceededKeepPlace: ({ commandId }) =>
					inRoom(model, (room) => [
						{
							...room,
							keeping: Option.filter(
								room.keeping,
								(keeping) => keeping.commandId !== commandId
							),
						},
						[],
					]),
				FailedKeepPlace: ({ commandId, failure }) =>
					Match.value(failure).pipe(
						Match.tagsExhaustive({
							// A newer place was kept elsewhere: the Place view brings it.
							Rejected: () => dropKeeping(model, commandId),
							Denied: () => dropKeeping(model, commandId),
							Unknown: () => ({
								model,
								commands: [RetryKeep({ commandId })],
							}),
						})
					),
				SucceededRealignNarration: () => ({ model }),
				FailedRealignNarration: () =>
					inRoom(model, (room) => [
						{ ...room, book: Book.Unmade({ phase: "idle" }) },
						[],
					]),
			}),
		RetriedKeep: ({ commandId }) =>
			inRoom(model, (room) =>
				Option.match(
					Option.filter(
						room.keeping,
						(keeping) => keeping.commandId === commandId
					),
					{
						onNone: () => [room, []],
						onSome: (keeping) => [
							room,
							[send(room.work, keeping.commandId, keeping.place)],
						],
					}
				)
			),
	});

const dropKeeping = (model: Model, commandId: string): Return =>
	inRoom(model, (room) => [
		{
			...room,
			keeping: Option.filter(
				room.keeping,
				(keeping) => keeping.commandId !== commandId
			),
		},
		[],
	]);

// SUBSCRIPTION

/** Follow the one shelf, and your place in the work that is open. */
export const subscriptions = Subscription.make<Model, Message, Reader>()(
	() => ({
		shelf: Prosody.Shelf.watch({
			key: () => SHELF,
			toMessage: (snapshot): Message => Message.ReceivedShelf(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchShelf({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchShelf({ reason: "The connection failed" }),
		}),
		place: Prosody.Place.watch({
			key: (model: Model) =>
				WorkId.make(
					Option.match(model.room, {
						onNone: () => "",
						onSome: (room) => room.work,
					})
				),
			isEnabled: (model: Model) => Option.isSome(model.room),
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
	Option.match(model.room, {
		onNone: () => shelfView(model, h),
		onSome: (room) => roomView(model, room, h),
	});
