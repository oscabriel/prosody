import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { Option } from "effect";
import { fromString } from "foldkit/url";

import { update } from "../src/Main.ts";
import { Book, Message, Model } from "../src/Model.ts";
import { Prosody } from "../src/Prosody.ts";
import { AppRoute, urlToAppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";

/** A page offline with Carl's room open. */
const inCarl = Model.make({
	route: AppRoute.Room({ work: "w-carl" }),
	commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
	isOnline: false,
	places: {},
	copies: {},
	copying: Option.none(),
	shelf: Option.none(),
	hasAnswered: false,
	error: Option.none(),
	nightstand: Option.none(),
	room: Option.some({
		...roomOf("w-carl", false),
		book: Book.Open({
			contents: { audio: "audio.m4b", pages: [], chapters: [], cover: null },
			timeline: [],
		}),
	}),
	wanted: Option.none(),
	desk: {
		title: "",
		author: "",
		correcting: Option.none(),
		problem: Option.none(),
	},
});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

describe("the open room, back online", () => {
	it("opens the book again when the model has not answered its open", () => {
		const { commands } = update(inCarl, Message.WentOnline());

		expect(names(commands ?? [])).toStrictEqual(["Stamp"]);
	});

	it("leaves the nightstand alone once the model has answered", () => {
		const answered = update(
			inCarl,
			Message.ReceivedResult({
				result: Prosody.Message.SucceededOpenBook({
					commandId: "s:1",
					reply: undefined,
					receipt: { stream: "Reading/w-carl", version: 1 },
				}),
			})
		);

		const { commands } = update(answered.model, Message.WentOnline());

		expect(commands ?? []).toStrictEqual([]);
	});
});

/** A page online with the room of a work with its audio alone open, paused at 100 seconds. */
const inAlice = Model.make({
	...inCarl,
	route: AppRoute.Room({ work: "w-alice" }),
	isOnline: true,
	room: Option.some({
		...roomOf("w-alice", false),
		time: 100,
		kept: Option.some({ sentence: null, time: 100, at: 1000 }),
		book: Book.Open({
			contents: {
				audio: "alice.m4b",
				pages: [],
				chapters: [
					{ title: "Down the Rabbit-Hole", start: 0, end: 640.6 },
					{ title: "The Pool of Tears", start: 640.6, end: 1376.4 },
				],
				cover: null,
			},
			timeline: [],
		}),
	}),
});

describe("a room with its audio alone", () => {
	it("plays a chapter from its start, and names it on the lock screen", () => {
		const { model, commands } = update(
			inAlice,
			Message.ClickedChapter({ index: 1 })
		);

		expect(names(commands ?? [])).toStrictEqual(["Seek", "Announce"]);
		expect(Option.map(model.room, (room) => room.time)).toStrictEqual(
			Option.some(640.6)
		);
	});

	it("keeps the place at once when you move the audio while it is paused", () => {
		const { model, commands } = update(
			inAlice,
			Message.Ticked({ time: 640.6, at: 2000 })
		);

		expect(model.places["w-alice"]).toStrictEqual({
			sentence: null,
			time: 640.6,
			at: 2000,
			commandId: "s:0",
		});
		expect(names(commands ?? [])).toStrictEqual([
			"SavePlaces",
			"KeepPlace",
			"Announce",
		]);
	});

	it("keeps nothing when the audio is where your place already is", () => {
		const { commands } = update(
			inAlice,
			Message.Ticked({ time: 100.2, at: 2000 })
		);

		expect(commands ?? []).toStrictEqual([]);
	});
});

/** The shelf with Alice, an audio alone, and Carl, a pair. */
const shelfWith = (
	alice: "copying" | "made" | "failed",
	carl: "syncing" | "synced"
) =>
	Message.ReceivedShelf({
		state: Option.some({
			works: {
				"w-alice": {
					title: "Alice in Wonderland",
					author: "Lewis Carroll",
					shelfmark: Shelfmark.make("Lewis Carroll/Alice in Wonderland"),
					text: false,
					audio: true,
				},
				"w-carl": {
					title: "Dungeon Crawler Carl",
					author: "Matt Dinniman",
					shelfmark: Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl"),
					text: true,
					audio: true,
				},
			},
			syncs: { "w-carl": { state: carl, note: "" } },
			// Carl's copy left copying by a walk that saw only half of it.
			copies: {
				"w-alice": { state: alice, note: "" },
				"w-carl": { state: "copying", note: "" },
			},
		}),
		cursor: 1,
	});

/** A page whose room for `work` found no copy to open, in this phase. */
const waiting = (work: string, phase: "idle" | "asked") =>
	Model.make({
		...inCarl,
		route: AppRoute.Room({ work }),
		isOnline: true,
		room: Option.some({
			...roomOf(work, false),
			book: Book.Unmade({ phase }),
		}),
	});

const phaseOf = (model: Model) =>
	Option.map(model.room, (room) =>
		Book.match(room.book, {
			Unmade: ({ phase }) => phase,
			Opening: () => "opening",
			Open: () => "open",
			Failed: () => "failed",
		})
	);

describe("a room waiting on its copy", () => {
	it("waits with the press when it found no copy before the shelf came", () => {
		const busy = update(
			waiting("w-alice", "idle"),
			shelfWith("copying", "synced")
		);

		expect(phaseOf(busy.model)).toStrictEqual(Option.some("aligning"));

		const done = update(busy.model, shelfWith("made", "synced"));

		expect(phaseOf(done.model)).toStrictEqual(Option.some("opening"));
		expect(names(done.commands ?? [])).toStrictEqual(["OpenCopy"]);
	});

	it("opens once the press is done, though the shelf never showed it at work", () => {
		const taken = update(
			waiting("w-alice", "asked"),
			Message.ReceivedResult({
				result: Prosody.Message.SucceededRemakeCopy({
					commandId: "s:0",
					reply: undefined,
					receipt: { stream: "Copy/w-alice", version: 2 },
				}),
			})
		);

		const done = update(taken.model, shelfWith("failed", "synced"));

		expect(names(done.commands ?? [])).toStrictEqual(["OpenCopy"]);
	});

	it("takes no lone copy left copying for a pair as the press at work", () => {
		const { model } = update(
			waiting("w-carl", "idle"),
			shelfWith("made", "synced")
		);

		expect(phaseOf(model)).toStrictEqual(Option.some("idle"));
	});
});

describe("a room's address", () => {
	it("names a work by its id", () => {
		const url = Option.getOrThrow(
			fromString("https://p.test/read/w-1c7eeddd853b")
		);

		expect(urlToAppRoute(url)).toStrictEqual(
			AppRoute.Room({ work: "w-1c7eeddd853b" })
		);
	});

	it("is not found when it names something else", () => {
		const url = Option.getOrThrow(fromString("https://p.test/read/Dune"));

		expect(AppRoute.guards.NotFound(urlToAppRoute(url))).toBeTruthy();
	});
});
