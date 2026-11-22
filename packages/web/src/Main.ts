import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { SHELF } from "@prosody/domain/Library/Shelf.view";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { ReaderId } from "@prosody/domain/Reader.id";
import { readingOf } from "@prosody/domain/Reading/Reading.id";
import { Duration, Effect, Match, Option, Schema, Stream } from "effect";
import { Command, Dom, Subscription } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { load, pushUrl, replaceUrl } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import { toString as urlToString } from "foldkit/url";

import { accountView } from "./Account.ts";
import {
	removeReader,
	revokeInvite,
	revokeSession,
	updateAccount,
} from "./AccountUpdate.ts";
import { DEFAULT_APPEARANCE } from "./Appearance.ts";
import type { Appearance } from "./Appearance.ts";
import { checkingView, inviteView, loginView, setupView } from "./Auth.ts";
import {
	FetchMe,
	guard,
	recheck,
	signInRedirect,
	updateAuth,
} from "./AuthUpdate.ts";
import { lostConnection, networkChanges } from "./Connection.ts";
import {
	cancelCorrecting,
	startCorrecting,
	submitCorrection,
} from "./Correcting.ts";
import { deskView } from "./Desk.ts";
import { updateDesk } from "./DeskUpdate.ts";
import {
	changeCopying,
	keepCopy,
	keptCopy,
	removeCopy,
	startCopy,
	withoutCopy,
} from "./DeviceCopies.ts";
import { sendGrab, sendGrabMove } from "./Grabs.ts";
import { announced } from "./LockScreen.ts";
import {
	AuthState,
	Book,
	ConfirmAction,
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	EMPTY_AUTH_FORM,
	Message,
	Model,
	Section,
} from "./Model.ts";
import type { Flags } from "./Model.ts";
import { Stamp, sendMove } from "./Nightstand.ts";
import {
	answered,
	learnPlace,
	keepIn,
	placeOn,
	WaitForPlace,
} from "./Places.ts";
import type { Kept } from "./Places.ts";
import { Pause, Play } from "./Player.ts";
import { Prosody } from "./Prosody.ts";
import type { Reader } from "./Prosody.ts";
import { isAdmin, isSignedIn, NO_READER_ID, readerIn } from "./Readers.ts";
import { roomView } from "./Room.ts";
import {
	answeredRemake,
	follow,
	hearOwn,
	played,
	readTo,
	realigned,
	remake,
	reopen,
	route,
	showedPage,
	skip,
	stampIn,
	toChapter,
	turnPage,
	unmade,
} from "./Rooms.ts";
import { roomSubscriptions } from "./RoomSubscriptions.ts";
import { updateRoom } from "./RoomUpdate.ts";
import {
	AppRoute,
	loginQueryOf,
	roomRouter,
	shelfRouter,
	urlToAppRoute,
} from "./Route.ts";
import { shelfView } from "./Shelf.ts";
import { shelfSubscriptions, updateShelf } from "./ShelfUpdate.ts";
import {
	andThen,
	entryOf,
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
import { sectionOf, sentenceOf, spanOf } from "./Timeline.ts";
import {
	ApplyAppearance,
	CloseConfirmDialog,
	confirmDialogView,
	liveRegionView,
	notFoundView,
	OpenConfirmDialog,
	ReleaseConfirmDialog,
	shellView,
	showToast,
	toastView,
} from "./Ui.ts";
import type { NavDestination } from "./Ui.ts";
import {
	changeDesk,
	deskFailed,
	sendAbout,
	sendWant,
	submitWant,
} from "./Wants.ts";

const TOAST_DURATION = Duration.millis(4200);

const toTop = Effect.sync(() => {
	window.scrollTo({ top: 0 });
});

const Navigate = Command.define("Navigate", {
	args: { url: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ url }) =>
		pushUrl(url).pipe(
			Effect.andThen(toTop),
			Effect.as(Message.CompletedNavigate())
		),
});

const CloseRoom = Command.define("CloseRoom", {
	messages: [Message.CompletedNavigate],
	execute: replaceUrl(shelfRouter()).pipe(
		Effect.andThen(toTop),
		Effect.as(Message.CompletedNavigate())
	),
});

const Leave = Command.define("Leave", {
	args: { href: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ href }) =>
		load(href).pipe(Effect.as(Message.CompletedNavigate())),
});

const executeConfirm = (model: Model, action: ConfirmAction): Return =>
	ConfirmAction.match(action, {
		Realign: () =>
			andThen(remake(model), (next) => ({
				model: showToast(next, "Asked the press to align it again"),
			})),
		RemoveCopy: () => removeCopy(model),
		Withdraw: ({ work }) =>
			andThen(sendAbout(model, work, "withdraw"), (next) => ({
				model: showToast(next, "Withdrew want"),
			})),
		Abandon: ({ grab }) =>
			andThen(sendGrabMove(model, grab, "abandon"), (next) => ({
				model: showToast(next, "Abandoned grab"),
			})),
		Release: ({ grab }) =>
			andThen(sendGrabMove(model, grab, "release"), (next) => ({
				model: showToast(next, "Released payload"),
			})),
		RevokeSession: ({ id }) => revokeSession(model, id),
		RevokeInvite: ({ id }) => revokeInvite(model, id),
		RemoveReader: ({ id }) => removeReader(model, id),
	});

const routed = (model: Model, url: Url): Return => {
	const next = urlToAppRoute(url);

	const prepared = modifyFields(model, {
		login: () => loginQueryOf(url),
		authForm: (form) =>
			next._tag === model.route._tag ? form : EMPTY_AUTH_FORM,
	});

	return andThen(route(prepared, next), guard);
};

const askWhoIsSignedIn = (model: Model): Return => ({
	model,
	commands: [FetchMe()],
});

const isSignedOutReason = (reason: string): boolean => reason === "SignedOut";

const isAuthPath = (pathname: string): boolean => pathname.startsWith("/auth/");

const updateAppearance = (model: Model, appearance: Appearance): Return => ({
	model: modifyFields(model, { appearance: () => appearance }),
	commands: [ApplyAppearance({ appearance })],
});

const workTitleOf = (model: Model, work: string): string =>
	Option.match(entryOf(model, work), {
		onNone: () => "Book",
		onSome: (entry) => entry.title,
	});

const startingAuth = (flags: Flags): AuthState =>
	Option.match(
		Option.filter(flags.reader, () => !flags.isOnline),
		{
			onNone: () => AuthState.Checking(),
			onSome: (user) => AuthState.SignedIn({ user, session: Option.none() }),
		}
	);

export const init = (flags: Flags, url: Url): Return =>
	andThen(
		routed(
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
				desk: {
					title: "",
					author: "",
					correcting: Option.none(),
					problem: Option.none(),
				},
				appearance: flags.appearance,
				systemDark: flags.systemDark,
				toast: Option.none(),
				confirm: Option.none(),
				announcement: "",
				shelfUi: {
					...DEFAULT_SHELF_UI,
					layout: flags.shelfLayout,
				},
				deskUi: DEFAULT_DESK_UI,
				auth: startingAuth(flags),
				savedReader: flags.reader,
				placesReader: Option.map(flags.reader, (user) => user.id),
			}),
			url
		),
		(model) => ({
			model,
			commands: model.isOnline ? [FetchMe()] : [],
		})
	);

export const update = (model: Model, message: Message): Return =>
	announced(model, handle(model, message));

const handle = (model: Model, message: Message): Return =>
	Message.match<Return>(message, {
		ClickedLink: ({ request }) =>
			Match.value(request).pipe(
				Match.tagsExhaustive({
					Internal: ({ url }) =>
						isAuthPath(url.pathname)
							? { model, commands: [Leave({ href: urlToString(url) })] }
							: { model, commands: [Navigate({ url: urlToString(url) })] },
					External: ({ href }) => ({ model, commands: [Leave({ href })] }),
				})
			),
		ChangedUrl: ({ url }) => {
			const hadConfirm = Option.isSome(model.confirm);

			const cleared = hadConfirm
				? modifyFields(model, { confirm: () => Option.none() })
				: model;

			const navigated = routed(cleared, url);

			if (!hadConfirm) {
				return navigated;
			}

			const existing = navigated.commands ?? [];

			return {
				model: navigated.model,
				commands: [CloseConfirmDialog(), ReleaseConfirmDialog(), ...existing],
			};
		},
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
			isSignedOutReason(reason)
				? recheck(model)
				: lostConnection(
						modifyFields(model, {
							hasAnswered: () => true,
							error: () => Option.some(reason),
						})
					),

		ReceivedPlace: ({ state }) => {
			const place = Option.flatMap(state, (s) => Option.fromNullishOr(s.place));

			const [known, saves] = Option.match(Option.product(model.room, place), {
				onNone: () => [model, []] as const,
				onSome: ([room, p]) => learnPlace(model, room.work, p),
			});

			return andThen({ model: known, commands: saves }, (next) =>
				inRoom(next, (room) =>
					room.knowsPlace
						? [
								{
									...room,
									knownPlace: place,
									elsewhere: Option.filter(place, (p) => isElsewhere(room, p)),
								},
								[],
							]
						: settle({
								...room,
								knowsPlace: true,
								knownPlace: placeOn(next, room.work),
							})
				)
			);
		},
		FailedWatchPlace: ({ reason }) =>
			andThen(
				isSignedOutReason(reason) ? recheck(model) : lostConnection(model),
				hearOwn
			),

		ReceivedNightstand: ({ state }) => ({
			model: modifyFields(model, { nightstand: () => state }),
		}),
		FailedWatchNightstand: ({ reason }) =>
			isSignedOutReason(reason) ? recheck(model) : lostConnection(model),

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

		FetchedSection: ({ work, path, html }) =>
			withRoom(model, work, (room) => [
				{
					...room,
					sections: { ...room.sections, [path]: Section.Fetched({ html }) },
				},
				Option.match(
					Option.filter(
						room.sentence,
						(sentence) => sectionOf(sentence) === path
					),
					{
						onNone: () => [],
						onSome: (sentence) => [Show({ id: spanOf(sentence) })],
					}
				),
			]),
		FailedFetchSection: ({ work, path, reason }) =>
			withRoom(model, work, (room) => [
				{
					...room,
					sections: {
						...room.sections,
						[path]: Section.Failed({ reason }),
					},
				},
				[],
			]),

		ClickedChapter: ({ index }) => toChapter(model, index),
		TurnedPage: ({ index }) => turnPage(model, index),
		ShowedPage: ({ index, at }) => showedPage(model, index, at),
		ClickedSkip: ({ seconds }) => skip(model, seconds),

		PressedSentence: ({ id, at }) =>
			keepIn(model, (room) =>
				Book.match<Option.Option<Kept>>(room.book, {
					Open: ({ contents }) => {
						const sentence = sentenceOf(
							contents.sections[room.shown]?.path ?? "",
							id
						);

						const [moved, commands] = goTo(room, sentence);

						return Option.some([
							moved,
							{ sentence, time: null, page: null },
							at,
							commands,
						] as const);
					},
					Opening: () => Option.none(),
					Unmade: () => Option.none(),
					Failed: () => Option.none(),
				})
			),
		ReadTo: ({ id, at }) => readTo(model, id, at),

		ClickedPlay: () => ({ model, commands: [Play()] }),
		ClickedPause: () => ({ model, commands: [Pause()] }),
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
		Stamped: ({ work, move, at }) =>
			andThen(sendMove(model, work, move, at), (next) => {
				if (move === "open") {
					return { model: next, commands: [] };
				}

				const title = workTitleOf(next, work);

				const notice =
					move === "finish"
						? `${title} marked finished.`
						: `${title} set aside.`;

				return {
					model: showToast(next, notice, {
						label: "Open again",
						href: roomRouter({ work }),
					}),
					commands: [CloseRoom()],
				};
			}),

		Played: () => played(model),
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
							Rejected: () => answered(model, commandId),
							Denied: () => recheck(model),
							Unknown: () => lostConnection(model),
						})
					),
				SucceededOpenBook: () =>
					inRoom(model, (room) => [{ ...room, hasOpened: true }, []]),
				FailedOpenBook: () => ({ model }),
				SucceededFinishBook: () => ({ model }),
				FailedFinishBook: () => ({ model }),
				SucceededSetAside: () => ({ model }),
				FailedSetAside: () => ({ model }),
				SucceededWantBook: () => ({ model }),
				FailedWantBook: ({ failure }) => deskFailed(model, failure),
				SucceededSearchAgain: () => ({ model }),
				FailedSearchAgain: ({ failure }) => deskFailed(model, failure),
				SucceededWithdrawWant: () => ({ model }),
				FailedWithdrawWant: ({ failure }) => deskFailed(model, failure),
				SucceededCorrectTitle: () => ({ model }),
				FailedCorrectTitle: ({ failure }) => deskFailed(model, failure),
				SucceededGrabRelease: () => ({ model }),
				FailedGrabRelease: ({ failure }) => deskFailed(model, failure),
				SucceededResumeGrab: () => ({ model }),
				FailedResumeGrab: ({ failure }) => deskFailed(model, failure),
				SucceededAbandonGrab: () => ({ model }),
				FailedAbandonGrab: ({ failure }) => deskFailed(model, failure),
				SucceededReleasePayload: () => ({ model }),
				FailedReleasePayload: ({ failure }) => deskFailed(model, failure),
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
		KeptCopy: ({ work, copy }) =>
			andThen(keptCopy(model, work, copy), (next) => ({
				model: showToast(next, `${copy.title} kept on this device`),
			})),
		FailedCopy: ({ work, reason }) =>
			changeCopying(model, work, (copying) => ({
				...copying,
				problem: reason,
			})),
		RemovedCopy: ({ work }) =>
			andThen(withoutCopy(model, work), (next) => ({
				model: showToast(next, "Removed from this device"),
			})),

		WentOnline: () =>
			andThen(
				{
					model: modifyFields(model, {
						isOnline: () => true,
						shelfUi: (ui) => ({ ...ui, showAllOffline: false }),
					}),
					commands: [FetchMe()],
				},
				reopen
			),
		WentOffline: () => ({
			model: modifyFields(model, { isOnline: () => false }),
		}),

		ReceivedWanted: ({ state }) => ({
			model: modifyFields(model, {
				wanted: () =>
					Option.orElseSome(state, () => ({
						wants: {},
						catalogue: {},
						grabs: {},
					})),
			}),
		}),
		FailedWatchWanted: ({ reason }) =>
			Match.value(reason).pipe(
				Match.when("Forbidden", () => askWhoIsSignedIn(model)),
				Match.when("SignedOut", () => recheck(model)),
				Match.orElse(() => lostConnection(model))
			),
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
		ClickedCorrect: ({ work }) => startCorrecting(model, work),
		ChangedCorrectTitle: ({ value }) => ({
			model: changeDesk(model, (desk) => ({
				...desk,
				correcting: Option.map(desk.correcting, (c) => ({
					...c,
					title: value,
				})),
			})),
		}),
		ChangedCorrectAuthor: ({ value }) => ({
			model: changeDesk(model, (desk) => ({
				...desk,
				correcting: Option.map(desk.correcting, (c) => ({
					...c,
					author: value,
				})),
			})),
		}),
		SubmittedCorrection: () => submitCorrection(model),
		ClickedCancelCorrection: () => cancelCorrecting(model),
		ClickedGrab: ({ work, release }) => sendGrab(model, work, release),
		ClickedGrabMove: ({ grab, move }) => sendGrabMove(model, grab, move),

		ChangedShelfQuery: (msg) => updateShelf(model, msg),
		ClearedShelfQuery: (msg) => updateShelf(model, msg),
		ClearedShelfFilters: (msg) => updateShelf(model, msg),
		ChangedShelfSort: (msg) => updateShelf(model, msg),
		SelectedShelfFilter: (msg) => updateShelf(model, msg),
		SelectedShelfLayout: (msg) => updateShelf(model, msg),
		ToggledOfflineAll: (msg) => updateShelf(model, msg),
		CompletedShelfAction: (msg) => updateShelf(model, msg),

		SelectedDeskTab: (msg) => updateDesk(model, msg),
		CompletedDeskAction: (msg) => updateDesk(model, msg),

		ToggledChrome: (msg) => updateRoom(model, msg),
		SetChromeHidden: (msg) => updateRoom(model, msg),
		OpenedPanel: (msg) => updateRoom(model, msg),
		ClosedPanels: (msg) => updateRoom(model, msg),
		ScrubbedAudio: (msg) => updateRoom(model, msg),
		CommittedScrub: (msg) => updateRoom(model, msg),
		SetSpeed: (msg) => updateRoom(model, msg),
		SetSleepTimer: (msg) => updateRoom(model, msg),
		SleepTimerFired: (msg) => updateRoom(model, msg),
		YieldedFollow: (msg) => updateRoom(model, msg),
		ClickedBackToPlaying: (msg) => updateRoom(model, msg),
		ClickedReturnChapter: (msg) => updateRoom(model, msg),
		JumpedToPage: (msg) => updateRoom(model, msg),
		CompletedRoomDom: (msg) => updateRoom(model, msg),
		SleepTimerTicked: (msg) => updateRoom(model, msg),
		PressedRoomKey: (msg) => updateRoom(model, msg),
		DismissedElsewhere: (msg) => updateRoom(model, msg),
		ClickedOpenAgain: (msg) => updateRoom(model, msg),

		ChangedAppearance: ({ appearance }) => updateAppearance(model, appearance),
		ResetAppearance: () => updateAppearance(model, DEFAULT_APPEARANCE),
		ChangedSystemTheme: ({ isDark }) => ({
			model: modifyFields(model, { systemDark: () => isDark }),
		}),
		SavedAppearance: () => ({ model }),

		RequestedConfirm: ({ action }) => ({
			model: modifyFields(model, { confirm: () => Option.some(action) }),
			commands: [OpenConfirmDialog()],
		}),
		ConfirmedAction: () =>
			Option.match(model.confirm, {
				onNone: () => ({ model }),
				onSome: (action) =>
					andThen(
						{
							model: modifyFields(model, { confirm: () => Option.none() }),
							commands: [CloseConfirmDialog()],
						},
						(next) => executeConfirm(next, action)
					),
			}),
		CancelledConfirm: () => ({
			model: modifyFields(model, { confirm: () => Option.none() }),
			commands: [CloseConfirmDialog()],
		}),
		CompletedDialog: () => ({ model }),
		CompletedCover: () => ({ model }),

		ShownToast: ({ message: text, action }) => ({
			model: showToast(model, text, Option.getOrUndefined(action)),
		}),
		PausedToast: () => ({
			model: modifyFields(model, {
				toast: (toast) => Option.map(toast, (t) => ({ ...t, paused: true })),
			}),
		}),
		ResumedToast: () => ({
			model: modifyFields(model, {
				toast: (toast) => Option.map(toast, (t) => ({ ...t, paused: false })),
			}),
		}),
		DismissedToast: () => ({
			model: modifyFields(model, { toast: () => Option.none() }),
		}),
		AnnouncedStatus: ({ text }) => ({
			model: modifyFields(model, { announcement: () => text }),
		}),

		ReceivedMe: (msg) => updateAuth(model, msg),
		FailedMe: (msg) => updateAuth(model, msg),
		LoadedPlaces: (msg) => updateAuth(model, msg),
		SavedReader: (msg) => updateAuth(model, msg),
		ChangedAuthField: (msg) => updateAuth(model, msg),
		SubmittedLogin: (msg) => updateAuth(model, msg),
		SubmittedSetup: (msg) => updateAuth(model, msg),
		SubmittedRegister: (msg) => updateAuth(model, msg),
		FailedAuthForm: (msg) => updateAuth(model, msg),
		CheckedInvite: (msg) => updateAuth(model, msg),
		FailedInvite: (msg) => updateAuth(model, msg),
		ClickedSignOut: (msg) => updateAuth(model, msg),
		FailedSignOut: (msg) => updateAuth(model, msg),

		ReceivedSessions: (msg) => updateAccount(model, msg),
		ReceivedInvites: (msg) => updateAccount(model, msg),
		ReceivedUsers: (msg) => updateAccount(model, msg),
		FailedAccount: (msg) => updateAccount(model, msg),
		ChangedDeviceName: (msg) => updateAccount(model, msg),
		SubmittedDeviceName: (msg) => updateAccount(model, msg),
		RenamedDevice: (msg) => updateAccount(model, msg),
		SelectedInviteRole: (msg) => updateAccount(model, msg),
		ChangedInviteNote: (msg) => updateAccount(model, msg),
		SubmittedInvite: (msg) => updateAccount(model, msg),
		CreatedInvite: (msg) => updateAccount(model, msg),
		ClickedCopyInvite: (msg) => updateAccount(model, msg),
		CopiedInvite: (msg) => updateAccount(model, msg),
		ClickedChangeRole: (msg) => updateAccount(model, msg),
		ChangedRole: (msg) => updateAccount(model, msg),
		RevokedSession: (msg) => updateAccount(model, msg),
		RevokedInvite: (msg) => updateAccount(model, msg),
		RemovedReader: (msg) => updateAccount(model, msg),
	});

const NO_ROOM = WorkId.make("w-none");

const NO_READER = ReaderId.make(NO_READER_ID);

const readerKeyOf = (model: Model): ReaderId =>
	Option.getOrElse(readerIn(model), () => NO_READER);

export const isWatching = (model: Model): boolean =>
	model.isOnline && isSignedIn(model);

export const canWatchWanted = (model: Model): boolean =>
	model.isOnline && isAdmin(model) && AppRoute.guards.Desk(model.route);

const coreSubscriptions = Subscription.make<Model, Message, Reader>()(
	(entry) => ({
		network: entry(
			{},
			{
				modelToDependencies: () => ({}),
				dependenciesToStream: () => networkChanges,
			}
		),
		systemTheme: Subscription.persistentEntry(
			Dom.streamFromMediaQuery({
				query: "(prefers-color-scheme: dark)",
				mapMatches: (isDark) => Message.ChangedSystemTheme({ isDark }),
			})
		),
		toastTimer: entry(
			{ id: Schema.Option(Schema.Int), paused: Schema.Boolean },
			{
				modelToDependencies: (model) => ({
					id: Option.map(model.toast, (toast) => toast.id),
					paused: Option.exists(model.toast, (toast) => toast.paused),
				}),
				dependenciesToStream: ({ id, paused }) =>
					Option.isNone(id) || paused
						? Stream.empty
						: Stream.fromEffect(
								Effect.sleep(TOAST_DURATION).pipe(
									Effect.as(Message.DismissedToast())
								)
							),
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
			isEnabled: isWatching,
			toMessage: (snapshot): Message => Message.ReceivedShelf(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchShelf({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchShelf({ reason: "The connection failed" }),
		}),
		nightstand: Prosody.Nightstand.watch({
			key: readerKeyOf,
			isEnabled: isWatching,
			toMessage: (snapshot): Message => Message.ReceivedNightstand(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchNightstand({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchNightstand({ reason: "The connection failed" }),
		}),
		wanted: Prosody.Wanted.watch({
			key: () => SHELF,
			isEnabled: canWatchWanted,
			toMessage: (snapshot): Message => Message.ReceivedWanted(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchWanted({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchWanted({ reason: "The connection failed" }),
		}),
		place: Prosody.Place.watch({
			key: (model: Model) =>
				readingOf(
					readerKeyOf(model),
					Option.match(model.room, {
						onNone: () => NO_ROOM,
						onSome: (room) => WorkId.make(room.work),
					})
				),
			isEnabled: (model: Model) =>
				isWatching(model) && Option.isSome(model.room),
			toMessage: (snapshot): Message => Message.ReceivedPlace(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchPlace({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchPlace({ reason: "The connection failed" }),
		}),
	})
);

export const subscriptions: Subscription.Subscriptions<Model, Message, Reader> =
	Subscription.aggregate<Model, Message, Reader>()(
		coreSubscriptions,
		shelfSubscriptions,
		roomSubscriptions
	);

const inShell = (
	model: Model,
	active: NavDestination,
	narrow: boolean,
	doc: Document,
	h: HtmlBuilder<Message>
): Document => ({
	...doc,
	body: shellView(model, active, narrow, [doc.body], h),
});

const routedView = (model: Model, h: HtmlBuilder<Message>): Document =>
	AppRoute.match<Document>(model.route, {
		Shelf: () => inShell(model, "shelf", false, shelfView(model, h), h),
		Desk: () => inShell(model, "desk", true, deskView(model, h), h),
		Account: () => inShell(model, "account", true, accountView(model, h), h),
		NotFound: ({ path }) =>
			inShell(model, "none", false, notFoundView(path, h), h),
		Login: () => checkingView(model, h),
		Setup: () => checkingView(model, h),
		Invite: () => inviteView(model, h),
		Room: () =>
			Option.match(model.room, {
				onNone: () => inShell(model, "shelf", false, shelfView(model, h), h),
				onSome: (room) => roomView(model, room, h),
			}),
	});

const isKeptOffline = (model: Model): boolean =>
	!model.isOnline &&
	AppRoute.guards.Room(model.route) &&
	model.copies[model.route.work] !== undefined;

const signedOutView = (
	model: Model,
	signedOut: typeof AuthState.SignedOut.Type,
	h: HtmlBuilder<Message>
): Document => {
	const askSignIn = () =>
		signedOut.setupRequired
			? setupView(model, h)
			: loginView(model, signedOut, signInRedirect(model), h);

	return AppRoute.match<Document>(model.route, {
		Login: askSignIn,
		Setup: () => setupView(model, h),
		Invite: () => inviteView(model, h),
		NotFound: () => routedView(model, h),
		Room: () => (isKeptOffline(model) ? routedView(model, h) : askSignIn()),
		Shelf: askSignIn,
		Desk: askSignIn,
		Account: askSignIn,
	});
};

const pageView = (model: Model, h: HtmlBuilder<Message>): Document =>
	AuthState.match<Document>(model.auth, {
		Checking: () =>
			model.isOnline ? checkingView(model, h) : routedView(model, h),
		SignedOut: (signedOut) => signedOutView(model, signedOut, h),
		SignedIn: () => routedView(model, h),
	});

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
	const page = pageView(model, h);

	return {
		...page,
		body: h.div(
			[],
			[
				page.body,
				confirmDialogView(model, h),
				toastView(model, h),
				liveRegionView(model, h),
			]
		),
	};
};
