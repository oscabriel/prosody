import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { Wanted } from "@prosody/domain/Acquisition/Wanted.view";
import { Shelf } from "@prosody/domain/Library/Shelf.view";
import { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Nightstand } from "@prosody/domain/Reading/Nightstand.view";
import { KeptPlace, PlaceAt, Sentence } from "@prosody/domain/Reading/Sentence";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { defineTaggedUnion } from "foldkit/schema";
import { Url } from "foldkit/url";

import { Prosody } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";

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

export const Flags = Schema.Struct({
	session: Schema.String,
	isOnline: Schema.Boolean,
	places: Places,
	copies: DeviceCopies,
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
});

export type Model = typeof Model.Type;

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
	ClickedCorrect: { work: Schema.String },
	ChangedCorrectTitle: { value: Schema.String },
	ChangedCorrectAuthor: { value: Schema.String },
	SubmittedCorrection: {},
	ClickedCancelCorrection: {},
	ClickedGrab: { work: Schema.String, release: Schema.String },
	ClickedGrabMove: { grab: Schema.String, move: GrabMove },
});

export type Message = typeof Message.Type;
