import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { Shelf } from "@prosody/domain/Library/Shelf.view";
import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Bookmark, Position, Sentence } from "@prosody/domain/Reading/Sentence";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { defineTaggedUnion } from "foldkit/schema";
import { Url } from "foldkit/url";

import { Prosody } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";

// FLAGS

/** What the page brings with it: a fresh session for command ids. */
export const Flags = Schema.Struct({ session: Schema.String });

export type Flags = typeof Flags.Type;

// MODEL

/** The shelf as the model keeps it: every work by id. */
export const ShelfState = Shelf.definition.state ?? Schema.Never;

/** A reading copy as the reading room loads it. */
export const Book = defineTaggedUnion({
	Opening: {},
	Open: { contents: Contents, timeline: Timeline },
	/**
	 * The copy was made before the reading room, so it has no pages to show. Realigning makes it
	 * again: `asked` until the shelf shows the press at work, then `aligning` until it is done.
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

/** A place on its way to the model, under the command id it is sent with until it is answered. */
export const Keeping = Schema.Struct({
	commandId: Schema.String,
	place: Position,
});

export type Keeping = typeof Keeping.Type;

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
	/** Whether the Place view has answered yet, and the place it last gave. */
	hasHeardPlace: Schema.Boolean,
	heardPlace: Schema.Option(Bookmark),
	/** Where the audio is, in seconds, and whether it plays. */
	time: Schema.Finite,
	isPlaying: Schema.Boolean,
	rate: Schema.Finite,
	/** The last place this page kept, and one still waiting for an answer. */
	kept: Schema.Option(Position),
	keeping: Schema.Option(Keeping),
	/** A newer place kept elsewhere, offered rather than taken while you are here. */
	elsewhere: Schema.Option(Bookmark),
});

export type Room = typeof Room.Type;

export const Model = Schema.Struct({
	route: AppRoute,
	commandIds: DomainFoldkit.CommandIds,
	/** None until the model first answers. */
	shelf: Schema.Option(ShelfState),
	hasAnswered: Schema.Boolean,
	error: Schema.Option(Schema.String),
	room: Schema.Option(Room),
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
	OpenedBook: { work: Schema.String, contents: Contents, timeline: Timeline },
	FoundUnmade: { work: Schema.String },
	FailedOpenBook: { work: Schema.String, reason: Schema.String },
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
	PressedSentence: { id: Schema.String, at: Schema.Int },
	ReadTo: { id: Schema.String, at: Schema.Int },
	ClickedPlay: {},
	ClickedPause: {},
	ClickedRate: {},
	ClickedElsewhere: {},
	ClickedRealign: {},
	Played: {},
	Paused: { time: Schema.Finite, at: Schema.Int },
	Ticked: { time: Schema.Finite, at: Schema.Int },
	CompletedPlayer: {},
	CompletedShow: {},
	ReceivedResult: { result: Prosody.Message },
	RetriedKeep: { commandId: Schema.String },
});

export type Message = typeof Message.Type;
