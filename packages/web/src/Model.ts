import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { Wanted } from "@prosody/domain/Acquisition/Wanted.view";
import { Shelf } from "@prosody/domain/Library/Shelf.view";
import { ReaderId, Role } from "@prosody/domain/Reader.id";
import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Nightstand } from "@prosody/domain/Reading/Nightstand.view";
import { KeptPlace, PlaceAt, Sentence } from "@prosody/domain/Reading/Sentence";
import { Effect, Option, Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { defineTaggedUnion } from "foldkit/schema";
import { Url } from "foldkit/url";

import { Appearance, DEFAULT_SHELF_LAYOUT, ShelfLayout } from "./Appearance.ts";
import { Prosody } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";

export const AuthUser = Schema.Struct({
	id: ReaderId,
	username: Schema.String,
	displayName: Schema.String,
	role: Role,
	createdAt: Schema.Finite,
});

export type AuthUser = typeof AuthUser.Type;

export const AuthSession = Schema.Struct({
	id: Schema.String,
	deviceName: Schema.String,
	createdAt: Schema.Finite,
	lastSeenAt: Schema.Finite,
	expiresAt: Schema.Finite,
	current: Schema.Boolean,
});

export type AuthSession = typeof AuthSession.Type;

export const Invite = Schema.Struct({
	id: Schema.String,
	role: Role,
	note: Schema.String,
	createdBy: Schema.String,
	createdAt: Schema.Finite,
	expiresAt: Schema.Finite,
});

export type Invite = typeof Invite.Type;

export const SingleSignOn = Schema.Struct({ displayName: Schema.String });

export type SingleSignOn = typeof SingleSignOn.Type;

export const AuthState = defineTaggedUnion({
	Checking: {},
	SignedOut: {
		setupRequired: Schema.Boolean,
		localAuth: Schema.Boolean,
		oidc: Schema.Option(SingleSignOn),
	},
	SignedIn: { user: AuthUser, session: Schema.Option(AuthSession) },
});

export type AuthState = typeof AuthState.Type;

export const AuthField = Schema.Literals([
	"displayName",
	"username",
	"password",
]);

export type AuthField = typeof AuthField.Type;

export const AuthForm = Schema.Struct({
	displayName: Schema.String,
	username: Schema.String,
	password: Schema.String,
	isSubmitting: Schema.Boolean,
	problem: Schema.Option(Schema.String),
});

export type AuthForm = typeof AuthForm.Type;

export const EMPTY_AUTH_FORM: AuthForm = AuthForm.make({
	displayName: "",
	username: "",
	password: "",
	isSubmitting: false,
	problem: Option.none(),
});

export const LoginQuery = Schema.Struct({
	redirect: Schema.String,
	ssoFailed: Schema.Boolean,
});

export type LoginQuery = typeof LoginQuery.Type;

export const InviteCheck = defineTaggedUnion({
	Idle: {},
	Checking: { token: Schema.String },
	Valid: {
		token: Schema.String,
		role: Role,
		expiresAt: Schema.Finite,
		localAuth: Schema.Boolean,
	},
	Invalid: { token: Schema.String, reason: Schema.String },
});

export type InviteCheck = typeof InviteCheck.Type;

export const Account = Schema.Struct({
	sessions: Schema.Option(Schema.Array(AuthSession)),
	invites: Schema.Option(Schema.Array(Invite)),
	users: Schema.Option(Schema.Array(AuthUser)),
	deviceName: Schema.Option(Schema.String),
	inviteRole: Role,
	inviteNote: Schema.String,
	created: Schema.Option(Schema.String),
	isCreating: Schema.Boolean,
	problem: Schema.Option(Schema.String),
});

export type Account = typeof Account.Type;

export const EMPTY_ACCOUNT: Account = Account.make({
	sessions: Option.none(),
	invites: Option.none(),
	users: Option.none(),
	deviceName: Option.none(),
	inviteRole: "reader",
	inviteNote: "",
	created: Option.none(),
	isCreating: false,
	problem: Option.none(),
});

export const DevicePlace = Schema.Struct({
	...PlaceAt.fields,
	commandId: Schema.NullOr(Schema.String),
});

export type DevicePlace = typeof DevicePlace.Type;

export const Places = Schema.Record(Schema.String, DevicePlace);

export type Places = typeof Places.Type;

export const DeviceCopy = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	bytes: Schema.Int,
});

export type DeviceCopy = typeof DeviceCopy.Type;

export const DeviceCopies = Schema.Record(Schema.String, DeviceCopy);

export type DeviceCopies = typeof DeviceCopies.Type;

export const Copying = Schema.Struct({
	work: Schema.String,
	title: Schema.String,
	author: Schema.String,
	done: Schema.Int,
	of: Schema.Int,
	problem: Schema.NullOr(Schema.String),
});

export type Copying = typeof Copying.Type;

export const ShelfSort = Schema.Literals(["recent", "author", "title"]);

export type ShelfSort = typeof ShelfSort.Type;

export const ShelfFilter = Schema.Literals([
	"all",
	"synced",
	"text",
	"audio",
	"pages",
	"kept",
	"finished",
	"attention",
]);

export type ShelfFilter = typeof ShelfFilter.Type;

export const ShelfUi = Schema.Struct({
	query: Schema.String,
	sort: ShelfSort,
	filter: ShelfFilter,
	layout: ShelfLayout,
	showAllOffline: Schema.Boolean,
});

export type ShelfUi = typeof ShelfUi.Type;

export const DEFAULT_SHELF_UI: ShelfUi = ShelfUi.make({
	query: "",
	sort: "recent",
	filter: "all",
	layout: DEFAULT_SHELF_LAYOUT,
	showAllOffline: false,
});

export const DeskTab = Schema.Literals(["wants", "grabs"]);

export type DeskTab = typeof DeskTab.Type;

export const DeskUi = Schema.Struct({
	tab: DeskTab,
});

export type DeskUi = typeof DeskUi.Type;

export const DEFAULT_DESK_UI: DeskUi = DeskUi.make({
	tab: "wants",
});

export const RoomPanel = Schema.Literals([
	"toc",
	"player",
	"aa",
	"menu",
	"speed",
	"sleep",
	"jump",
]);

export type RoomPanel = typeof RoomPanel.Type;

export const RoomKey = Schema.Literals([
	"Space",
	"Escape",
	"ArrowLeft",
	"ArrowRight",
	"PageUp",
	"PageDown",
	"T",
	"BracketLeft",
	"BracketRight",
	"Comma",
	"Period",
	"F",
	"Minus",
	"Equal",
	"Zero",
	"G",
]);

export type RoomKey = typeof RoomKey.Type;

export const ToastAction = Schema.Struct({
	label: Schema.String,
	href: Schema.String,
});

export type ToastAction = typeof ToastAction.Type;

export const Toast = Schema.Struct({
	id: Schema.Int,
	message: Schema.String,
	action: Schema.Option(ToastAction),
	paused: Schema.Boolean,
});

export type Toast = typeof Toast.Type;

export const ConfirmAction = defineTaggedUnion({
	Realign: { work: Schema.String, title: Schema.String },
	RemoveCopy: { work: Schema.String, title: Schema.String, bytes: Schema.Int },
	Withdraw: { work: Schema.String, title: Schema.String },
	Abandon: { grab: Schema.String, title: Schema.String },
	Release: { grab: Schema.String, title: Schema.String },
	RevokeSession: { id: Schema.String, deviceName: Schema.String },
	RevokeInvite: { id: Schema.String, role: Role },
	RemoveReader: { id: Schema.String, displayName: Schema.String },
});

export type ConfirmAction = typeof ConfirmAction.Type;

export const Flags = Schema.Struct({
	session: Schema.String,
	isOnline: Schema.Boolean,
	reader: Schema.Option(AuthUser),
	places: Places,
	copies: DeviceCopies,
	appearance: Appearance,
	shelfLayout: ShelfLayout,
	systemDark: Schema.Boolean,
});

export type Flags = typeof Flags.Type;

export const ShelfState = Shelf.definition.state ?? Schema.Never;

export const NightstandState = Nightstand.definition.state ?? Schema.Never;

export const WantedState = Wanted.definition.state ?? Schema.Never;

export const Correction = Schema.Struct({
	work: Schema.String,
	title: Schema.String,
	author: Schema.String,
});

export type Correction = typeof Correction.Type;

export const Desk = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	correcting: Schema.Option(Correction),
	problem: Schema.Option(Schema.String),
});

export type Desk = typeof Desk.Type;

export const GrabMove = Schema.Literals(["resume", "abandon", "release"]);

export type GrabMove = typeof GrabMove.Type;

export const Move = Schema.Literals(["open", "finish", "setAside"]);

export type Move = typeof Move.Type;

export const Book = defineTaggedUnion({
	Opening: {},
	Open: { contents: Contents, timeline: Timeline },
	Unmade: { phase: Schema.Literals(["idle", "asked", "aligning"]) },
	Failed: { reason: Schema.String },
});

export type Book = typeof Book.Type;

export const Section = defineTaggedUnion({
	Fetching: {},
	Fetched: { html: Schema.String },
	Failed: { reason: Schema.String },
});

export type Section = typeof Section.Type;

export const Room = Schema.Struct({
	work: Schema.String,
	book: Book,
	sections: Schema.Record(Schema.String, Section),
	shown: Schema.Int,
	sentence: Schema.Option(Sentence),
	knowsPlace: Schema.Boolean,
	knownPlace: Schema.Option(PlaceAt),
	hasOpened: Schema.Boolean,
	time: Schema.Finite,
	isPlaying: Schema.Boolean,
	rate: Schema.Finite,
	kept: Schema.Option(PlaceAt),
	isKeptHere: Schema.Boolean,
	elsewhere: Schema.Option(KeptPlace),
	isFollowing: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(true))
	),
	chromeHidden: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(false))
	),
	openPanel: Schema.Option(RoomPanel).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	returnToPlayerSheet: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(false))
	),
	returnChapter: Schema.Option(Schema.Int).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	sleepEndsAt: Schema.Option(Schema.Finite).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	sleepEndOfChapter: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(false))
	),
	scrubbingTime: Schema.Option(Schema.Finite).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	sleepMinutes: Schema.Option(Schema.Int).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	sleepLeft: Schema.Option(Schema.Int).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
});

export type Room = typeof Room.Type;

export const Model = Schema.Struct({
	route: AppRoute,
	commandIds: DomainFoldkit.CommandIds,
	isOnline: Schema.Boolean,
	places: Places,
	copies: DeviceCopies,
	copying: Schema.Option(Copying),
	shelf: Schema.Option(ShelfState),
	hasAnswered: Schema.Boolean,
	error: Schema.Option(Schema.String),
	nightstand: Schema.Option(NightstandState),
	room: Schema.Option(Room),
	wanted: Schema.Option(WantedState),
	desk: Desk,
	appearance: Appearance,
	systemDark: Schema.Boolean,
	toast: Schema.Option(Toast),
	confirm: Schema.Option(ConfirmAction),
	announcement: Schema.String,
	shelfUi: ShelfUi,
	deskUi: DeskUi,
	auth: AuthState.pipe(
		Schema.withConstructorDefault(Effect.succeed(AuthState.Checking()))
	),
	savedReader: Schema.Option(AuthUser).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	placesReader: Schema.Option(ReaderId).pipe(
		Schema.withConstructorDefault(Effect.succeedNone)
	),
	socketStale: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(false))
	),
	login: LoginQuery.pipe(
		Schema.withConstructorDefault(
			Effect.succeed(LoginQuery.make({ redirect: "/", ssoFailed: false }))
		)
	),
	authForm: AuthForm.pipe(
		Schema.withConstructorDefault(Effect.succeed(EMPTY_AUTH_FORM))
	),
	invite: InviteCheck.pipe(
		Schema.withConstructorDefault(Effect.succeed(InviteCheck.Idle()))
	),
	account: Account.pipe(
		Schema.withConstructorDefault(Effect.succeed(EMPTY_ACCOUNT))
	),
});

export type Model = typeof Model.Type;

export const Me = Schema.Struct({
	user: Schema.Option(AuthUser),
	session: Schema.Option(AuthSession),
	setupRequired: Schema.Boolean,
	localAuth: Schema.Boolean,
	oidc: Schema.Option(SingleSignOn),
});

export type Me = typeof Me.Type;

export const Message = defineMessageUnion({
	ClickedLink: { request: UrlRequest },
	ChangedUrl: { url: Url },
	CompletedNavigate: {},
	ReceivedShelf: { state: Schema.Option(ShelfState), cursor: Schema.Finite },
	FailedWatchShelf: { reason: Schema.String },
	ReceivedPlace: {
		state: Schema.Option(Schema.Struct({ place: Schema.NullOr(KeptPlace) })),
		cursor: Schema.Finite,
	},
	FailedWatchPlace: { reason: Schema.String },
	ReceivedNightstand: {
		state: Schema.Option(NightstandState),
		cursor: Schema.Finite,
	},
	FailedWatchNightstand: { reason: Schema.String },
	OpenedCopy: { work: Schema.String, contents: Contents, timeline: Timeline },
	FoundUnmade: { work: Schema.String },
	FailedOpenCopy: { work: Schema.String, reason: Schema.String },
	WaitedForPlace: { work: Schema.String },
	FetchedSection: {
		work: Schema.String,
		path: Schema.String,
		html: Schema.String,
	},
	FailedFetchSection: {
		work: Schema.String,
		path: Schema.String,
		reason: Schema.String,
	},
	ClickedChapter: { index: Schema.Int },
	TurnedPage: { index: Schema.Int },
	ShowedPage: { index: Schema.Int, at: Schema.Int },
	ClickedSkip: { seconds: Schema.Finite },
	PressedSentence: { id: Schema.String, at: Schema.Int },
	ReadTo: { id: Schema.String, at: Schema.Int },
	ClickedPlay: {},
	ClickedPause: {},
	ClickedElsewhere: {},
	ClickedRealign: {},
	ClickedFinish: {},
	ClickedSetAside: {},
	Stamped: { work: Schema.String, move: Move, at: Schema.Int },
	Played: {},
	Paused: { time: Schema.Finite, at: Schema.Int },
	Ticked: { time: Schema.Finite, at: Schema.Int },
	CompletedPlayer: {},
	CompletedShow: {},
	ReceivedResult: { result: Prosody.Message },
	SavedPlaces: {},
	ClickedKeepCopy: {},
	ClickedStopCopy: {},
	ClickedRemoveCopy: {},
	CopiedPart: { work: Schema.String, done: Schema.Int, of: Schema.Int },
	KeptCopy: { work: Schema.String, copy: DeviceCopy },
	FailedCopy: { work: Schema.String, reason: Schema.String },
	RemovedCopy: { work: Schema.String },
	WentOnline: {},
	WentOffline: {},
	ReceivedWanted: {
		state: Schema.Option(WantedState),
		cursor: Schema.Finite,
	},
	FailedWatchWanted: { reason: Schema.String },
	ChangedWantTitle: { value: Schema.String },
	ChangedWantAuthor: { value: Schema.String },
	SubmittedWant: {},
	MintedWork: {
		work: Schema.String,
		title: Schema.String,
		author: Schema.String,
	},
	ClickedSearchAgain: { work: Schema.String },
	ClickedWithdraw: { work: Schema.String },
	ClickedCorrect: { work: Schema.String },
	ChangedCorrectTitle: { value: Schema.String },
	ChangedCorrectAuthor: { value: Schema.String },
	SubmittedCorrection: {},
	ClickedCancelCorrection: {},
	ClickedGrab: { work: Schema.String, release: Schema.String },
	ClickedGrabMove: { grab: Schema.String, move: GrabMove },
	ChangedShelfQuery: { value: Schema.String },
	ClearedShelfQuery: {},
	ClearedShelfFilters: {},
	ChangedShelfSort: { sort: ShelfSort },
	SelectedShelfFilter: { filter: ShelfFilter },
	SelectedShelfLayout: { layout: ShelfLayout },
	ToggledOfflineAll: {},
	CompletedShelfAction: {},
	SelectedDeskTab: { tab: DeskTab },
	CompletedDeskAction: {},
	ToggledChrome: {},
	SetChromeHidden: { hidden: Schema.Boolean },
	OpenedPanel: { panel: RoomPanel, fromPlayerSheet: Schema.Boolean },
	ClosedPanels: {},
	ScrubbedAudio: { time: Schema.Finite },
	CommittedScrub: { time: Schema.Finite, at: Schema.Int },
	SetSpeed: { rate: Schema.Finite },
	SetSleepTimer: {
		minutes: Schema.Option(Schema.Int),
		endOfChapter: Schema.Boolean,
	},
	SleepTimerFired: {},
	SleepTimerTicked: { now: Schema.Finite },
	YieldedFollow: {},
	ClickedBackToPlaying: {},
	ClickedReturnChapter: {},
	JumpedToPage: { page: Schema.Int },
	CompletedRoomDom: {},
	PressedRoomKey: { key: RoomKey },
	DismissedElsewhere: {},
	ClickedOpenAgain: {},
	ChangedAppearance: { appearance: Appearance },
	ResetAppearance: {},
	ChangedSystemTheme: { isDark: Schema.Boolean },
	SavedAppearance: {},
	RequestedConfirm: { action: ConfirmAction },
	ConfirmedAction: {},
	CancelledConfirm: {},
	CompletedDialog: {},
	CompletedCover: {},
	ShownToast: {
		message: Schema.String,
		action: Schema.Option(ToastAction),
	},
	PausedToast: {},
	ResumedToast: {},
	DismissedToast: {},
	AnnouncedStatus: { text: Schema.String },
	ReceivedMe: { me: Me },
	FailedMe: { reason: Schema.String },
	LoadedPlaces: { reader: ReaderId, places: Places },
	SavedReader: {},
	ChangedAuthField: { field: AuthField, value: Schema.String },
	SubmittedLogin: {},
	SubmittedSetup: {},
	SubmittedRegister: {},
	FailedAuthForm: { reason: Schema.String },
	CheckedInvite: {
		token: Schema.String,
		role: Role,
		expiresAt: Schema.Finite,
		localAuth: Schema.Boolean,
	},
	FailedInvite: { token: Schema.String, reason: Schema.String },
	ClickedSignOut: {},
	FailedSignOut: { reason: Schema.String },
	ReceivedSessions: { sessions: Schema.Array(AuthSession) },
	ReceivedInvites: { invites: Schema.Array(Invite) },
	ReceivedUsers: { users: Schema.Array(AuthUser) },
	FailedAccount: { reason: Schema.String },
	ChangedDeviceName: { value: Schema.String },
	SubmittedDeviceName: {},
	RenamedDevice: { session: AuthSession },
	SelectedInviteRole: { role: Role },
	ChangedInviteNote: { value: Schema.String },
	SubmittedInvite: {},
	CreatedInvite: { invite: Invite, url: Schema.String },
	ClickedCopyInvite: { url: Schema.String },
	CopiedInvite: { isCopied: Schema.Boolean },
	ClickedChangeRole: { id: Schema.String, role: Role },
	ChangedRole: { user: AuthUser },
	RevokedSession: { id: Schema.String },
	RevokedInvite: { id: Schema.String },
	RemovedReader: { id: Schema.String },
});

export type Message = typeof Message.Type;

export type ShelfMessage =
	| typeof Message.ChangedShelfQuery.Type
	| typeof Message.ClearedShelfQuery.Type
	| typeof Message.ClearedShelfFilters.Type
	| typeof Message.ChangedShelfSort.Type
	| typeof Message.SelectedShelfFilter.Type
	| typeof Message.SelectedShelfLayout.Type
	| typeof Message.ToggledOfflineAll.Type
	| typeof Message.CompletedShelfAction.Type;

export type DeskMessage =
	| typeof Message.SelectedDeskTab.Type
	| typeof Message.CompletedDeskAction.Type;

export type RoomMessage =
	| typeof Message.ToggledChrome.Type
	| typeof Message.SetChromeHidden.Type
	| typeof Message.OpenedPanel.Type
	| typeof Message.ClosedPanels.Type
	| typeof Message.ScrubbedAudio.Type
	| typeof Message.CommittedScrub.Type
	| typeof Message.SetSpeed.Type
	| typeof Message.SetSleepTimer.Type
	| typeof Message.SleepTimerFired.Type
	| typeof Message.YieldedFollow.Type
	| typeof Message.ClickedBackToPlaying.Type
	| typeof Message.ClickedReturnChapter.Type
	| typeof Message.JumpedToPage.Type
	| typeof Message.CompletedRoomDom.Type
	| typeof Message.SleepTimerTicked.Type
	| typeof Message.PressedRoomKey.Type
	| typeof Message.DismissedElsewhere.Type
	| typeof Message.ClickedOpenAgain.Type;

export type AuthMessage =
	| typeof Message.ReceivedMe.Type
	| typeof Message.FailedMe.Type
	| typeof Message.LoadedPlaces.Type
	| typeof Message.SavedReader.Type
	| typeof Message.ChangedAuthField.Type
	| typeof Message.SubmittedLogin.Type
	| typeof Message.SubmittedSetup.Type
	| typeof Message.SubmittedRegister.Type
	| typeof Message.FailedAuthForm.Type
	| typeof Message.CheckedInvite.Type
	| typeof Message.FailedInvite.Type
	| typeof Message.ClickedSignOut.Type
	| typeof Message.FailedSignOut.Type;

export type AccountMessage =
	| typeof Message.ReceivedSessions.Type
	| typeof Message.ReceivedInvites.Type
	| typeof Message.ReceivedUsers.Type
	| typeof Message.FailedAccount.Type
	| typeof Message.ChangedDeviceName.Type
	| typeof Message.SubmittedDeviceName.Type
	| typeof Message.RenamedDevice.Type
	| typeof Message.SelectedInviteRole.Type
	| typeof Message.ChangedInviteNote.Type
	| typeof Message.SubmittedInvite.Type
	| typeof Message.CreatedInvite.Type
	| typeof Message.ClickedCopyInvite.Type
	| typeof Message.CopiedInvite.Type
	| typeof Message.ClickedChangeRole.Type
	| typeof Message.ChangedRole.Type
	| typeof Message.RevokedSession.Type
	| typeof Message.RevokedInvite.Type
	| typeof Message.RemovedReader.Type;
