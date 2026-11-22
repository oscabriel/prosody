import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import type { Timeline } from "@prosody/domain/Reading/Copy";
import { Sentence } from "@prosody/domain/Reading/Sentence";
import { Option } from "effect";
import { fromString } from "foldkit/url";

import { DEFAULT_APPEARANCE, nextToggleTheme } from "../src/Appearance.ts";
import { update } from "../src/Main.ts";
import {
	Book,
	ConfirmAction,
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	Message,
	Model,
} from "../src/Model.ts";
import type { Room, RoomKey } from "../src/Model.ts";
import { Prosody } from "../src/Prosody.ts";
import { copyFailureOf } from "../src/Rooms.ts";
import { chromeAfter, travelled } from "../src/RoomSubscriptions.ts";
import { AppRoute, urlToAppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";
import { panelBesideToast, beneathToast, firstLetterOf } from "../src/Ui.ts";
import { adminAda, signedInAs } from "./Readers.ts";

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
			contents: {
				audio: "audio.m4b",
				sections: [],
				chapters: [],
				cover: null,
				pictures: [],
				headings: [],
			},
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
	appearance: DEFAULT_APPEARANCE,
	systemDark: false,
	toast: Option.none(),
	confirm: Option.none(),
	announcement: "",
	shelfUi: DEFAULT_SHELF_UI,
	deskUi: DEFAULT_DESK_UI,
	...signedInAs(adminAda),
});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

describe("the open room, back online", () => {
	it("opens the book again when the model has not answered its open", () => {
		const { commands } = update(inCarl, Message.WentOnline());

		expect(names(commands ?? [])).toStrictEqual(["FetchMe", "Stamp"]);
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

		expect(names(commands ?? [])).toStrictEqual(["FetchMe"]);
	});
});

const inAlice = Model.make({
	...inCarl,
	route: AppRoute.Room({ work: "w-alice" }),
	isOnline: true,
	room: Option.some({
		...roomOf("w-alice", false),
		time: 100,
		kept: Option.some({ sentence: null, time: 100, page: null, at: 1000 }),
		book: Book.Open({
			contents: {
				audio: "alice.m4b",
				sections: [],
				chapters: [
					{ title: "Down the Rabbit-Hole", start: 0, end: 640.6 },
					{ title: "The Pool of Tears", start: 640.6, end: 1376.4 },
				],
				cover: null,
				pictures: [],
				headings: [],
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
			page: null,
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

const shelfWith = (
	alice: "copying" | "made" | "failed",
	carl: "syncing" | "synced" | "failed",
	note = ""
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
					pages: false,
				},
				"w-carl": {
					title: "Dungeon Crawler Carl",
					author: "Matt Dinniman",
					shelfmark: Shelfmark.make("Matt Dinniman/Dungeon Crawler Carl"),
					text: true,
					audio: true,
					pages: false,
				},
			},
			syncs: { "w-carl": { state: carl, note } },
			copies: {
				"w-alice": { state: alice, note: "" },
				"w-carl": { state: "copying", note: "" },
			},
		}),
		cursor: 1,
	});

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

describe("a pair aligned again", () => {
	it("closes the open book, and asks the press for it", () => {
		const shelved = update(inCarl, shelfWith("made", "synced"));
		const asked = update(shelved.model, Message.ClickedRealign());

		expect(phaseOf(asked.model)).toStrictEqual(Option.some("asked"));
		expect(names(asked.commands ?? [])).toStrictEqual(["RealignNarration"]);
	});

	it("says why the press could not sync it", () => {
		const { model } = update(
			waiting("w-carl", "idle"),
			shelfWith("made", "failed", "its audio is cut short")
		);

		expect(copyFailureOf(model, "w-carl")).toStrictEqual(
			Option.some("its audio is cut short")
		);
		expect(copyFailureOf(model, "w-alice")).toStrictEqual(Option.none());
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

describe("shared shell primitives", () => {
	it("opens and cancels the confirm dialog cleanly", () => {
		const shelved = update(inCarl, shelfWith("made", "synced"));

		const requested = update(
			shelved.model,
			Message.RequestedConfirm({
				action: ConfirmAction.Realign({
					work: "w-carl",
					title: "Dungeon Crawler Carl",
				}),
			})
		);

		expect(Option.isSome(requested.model.confirm)).toBeTruthy();
		expect(names(requested.commands ?? [])).toStrictEqual([
			"OpenConfirmDialog",
		]);

		const cancelled = update(requested.model, Message.CancelledConfirm());

		expect(Option.isNone(cancelled.model.confirm)).toBeTruthy();
		expect(names(cancelled.commands ?? [])).toStrictEqual([
			"CloseConfirmDialog",
		]);
	});

	it("executes the confirmed action and announces a toast", () => {
		const shelved = update(inCarl, shelfWith("made", "synced"));

		const requested = update(
			shelved.model,
			Message.RequestedConfirm({
				action: ConfirmAction.Realign({
					work: "w-carl",
					title: "Dungeon Crawler Carl",
				}),
			})
		);

		const confirmed = update(requested.model, Message.ConfirmedAction());

		expect(Option.isNone(confirmed.model.confirm)).toBeTruthy();
		expect(names(confirmed.commands ?? [])).toStrictEqual([
			"CloseConfirmDialog",
			"RealignNarration",
		]);
		expect(
			Option.map(confirmed.model.toast, (toast) => toast.message)
		).toStrictEqual(Option.some("Asked the press to align it again"));
	});

	it("updates and resets appearance and toggles theme", () => {
		const changed = update(
			inCarl,
			Message.ChangedAppearance({
				appearance: { ...DEFAULT_APPEARANCE, theme: "dark", size: 120 },
			})
		);

		expect(changed.model.appearance.theme).toBe("dark");
		expect(names(changed.commands ?? [])).toStrictEqual(["ApplyAppearance"]);

		const reset = update(changed.model, Message.ResetAppearance());

		expect(reset.model.appearance).toStrictEqual(DEFAULT_APPEARANCE);
		expect(nextToggleTheme("auto", false)).toBe("dark");
		expect(nextToggleTheme("auto", true)).toBe("light");
	});

	it("pauses, resumes, and dismisses toasts", () => {
		const shown = update(
			inCarl,
			Message.ShownToast({
				message: "Kept on this device",
				action: Option.none(),
			})
		);

		expect(Option.map(shown.model.toast, (t) => t.paused)).toStrictEqual(
			Option.some(false)
		);

		const paused = update(shown.model, Message.PausedToast());

		expect(Option.map(paused.model.toast, (t) => t.paused)).toStrictEqual(
			Option.some(true)
		);

		const resumed = update(paused.model, Message.ResumedToast());

		expect(Option.map(resumed.model.toast, (t) => t.paused)).toStrictEqual(
			Option.some(false)
		);

		const dismissed = update(resumed.model, Message.DismissedToast());

		expect(Option.isNone(dismissed.model.toast)).toBeTruthy();
	});

	it("extracts cover monograms skipping leading punctuation", () => {
		expect(firstLetterOf("«Truyện Kiều»")).toBe("T");
		expect(firstLetterOf('"The Odyssey"')).toBe("T");
		expect(firstLetterOf("   ")).toBe("·");
	});
});

const inSection = (path: string, span: string) =>
	Sentence.make(`${path}#${span}`);

const pairContents = {
	audio: "carl.m4b",
	sections: [
		{ path: "ch1.xhtml", title: "Chapter 1" },
		{ path: "ch2.xhtml", title: "Chapter 2" },
		{ path: "notes.xhtml", title: "Notes" },
	],
	chapters: [],
	cover: null,
	pictures: [],
	headings: [],
};

const pairTimeline: Timeline = [
	{
		sentence: inSection("ch1.xhtml", "ps-1"),
		state: "aligned",
		start: 10,
		end: 14,
	},
	{
		sentence: inSection("ch1.xhtml", "ps-2"),
		state: "aligned",
		start: 14.5,
		end: 20,
	},
	{
		sentence: inSection("ch2.xhtml", "ps-1"),
		state: "aligned",
		start: 25,
		end: 30,
	},
	{
		sentence: inSection("ch2.xhtml", "ps-2"),
		state: "aligned",
		start: 30,
		end: 40,
	},
	{ sentence: inSection("notes.xhtml", "ps-1"), state: "unaligned" },
];

const inPair = (room: Partial<Room> = {}) =>
	Model.make({
		...inCarl,
		isOnline: true,
		room: Option.some({
			...roomOf("w-carl", false),
			book: Book.Open({ contents: pairContents, timeline: pairTimeline }),
			sentence: Option.some(inSection("ch1.xhtml", "ps-1")),
			time: 10,
			knowsPlace: true,
			kept: Option.some({
				sentence: inSection("ch1.xhtml", "ps-1"),
				time: null,
				page: null,
				at: 1000,
			}),
			...room,
		}),
	});

const roomIn = (model: Model): Room => Option.getOrThrow(model.room);

describe("skipping in a pair", () => {
	it("stops at the end of what was read aloud", () => {
		const { model, commands } = update(
			inPair({ time: 35 }),
			Message.ClickedSkip({ seconds: 30 })
		);

		expect(roomIn(model).time).toBe(40);
		expect(names(commands ?? [])).toStrictEqual(["Seek"]);
	});

	it("stops at the beginning", () => {
		const { model } = update(
			inPair({ time: 5 }),
			Message.ClickedSkip({ seconds: -15 })
		);

		expect(roomIn(model).time).toBe(0);
	});

	it("moves by the seconds asked within the book", () => {
		const { model } = update(
			inPair({ time: 20 }),
			Message.ClickedSkip({ seconds: -15 })
		);

		expect(roomIn(model).time).toBe(5);
	});
});

describe("the scrubber", () => {
	it("shows where it is held without moving the audio or the place", () => {
		const { model, commands } = update(
			inPair(),
			Message.ScrubbedAudio({ time: 32 })
		);

		expect(roomIn(model).scrubbingTime).toStrictEqual(Option.some(32));
		expect(roomIn(model).time).toBe(10);
		expect(commands ?? []).toStrictEqual([]);
		expect(model.places).toStrictEqual({});
	});

	it("moves the audio and keeps the place once when let go", () => {
		const held = update(inPair(), Message.ScrubbedAudio({ time: 31 }));
		const again = update(held.model, Message.ScrubbedAudio({ time: 32 }));

		const { model, commands } = update(
			again.model,
			Message.CommittedScrub({ time: 32, at: 5000 })
		);

		expect(roomIn(model).scrubbingTime).toStrictEqual(Option.none());
		expect(roomIn(model).time).toBe(32);
		expect(roomIn(model).sentence).toStrictEqual(
			Option.some(inSection("ch2.xhtml", "ps-2"))
		);
		expect(names(commands ?? [])).toStrictEqual([
			"Seek",
			"FetchSection",
			"FetchSection",
			"Show",
			"SavePlaces",
			"KeepPlace",
			"Announce",
		]);
		expect(model.places["w-carl"]).toStrictEqual({
			sentence: inSection("ch2.xhtml", "ps-2"),
			time: null,
			page: null,
			at: 5000,
			commandId: "s:0",
		});
	});

	it("keeps no place before your place is known", () => {
		const { model, commands } = update(
			inPair({ knowsPlace: false }),
			Message.CommittedScrub({ time: 32, at: 5000 })
		);

		expect(roomIn(model).time).toBe(32);
		expect(model.places).toStrictEqual({});
		expect(names(commands ?? [])).toStrictEqual([
			"Seek",
			"FetchSection",
			"FetchSection",
			"Show",
			"Announce",
		]);
	});

	it("goes no further than the book", () => {
		const { model } = update(
			inPair(),
			Message.CommittedScrub({ time: 900, at: 5000 })
		);

		expect(roomIn(model).time).toBe(40);
	});
});

describe("the speed", () => {
	it("is set within its bounds", () => {
		const fast = update(inPair(), Message.SetSpeed({ rate: 9 }));

		expect(roomIn(fast.model).rate).toBe(2.5);
		expect(names(fast.commands ?? [])).toStrictEqual(["SetRate"]);

		const slow = update(inPair(), Message.SetSpeed({ rate: 0.2 }));

		expect(roomIn(slow.model).rate).toBe(0.75);
	});
});

const asleepIn = (model: Model, minutes: number) =>
	update(
		model,
		Message.SetSleepTimer({
			minutes: Option.some(minutes),
			endOfChapter: false,
		})
	).model;

describe("the sleep timer", () => {
	it("starts counting from the first reading of the clock", () => {
		const chosen = asleepIn(inPair({ isPlaying: true }), 15);

		expect(roomIn(chosen).sleepMinutes).toStrictEqual(Option.some(15));
		expect(roomIn(chosen).sleepEndsAt).toStrictEqual(Option.none());

		const started = update(chosen, Message.SleepTimerTicked({ now: 1000 }));

		expect(roomIn(started.model).sleepEndsAt).toStrictEqual(
			Option.some(901_000)
		);
		expect(roomIn(started.model).sleepLeft).toStrictEqual(Option.some(15));
	});

	it("counts the minutes left down", () => {
		const chosen = asleepIn(inPair({ isPlaying: true }), 15);
		const started = update(chosen, Message.SleepTimerTicked({ now: 1000 }));

		const later = update(
			started.model,
			Message.SleepTimerTicked({ now: 601_000 })
		);

		expect(roomIn(later.model).sleepLeft).toStrictEqual(Option.some(5));
		expect(later.commands ?? []).toStrictEqual([]);
	});

	it("pauses the audio when its time is up", () => {
		const chosen = asleepIn(inPair({ isPlaying: true }), 15);
		const started = update(chosen, Message.SleepTimerTicked({ now: 1000 }));
		const ended = update(started.model, Message.SleepTimerFired());

		expect(names(ended.commands ?? [])).toStrictEqual(["Pause"]);
		expect(roomIn(ended.model).sleepMinutes).toStrictEqual(Option.none());
		expect(roomIn(ended.model).sleepEndsAt).toStrictEqual(Option.none());
		expect(roomIn(ended.model).sleepLeft).toStrictEqual(Option.none());
	});

	it("pauses from the audio's own clock when no timer could fire", () => {
		const chosen = asleepIn(inPair({ isPlaying: true }), 15);
		const started = update(chosen, Message.SleepTimerTicked({ now: 1000 }));

		const early = update(
			started.model,
			Message.Ticked({ time: 10.5, at: 900_000 })
		);

		expect(names(early.commands ?? [])).not.toContain("Pause");

		const due = update(early.model, Message.Ticked({ time: 11, at: 901_000 }));

		expect(names(due.commands ?? [])).toContain("Pause");
		expect(roomIn(due.model).sleepMinutes).toStrictEqual(Option.none());
	});

	it("pauses nothing that is not playing", () => {
		const chosen = asleepIn(inPair(), 15);
		const ended = update(chosen, Message.SleepTimerFired());

		expect(ended.commands ?? []).toStrictEqual([]);
		expect(roomIn(ended.model).sleepMinutes).toStrictEqual(Option.none());
	});

	it("is turned off", () => {
		const chosen = asleepIn(inPair(), 30);

		const off = update(
			chosen,
			Message.SetSleepTimer({ minutes: Option.none(), endOfChapter: false })
		);

		expect(roomIn(off.model).sleepMinutes).toStrictEqual(Option.none());
		expect(roomIn(off.model).sleepEndOfChapter).toBeFalsy();
	});

	it("pauses when the chapter being spoken ends", () => {
		const armed = update(
			inPair({
				isPlaying: true,
				time: 24.9,
				sentence: Option.some(inSection("ch1.xhtml", "ps-2")),
			}),
			Message.SetSleepTimer({ minutes: Option.none(), endOfChapter: true })
		);

		expect(roomIn(armed.model).sleepEndOfChapter).toBeTruthy();

		const within = update(
			armed.model,
			Message.Ticked({ time: 24.95, at: 2000 })
		);

		expect(names(within.commands ?? [])).not.toContain("Pause");

		const over = update(within.model, Message.Ticked({ time: 25.1, at: 2100 }));

		expect(names(over.commands ?? [])).toContain("Pause");
		expect(roomIn(over.model).sleepEndOfChapter).toBeFalsy();
	});

	it("does not pause when you move to another chapter yourself", () => {
		const armed = update(
			inPair({ isPlaying: true, time: 12 }),
			Message.SetSleepTimer({ minutes: Option.none(), endOfChapter: true })
		);

		const moved = update(armed.model, Message.Ticked({ time: 31, at: 2000 }));

		expect(names(moved.commands ?? [])).not.toContain("Pause");
		expect(roomIn(moved.model).sleepEndOfChapter).toBeTruthy();
	});
});

const playing = () =>
	inPair({
		isPlaying: true,
		time: 19,
		sentence: Option.some(inSection("ch1.xhtml", "ps-2")),
		kept: Option.some({
			sentence: inSection("ch1.xhtml", "ps-2"),
			time: null,
			page: null,
			at: 1000,
		}),
	});

describe("following the spoken sentence", () => {
	it("turns to the section being spoken and brings the sentence into view", () => {
		const { model, commands } = update(
			playing(),
			Message.Ticked({ time: 25.1, at: 2000 })
		);

		expect(roomIn(model).shown).toBe(1);
		expect(names(commands ?? [])).toStrictEqual([
			"FetchSection",
			"FetchSection",
			"Follow",
			"Announce",
		]);
	});

	it("yields when you scroll away, and leaves the page you are on", () => {
		const yielded = update(playing(), Message.YieldedFollow());

		expect(roomIn(yielded.model).isFollowing).toBeFalsy();

		const { model, commands } = update(
			yielded.model,
			Message.Ticked({ time: 25.1, at: 2000 })
		);

		expect(roomIn(model).shown).toBe(0);
		expect(roomIn(model).sentence).toStrictEqual(
			Option.some(inSection("ch2.xhtml", "ps-1"))
		);
		expect(names(commands ?? [])).toStrictEqual(["Announce"]);
	});

	it("resumes from the pill, back at the section being spoken", () => {
		const yielded = update(playing(), Message.YieldedFollow());

		const spoken = update(
			yielded.model,
			Message.Ticked({ time: 25.1, at: 2000 })
		);

		const { model, commands } = update(
			spoken.model,
			Message.ClickedBackToPlaying()
		);

		expect(roomIn(model).isFollowing).toBeTruthy();
		expect(roomIn(model).shown).toBe(1);
		expect(names(commands ?? [])).toStrictEqual([
			"FetchSection",
			"FetchSection",
			"Follow",
		]);
	});

	it("resumes when the audio is played again", () => {
		const yielded = update(playing(), Message.YieldedFollow());
		const { model } = update(yielded.model, Message.Played());

		expect(roomIn(model).isFollowing).toBeTruthy();
		expect(roomIn(model).isPlaying).toBeTruthy();
	});

	it("yields when you choose another chapter while it plays", () => {
		const opened = update(
			playing(),
			Message.OpenedPanel({ panel: "toc", fromPlayerSheet: false })
		);

		const { model } = update(
			opened.model,
			Message.ClickedChapter({ index: 2 })
		);

		expect(roomIn(model).shown).toBe(2);
		expect(roomIn(model).isFollowing).toBeFalsy();
		expect(roomIn(model).returnChapter).toStrictEqual(Option.none());
		expect(roomIn(model).openPanel).toStrictEqual(Option.none());
	});

	it("plays from the sentence you press, and follows again", () => {
		const yielded = update(playing(), Message.YieldedFollow());

		const { model, commands } = update(
			yielded.model,
			Message.PressedSentence({ id: "ps-1", at: 3000 })
		);

		expect(roomIn(model).isFollowing).toBeTruthy();
		expect(roomIn(model).time).toBe(10);
		expect(names(commands ?? [])).toStrictEqual([
			"SavePlaces",
			"KeepPlace",
			"FetchSection",
			"FetchSection",
			"Seek",
			"Show",
		]);
	});
});

describe("the panels of a room", () => {
	const openToc = Message.OpenedPanel({ panel: "toc", fromPlayerSheet: false });

	it("open with the chrome showing, and take the focus", () => {
		const opened = update(inPair({ chromeHidden: true }), openToc);

		expect(roomIn(opened.model).openPanel).toStrictEqual(Option.some("toc"));
		expect(roomIn(opened.model).chromeHidden).toBeFalsy();
		expect(names(opened.commands ?? [])).toStrictEqual(["EnterPanel"]);
	});

	it("give way to the next one opened, which closes when asked for again", () => {
		const opened = update(inPair(), openToc);

		const menu = update(
			opened.model,
			Message.OpenedPanel({ panel: "menu", fromPlayerSheet: false })
		);

		expect(roomIn(menu.model).openPanel).toStrictEqual(Option.some("menu"));

		const again = update(
			menu.model,
			Message.OpenedPanel({ panel: "menu", fromPlayerSheet: false })
		);

		expect(roomIn(again.model).openPanel).toStrictEqual(Option.none());
		expect(names(again.commands ?? [])).toStrictEqual(["FocusOn"]);
	});

	it("return to the player sheet they were opened from", () => {
		const sheet = update(
			inPair(),
			Message.OpenedPanel({ panel: "player", fromPlayerSheet: false })
		);

		const speed = update(
			sheet.model,
			Message.OpenedPanel({ panel: "speed", fromPlayerSheet: true })
		);

		expect(roomIn(speed.model).openPanel).toStrictEqual(Option.some("speed"));

		const closed = update(speed.model, Message.ClosedPanels());

		expect(roomIn(closed.model).openPanel).toStrictEqual(Option.some("player"));

		const collapsed = update(closed.model, Message.ClosedPanels());

		expect(roomIn(collapsed.model).openPanel).toStrictEqual(Option.none());
	});

	it("close on Escape, which otherwise brings the chrome back", () => {
		const opened = update(inPair(), openToc);

		const escaped = update(
			opened.model,
			Message.PressedRoomKey({ key: "Escape" })
		);

		expect(roomIn(escaped.model).openPanel).toStrictEqual(Option.none());

		const shown = update(
			inPair({ chromeHidden: true }),
			Message.PressedRoomKey({ key: "Escape" })
		);

		expect(roomIn(shown.model).chromeHidden).toBeFalsy();
	});

	it("keep the chrome while one is open", () => {
		const opened = update(inPair(), openToc);

		const { model } = update(
			opened.model,
			Message.SetChromeHidden({ hidden: true })
		);

		expect(roomIn(model).chromeHidden).toBeFalsy();
	});
});

const lookedUp = () => {
	const opened = update(
		inPair(),
		Message.OpenedPanel({ panel: "toc", fromPlayerSheet: false })
	);

	return update(opened.model, Message.ClickedChapter({ index: 1 }));
};

describe("choosing a chapter from the contents", () => {
	it("closes the contents, shows the chapter and offers the way back", () => {
		const { model, commands } = lookedUp();

		expect(roomIn(model).shown).toBe(1);
		expect(roomIn(model).openPanel).toStrictEqual(Option.none());
		expect(roomIn(model).returnChapter).toStrictEqual(Option.some(0));
		expect(names(commands ?? [])).toStrictEqual([
			"FetchSection",
			"FetchSection",
			"ToTop",
			"FocusOn",
		]);
	});

	it("leaves your place where it was", () => {
		const { model } = lookedUp();

		expect(roomIn(model).sentence).toStrictEqual(
			Option.some(inSection("ch1.xhtml", "ps-1"))
		);
		expect(model.places).toStrictEqual({});
	});

	it("goes back to the sentence your place is at", () => {
		const { model, commands } = update(
			lookedUp().model,
			Message.ClickedReturnChapter()
		);

		expect(roomIn(model).shown).toBe(0);
		expect(roomIn(model).returnChapter).toStrictEqual(Option.none());
		expect(names(commands ?? [])).toStrictEqual(["FetchSection", "Show"]);
	});

	it("takes the new chapter as your place once you read on in it", () => {
		const { model } = update(
			lookedUp().model,
			Message.ReadTo({ id: "ps-2", at: 4000 })
		);

		expect(roomIn(model).returnChapter).toStrictEqual(Option.none());
		expect(roomIn(model).sentence).toStrictEqual(
			Option.some(inSection("ch2.xhtml", "ps-2"))
		);
		expect(model.places["w-carl"]?.sentence).toBe(
			inSection("ch2.xhtml", "ps-2")
		);
	});

	it("offers no way back from the turns at the foot of a chapter", () => {
		const { model } = update(inPair(), Message.ClickedChapter({ index: 1 }));

		expect(roomIn(model).returnChapter).toStrictEqual(Option.none());
	});
});

describe("reading on by scrolling", () => {
	const readOn = Message.ReadTo({ id: "ps-2", at: 4000 });

	it("keeps the sentence at the top of the page as your place", () => {
		const { model } = update(inPair(), readOn);

		expect(model.places["w-carl"]?.sentence).toBe(
			inSection("ch1.xhtml", "ps-2")
		);
	});

	it("keeps nothing before your place is known", () => {
		const { model, commands } = update(inPair({ knowsPlace: false }), readOn);

		expect(model.places).toStrictEqual({});
		expect(commands ?? []).toStrictEqual([]);
	});

	it("keeps nothing while a panel is open or the audio plays", () => {
		const opened = update(
			inPair(),
			Message.OpenedPanel({ panel: "aa", fromPlayerSheet: false })
		);

		expect(update(opened.model, readOn).model.places).toStrictEqual({});
		expect(
			update(inPair({ isPlaying: true }), readOn).model.places
		).toStrictEqual({});
	});
});

const press = (model: Model, key: RoomKey) =>
	update(model, Message.PressedRoomKey({ key }));

const sizesFrom = (model: Model, keys: ReadonlyArray<RoomKey>) => {
	const sizes: Array<number> = [];
	let next = model;

	for (const key of keys) {
		next = press(next, key).model;
		sizes.push(next.appearance.size);
	}

	return sizes;
};

describe("the keys of a room", () => {
	it("play and pause on Space", () => {
		expect(names(press(inPair(), "Space").commands ?? [])).toStrictEqual([
			"Play",
		]);
		expect(
			names(press(inPair({ isPlaying: true }), "Space").commands ?? [])
		).toStrictEqual(["Pause"]);
	});

	it("skip on the arrows, back fifteen seconds and on thirty", () => {
		expect(roomIn(press(inPair({ time: 20 }), "ArrowLeft").model).time).toBe(5);
		expect(roomIn(press(inPair({ time: 5 }), "ArrowRight").model).time).toBe(
			35
		);
	});

	it("change the speed by a tenth", () => {
		expect(roomIn(press(inPair(), "Period").model).rate).toBe(1.1);
		expect(roomIn(press(inPair(), "Comma").model).rate).toBe(0.9);
	});

	it("turn chapters, and open the contents", () => {
		expect(roomIn(press(inPair(), "BracketRight").model).shown).toBe(1);
		expect(roomIn(press(inPair(), "BracketLeft").model).shown).toBe(0);
		expect(roomIn(press(inPair(), "T").model).openPanel).toStrictEqual(
			Option.some("toc")
		);
	});

	it("size the text, and set it plain again", () => {
		const larger = press(inPair(), "Equal");

		expect(larger.model.appearance.size).toBe(110);
		expect(names(larger.commands ?? [])).toStrictEqual(["ApplyAppearance"]);
		expect(press(larger.model, "Zero").model.appearance.size).toBe(100);
		expect(press(inPair(), "Minus").model.appearance.size).toBe(90);
	});

	it("step down to the smallest size and back up through plain", () => {
		expect(
			sizesFrom(inPair(), [
				"Minus",
				"Minus",
				"Minus",
				"Equal",
				"Equal",
				"Equal",
			])
		).toStrictEqual([90, 85, 85, 90, 100, 110]);
	});

	it("do nothing while a question waits for its answer", () => {
		const asked = update(
			inPair(),
			Message.RequestedConfirm({
				action: ConfirmAction.Realign({ work: "w-carl", title: "Carl" }),
			})
		);

		expect(press(asked.model, "Space").commands ?? []).toStrictEqual([]);
	});

	it("leave a book with audio alone unsized", () => {
		expect(press(inAlice, "Equal").model.appearance.size).toBe(100);
		expect(names(press(inAlice, "Space").commands ?? [])).toStrictEqual([
			"Play",
		]);
	});
});

describe("the chrome of a reading room", () => {
	const still = { from: 500, last: 500 };

	it("hides once you have scrolled well down, and returns on a little way up", () => {
		const down = travelled(still, 590);

		expect(chromeAfter(down, 590, false)).toBeTruthy();
		expect(chromeAfter(travelled(still, 560), 560, false)).toBeFalsy();

		const up = travelled({ from: 900, last: 900 }, 880);

		expect(chromeAfter(up, 880, true)).toBeFalsy();
		expect(
			chromeAfter(travelled({ from: 900, last: 900 }, 895), 895, true)
		).toBeTruthy();
	});

	it("counts from where you turned round", () => {
		const down = travelled(travelled(still, 400), 430);

		expect(down).toStrictEqual({ from: 400, last: 430 });
		expect(chromeAfter(down, 430, false)).toBeFalsy();
	});

	it("is always there near the top", () => {
		expect(chromeAfter({ from: 300, last: 30 }, 30, true)).toBeFalsy();
	});
});

describe("a banner for a place further on elsewhere", () => {
	it("is put away without moving", () => {
		const there = inPair({
			elsewhere: Option.some({
				sentence: inSection("ch2.xhtml", "ps-1"),
				time: null,
				page: null,
				at: 9000,
				device: "laptop",
			}),
		});

		const { model, commands } = update(there, Message.DismissedElsewhere());

		expect(roomIn(model).elsewhere).toStrictEqual(Option.none());
		expect(roomIn(model).shown).toBe(0);
		expect(commands ?? []).toStrictEqual([]);
	});
});

describe("a book that could not be opened", () => {
	it("is opened again when asked", () => {
		const failed = Model.make({
			...inCarl,
			room: Option.some({
				...roomOf("w-carl", false),
				book: Book.Failed({ reason: "no answer" }),
			}),
		});

		const { model, commands } = update(failed, Message.ClickedOpenAgain());

		expect(phaseOf(model)).toStrictEqual(Option.some("opening"));
		expect(names(commands ?? [])).toStrictEqual(["OpenCopy"]);
	});
});

describe("the toast", () => {
	it("sits above whichever bar is at the bottom of the screen", () => {
		const onShelf = Model.make({
			...inCarl,
			route: AppRoute.Shelf(),
			room: Option.none(),
		});

		expect(beneathToast(onShelf)).toBe("tabbar");
		expect(beneathToast(inPair())).toBe("dock");
		expect(beneathToast(inPair({ isPlaying: true, isFollowing: false }))).toBe(
			"dock-pill"
		);
		expect(panelBesideToast(inPair({ openPanel: Option.some("player") }))).toBe(
			"sheet"
		);
		expect(beneathToast(inAlice)).toBe("stage");
	});
});
