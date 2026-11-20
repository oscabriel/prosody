import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { Wanted } from "@prosody/domain/Acquisition/Wanted.view";
import { Shelf } from "@prosody/domain/Library/Shelf.view";
import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Nightstand } from "@prosody/domain/Reading/Nightstand.view";
import { Bookmark, Position, Sentence } from "@prosody/domain/Reading/Sentence";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { defineTaggedUnion } from "foldkit/schema";
import { Url } from "foldkit/url";

import { Prosody } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";

// FLAGS

/**
 * Your place in a work as this device knows it: the newer of the last it kept and the last it heard
 * from the model. A place kept here carries the command that sends it until the model answers.
 */
export const DevicePlace = Schema.Struct({
	...Position.fields,
	commandId: Schema.NullOr(Schema.String),
});

export type DevicePlace = typeof DevicePlace.Type;

/** Your places on this device, by work id. They are kept between visits, so they outlast a reload. */
export const Places = Schema.Record(Schema.String, DevicePlace);

export type Places = typeof Places.Type;

/** A work's reading copy kept whole on this device, as its record there says. */
export const DeviceCopy = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	/** The size of its audio, by far the most of it. */
	bytes: Schema.Int,
});

export type DeviceCopy = typeof DeviceCopy.Type;

/** The copies kept whole on this device, by work id. */
export const DeviceCopies = Schema.Record(Schema.String, DeviceCopy);

export type DeviceCopies = typeof DeviceCopies.Type;

/** A copy on its way to the device: how much of its audio has come, or why it stopped. */
export const Copying = Schema.Struct({
	work: Schema.String,
	title: Schema.String,
	author: Schema.String,
	done: Schema.Int,
	of: Schema.Int,
	problem: Schema.NullOr(Schema.String),
});

export type Copying = typeof Copying.Type;

/**
 * What the page brings with it: a fresh session for command ids, whether the browser thinks it is
 * online, and what an earlier visit kept on this device: places, and whole copies.
 */
export const Flags = Schema.Struct({
	session: Schema.String,
	isOnline: Schema.Boolean,
	places: Places,
	copies: DeviceCopies,
});

export type Flags = typeof Flags.Type;

// MODEL

/** The shelf as the model keeps it: every work by id. */
export const ShelfState = Shelf.definition.state ?? Schema.Never;

/** The nightstand as the model keeps it: every work you have begun, by id. */
export const NightstandState = Nightstand.definition.state ?? Schema.Never;

/** The books you want as the model keeps them, by work id, with what the catalogues say of each. */
export const WantedState = Wanted.definition.state ?? Schema.Never;

/** The desk's form for a book you want, and why the last thing asked of it was not done. */
export const Desk = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	problem: Schema.Option(Schema.String),
});

export type Desk = typeof Desk.Type;

/** What you can do with a work on the nightstand. */
export const Move = Schema.Literals(["open", "finish", "setAside"]);

export type Move = typeof Move.Type;

/** A reading copy as the reading room loads it. */
export const Book = defineTaggedUnion({
	Opening: {},
	Open: { contents: Contents, timeline: Timeline },
	/**
	 * The copy is not there to open: made before the reading room, not made yet, or failed. Asking
	 * the press makes it again: `asked` until the model takes the request, then `aligning` until the
	 * shelf says the press is done.
	 */
	Unmade: { phase: Schema.Literals(["idle", "asked", "aligning"]) },
	Failed: { reason: Schema.String },
});

export type Book = typeof Book.Type;

/** One page of a reading copy, as the reading room fetches it. */
export const Page = defineTaggedUnion({
	Fetching: {},
	Fetched: { html: Schema.String },
	Failed: { reason: Schema.String },
});

export type Page = typeof Page.Type;

/** The reading room of one work. */
export const Room = Schema.Struct({
	work: Schema.String,
	book: Book,
	/** The pages fetched so far, by path. */
	pages: Schema.Record(Schema.String, Page),
	/** The page on show, as an index into the contents. */
	shown: Schema.Int,
	/** Your place here: the sentence underlined. None until the model has said where you were. */
	sentence: Schema.Option(Sentence),
	/**
	 * Whether the Place view has answered yet, and the place it last gave. With no connection, the
	 * device's own place stands in for its answer.
	 */
	hasHeardPlace: Schema.Boolean,
	heardPlace: Schema.Option(Position),
	/** Whether the model has answered this visit's open. Until it has, coming back online sends it again. */
	hasOpened: Schema.Boolean,
	/** Where the audio is, in seconds, and whether it plays. */
	time: Schema.Finite,
	isPlaying: Schema.Boolean,
	rate: Schema.Finite,
	/** The last place this page kept. */
	kept: Schema.Option(Position),
	/** Whether the audio plays from the copy on this device. Chosen as the room opens, never under it. */
	isKeptHere: Schema.Boolean,
	/** A newer place kept elsewhere, offered rather than taken while you are here. */
	elsewhere: Schema.Option(Bookmark),
});

export type Room = typeof Room.Type;

export const Model = Schema.Struct({
	route: AppRoute,
	commandIds: DomainFoldkit.CommandIds,
	/** Whether the model can be reached, as far as the page knows. The live reads run only then. */
	isOnline: Schema.Boolean,
	places: Places,
	copies: DeviceCopies,
	copying: Schema.Option(Copying),
	/** None until the model first answers. */
	shelf: Schema.Option(ShelfState),
	hasAnswered: Schema.Boolean,
	error: Schema.Option(Schema.String),
	/** None until the model first answers. */
	nightstand: Schema.Option(NightstandState),
	room: Schema.Option(Room),
	/** None until the model first answers, which it does only while the desk is open. */
	wanted: Schema.Option(WantedState),
	desk: Desk,
});

export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
	ClickedLink: { request: UrlRequest },
	ChangedUrl: { url: Url },
	CompletedNavigate: {},
	ReceivedShelf: { state: Schema.Option(ShelfState), cursor: Schema.Finite },
	FailedWatchShelf: { reason: Schema.String },
	ReceivedPlace: {
		state: Schema.Option(Schema.Struct({ place: Schema.NullOr(Bookmark) })),
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
	FetchedPage: {
		work: Schema.String,
		path: Schema.String,
		html: Schema.String,
	},
	FailedFetchPage: {
		work: Schema.String,
		path: Schema.String,
		reason: Schema.String,
	},
	ClickedChapter: { index: Schema.Int },
	ClickedSkip: { seconds: Schema.Finite },
	PressedSentence: { id: Schema.String, at: Schema.Int },
	ReadTo: { id: Schema.String, at: Schema.Int },
	ClickedPlay: {},
	ClickedPause: {},
	ClickedRate: {},
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
});

export type Message = typeof Message.Type;
