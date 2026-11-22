import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { Option } from "effect";

import { DEFAULT_APPEARANCE } from "../src/Appearance.ts";
import { update } from "../src/Main.ts";
import {
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	Message,
	Model,
} from "../src/Model.ts";
import type { ShelfUi } from "../src/Model.ts";
import { AppRoute } from "../src/Route.ts";
import {
	booksOf,
	chipsOf,
	isAvailable,
	keepingLabel,
	listedBooks,
	nightstandBooks,
	offlineNotice,
	rowStatusOf,
	sortBooks,
	statusOf,
	surnameOf,
} from "../src/ShelfBooks.ts";
import type { ShelfBook } from "../src/ShelfBooks.ts";

const entry = (
	title: string,
	author: string,
	editions: ReadonlyArray<"text" | "audio" | "pages">
) => ({
	title,
	author,
	shelfmark: Shelfmark.make(`${author}/${title}`),
	text: editions.includes("text"),
	audio: editions.includes("audio"),
	pages: editions.includes("pages"),
});

const MB = 1_000_000;

const shelved = Model.make({
	route: AppRoute.Shelf(),
	commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
	isOnline: true,
	places: {},
	copies: {
		"w-carl": {
			title: "Dungeon Crawler Carl",
			author: "Matt Dinniman",
			bytes: 248 * MB,
		},
		"w-earthsea": {
			title: "A Wizard of Earthsea",
			author: "Ursula K. Le Guin",
			bytes: 100 * MB,
		},
	},
	copying: Option.none(),
	shelf: Option.some({
		works: {
			"w-carl": entry("Dungeon Crawler Carl", "Matt Dinniman", [
				"text",
				"audio",
			]),
			"w-syncing": entry("The Pragmatic Programmer", "Andy Hunt", [
				"text",
				"audio",
			]),
			"w-unsynced": entry("The Left Hand of Darkness", "Ursula K. Le Guin", [
				"text",
				"audio",
			]),
			"w-unpaired": entry("The Dispossessed", "Ursula K. Le Guin", [
				"text",
				"audio",
			]),
			"w-earthsea": entry("A Wizard of Earthsea", "Ursula K. Le Guin", [
				"text",
			]),
			"w-alice": entry("Alice in Wonderland", "Lewis Carroll", ["audio"]),
			"w-copying": entry("Piranesi", "Susanna Clarke", ["audio"]),
			"w-print": entry("A Broken Print", "Nobody", ["pages"]),
			"w-unmade": entry("Invisible Cities", "Italo Calvino", ["text"]),
			"w-empty": entry("Empty Folder", "Unknown", []),
			"w-mythical": entry("The Mythical Man-Month", "Frederick P. Brooks Jr.", [
				"pages",
			]),
		},
		syncs: {
			"w-carl": { state: "synced", note: "99% of sentences found" },
			"w-syncing": { state: "syncing", note: "aligning" },
			"w-unsynced": { state: "failed", note: "the aligner stopped" },
		},
		copies: {
			"w-earthsea": { state: "made", note: "12 chapters" },
			"w-alice": { state: "made", note: "12 chapters" },
			"w-copying": { state: "copying", note: "copying" },
			"w-print": { state: "failed", note: "pdftoppm exit code 1" },
			"w-mythical": { state: "made", note: "19 chapters" },
		},
	}),
	hasAnswered: true,
	error: Option.none(),
	nightstand: Option.some({
		works: {
			"w-carl": { stage: "reading", at: 3000, device: "studio" },
			"w-alice": { stage: "reading", at: 5000, device: "phone" },
			"w-earthsea": { stage: "finished", at: 1000, device: "phone" },
			"w-mythical": { stage: "setAside", at: 2000, device: "laptop" },
		},
	}),
	room: Option.none(),
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
});

const withUi = (model: Model, change: Partial<ShelfUi>): Model => ({
	...model,
	shelfUi: { ...model.shelfUi, ...change },
});

const offline: Model = { ...shelved, isOnline: false };

const ids = (books: ReadonlyArray<ShelfBook>) => books.map((book) => book.id);

const titles = (books: ReadonlyArray<ShelfBook>) =>
	books.map((book) => book.title);

const named = (model: Model, id: string): ShelfBook => {
	const found = booksOf(model).find((book) => book.id === id);

	if (found === undefined) {
		throw new TypeError(`No book ${id} on the shelf`);
	}

	return found;
};

const labelOf = (model: Model, id: string) =>
	Option.map(statusOf(named(model, id), model.isOnline), ({ text }) => text);

const toneOf = (id: string) =>
	Option.map(statusOf(named(shelved, id), true), ({ tone }) => tone);

const listed = (change: Partial<ShelfUi>) => {
	const model = withUi(shelved, change);

	return ids(listedBooks(model, booksOf(model))).toSorted();
};

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

describe("the books on the shelf", () => {
	it("stand in each of the nine states a work can be in", () => {
		const states = Object.fromEntries(
			booksOf(shelved).map(({ id, kind, state, opens }) => [
				id,
				`${kind} ${state} ${opens ? "opens" : "inert"}`,
			])
		);

		expect(states).toStrictEqual({
			"w-carl": "synced ready opens",
			"w-syncing": "synced syncing inert",
			"w-unsynced": "synced failed opens",
			"w-unpaired": "synced unpaired inert",
			"w-earthsea": "text ready opens",
			"w-alice": "audio ready opens",
			"w-copying": "audio copying inert",
			"w-print": "pages failed opens",
			"w-unmade": "text unmade inert",
			"w-empty": "none none inert",
			"w-mythical": "pages ready opens",
		});
	});

	it("say one thing about a book when there is something to say", () => {
		const said = Object.fromEntries(
			booksOf(shelved).map((book) => [
				book.id,
				Option.getOrElse(labelOf(shelved, book.id), () => ""),
			])
		);

		expect(said).toStrictEqual({
			"w-carl": "Kept",
			"w-syncing": "Syncing…",
			"w-unsynced": "Not synced",
			"w-unpaired": "Not paired",
			"w-earthsea": "Finished · Kept",
			"w-alice": "",
			"w-copying": "Copying…",
			"w-print": "Not copied",
			"w-unmade": "One edition",
			"w-empty": "No editions",
			"w-mythical": "",
		});
	});

	it("show a failure in the danger tone and a kept copy in the ok tone", () => {
		expect(toneOf("w-print")).toStrictEqual(Option.some("danger"));
		expect(toneOf("w-carl")).toStrictEqual(Option.some("ok"));
		expect(toneOf("w-syncing")).toStrictEqual(Option.some("muted"));
	});

	it("name a row by its kind unless its state says more", () => {
		expect(rowStatusOf(named(shelved, "w-carl"), true)).toStrictEqual({
			text: "Synced",
			tone: "muted",
		});
		expect(rowStatusOf(named(shelved, "w-earthsea"), true)).toStrictEqual({
			text: "Finished",
			tone: "ok",
		});
		expect(rowStatusOf(named(shelved, "w-print"), true)).toStrictEqual({
			text: "Not copied",
			tone: "danger",
		});
	});
});

describe("keeping a book on this device", () => {
	it("shows no percentage until the total is known", () => {
		expect(keepingLabel({ done: 0, of: 0 })).toBe("Keeping…");
		expect(keepingLabel({ done: 500, of: 0 })).toBe("Keeping…");
	});

	it("shows how far it has come once the total is known", () => {
		expect(keepingLabel({ done: 62, of: 100 })).toBe("Keeping · 62%");
		expect(keepingLabel({ done: 300, of: 100 })).toBe("Keeping · 100%");
	});

	it("is the one thing said about the book while it is being kept", () => {
		const keeping: Model = {
			...shelved,
			copying: Option.some({
				work: "w-alice",
				title: "Alice in Wonderland",
				author: "Lewis Carroll",
				done: 0,
				of: 0,
				problem: null,
			}),
		};

		expect(labelOf(keeping, "w-alice")).toStrictEqual(Option.some("Keeping…"));
	});

	it("says nothing once keeping has failed", () => {
		const failed: Model = {
			...shelved,
			copying: Option.some({
				work: "w-alice",
				title: "Alice in Wonderland",
				author: "Lewis Carroll",
				done: 10,
				of: 100,
				problem: "The connection failed",
			}),
		};

		expect(labelOf(failed, "w-alice")).toStrictEqual(Option.none());
	});
});

describe("sorting the shelf", () => {
	it("finds a surname at the end of a name, past a generation", () => {
		expect(surnameOf("Ursula K. Le Guin")).toBe("Guin");
		expect(surnameOf("Frederick P. Brooks Jr.")).toBe("Brooks");
		expect(surnameOf("James S. A. Corey")).toBe("Corey");
		expect(surnameOf("  Homer ")).toBe("Homer");
		expect(surnameOf("")).toBe("");
	});

	it("orders by surname, then the whole name, then the title", () => {
		expect(titles(sortBooks(booksOf(shelved), "author"))).toStrictEqual([
			"The Mythical Man-Month",
			"Invisible Cities",
			"Alice in Wonderland",
			"Piranesi",
			"Dungeon Crawler Carl",
			"A Wizard of Earthsea",
			"The Dispossessed",
			"The Left Hand of Darkness",
			"The Pragmatic Programmer",
			"A Broken Print",
			"Empty Folder",
		]);
	});

	it("orders by title", () => {
		expect(
			titles(sortBooks(booksOf(shelved), "title")).slice(0, 3)
		).toStrictEqual([
			"A Broken Print",
			"A Wizard of Earthsea",
			"Alice in Wonderland",
		]);
	});

	it("puts the most recently read first, then the rest by title", () => {
		expect(
			titles(sortBooks(booksOf(shelved), "recent")).slice(0, 5)
		).toStrictEqual([
			"Alice in Wonderland",
			"Dungeon Crawler Carl",
			"The Mythical Man-Month",
			"A Wizard of Earthsea",
			"A Broken Print",
		]);
	});
});

describe("filtering the shelf", () => {
	it("lists every work when nothing is asked", () => {
		expect(listed({})).toHaveLength(11);
	});

	it("keeps the books of one kind", () => {
		expect(listed({ filter: "synced" })).toStrictEqual([
			"w-carl",
			"w-syncing",
			"w-unpaired",
			"w-unsynced",
		]);
		expect(listed({ filter: "text" })).toStrictEqual([
			"w-earthsea",
			"w-unmade",
		]);
		expect(listed({ filter: "audio" })).toStrictEqual(["w-alice", "w-copying"]);
		expect(listed({ filter: "pages" })).toStrictEqual([
			"w-mythical",
			"w-print",
		]);
	});

	it("keeps the books kept on this device, finished, or needing attention", () => {
		expect(listed({ filter: "kept" })).toStrictEqual(["w-carl", "w-earthsea"]);
		expect(listed({ filter: "finished" })).toStrictEqual(["w-earthsea"]);
		expect(listed({ filter: "attention" })).toStrictEqual([
			"w-copying",
			"w-print",
			"w-syncing",
			"w-unsynced",
		]);
	});

	it("searches titles and authors without minding case", () => {
		expect(listed({ query: "  le guin " })).toStrictEqual([
			"w-earthsea",
			"w-unpaired",
			"w-unsynced",
		]);
		expect(listed({ query: "WONDER" })).toStrictEqual(["w-alice"]);
		expect(listed({ query: "le guin", filter: "text" })).toStrictEqual([
			"w-earthsea",
		]);
		expect(listed({ query: "no such book" })).toStrictEqual([]);
	});

	it("puts the kept total on its chip, and offers attention only when needed", () => {
		const chips = chipsOf(booksOf(shelved), "all").map(({ label }) => label);

		expect(chips).toStrictEqual([
			"All",
			"Synced",
			"Text",
			"Audio",
			"Pages",
			"On this device · 2 (348 MB)",
			"Finished",
			"Needs attention · 4",
		]);

		const calm = booksOf({ ...shelved, copies: {} }).filter(
			(book) => book.state === "ready"
		);

		expect(chipsOf(calm, "all").map(({ label }) => label)).toStrictEqual([
			"All",
			"Synced",
			"Text",
			"Audio",
			"Pages",
			"On this device",
			"Finished",
		]);
	});
});

describe("the nightstand", () => {
	it("holds the books being read, the latest first", () => {
		expect(ids(nightstandBooks(shelved, booksOf(shelved)))).toStrictEqual([
			"w-alice",
			"w-carl",
		]);
	});

	it("steps aside for a search or a filter", () => {
		const searching = withUi(shelved, { query: "carl" });
		const filtering = withUi(shelved, { filter: "audio" });

		expect(nightstandBooks(searching, booksOf(searching))).toStrictEqual([]);
		expect(nightstandBooks(filtering, booksOf(filtering))).toStrictEqual([]);
	});
});

describe("the shelf offline", () => {
	it("lists only the books kept on this device", () => {
		expect(
			ids(listedBooks(offline, booksOf(offline))).toSorted()
		).toStrictEqual(["w-carl", "w-earthsea"]);
		expect(ids(nightstandBooks(offline, booksOf(offline)))).toStrictEqual([
			"w-carl",
		]);
	});

	it("lists every title when asked, the others out of reach", () => {
		const all = withUi(offline, { showAllOffline: true });

		expect(listedBooks(all, booksOf(all))).toHaveLength(11);
		expect(labelOf(all, "w-alice")).toStrictEqual(
			Option.some("Not on this device")
		);
		expect(isAvailable(named(all, "w-alice"), false)).toBeFalsy();
		expect(isAvailable(named(all, "w-carl"), false)).toBeTruthy();
		expect(isAvailable(named(all, "w-alice"), true)).toBeTruthy();
	});

	it("falls back on the kept copies when the shelf was never fetched", () => {
		const unreached: Model = { ...offline, shelf: Option.none() };
		const books = booksOf(unreached);

		expect(ids(books).toSorted()).toStrictEqual(["w-carl", "w-earthsea"]);
		expect(books.every((book) => book.opens)).toBeTruthy();
		expect(named(unreached, "w-carl").stage).toBe("reading");
	});

	it("stops saying it shows only the kept books once it shows them all", () => {
		expect(offlineNotice(booksOf(offline), true)).toBe(
			"Offline — 2 books kept on this device (348 MB). Your place is kept locally and sent when you are back."
		);
	});

	it("says how many books are kept and how much room they take", () => {
		expect(offlineNotice(booksOf(offline), false)).toBe(
			"Offline — showing 2 books kept on this device (348 MB). Your place is kept locally and sent when you are back."
		);
		expect(offlineNotice(booksOf({ ...offline, copies: {} }), false)).toBe(
			"Offline — no books are kept on this device. Your place is kept locally and sent when you are back."
		);
	});
});

describe("the shelf's controls", () => {
	it("search as you type, and clear back to the search field", () => {
		const typed = update(shelved, Message.ChangedShelfQuery({ value: "carl" }));

		expect(typed.model.shelfUi.query).toBe("carl");
		expect(typed.commands ?? []).toStrictEqual([]);

		const cleared = update(typed.model, Message.ClearedShelfQuery());

		expect(cleared.model.shelfUi.query).toBe("");
		expect(names(cleared.commands ?? [])).toStrictEqual(["FocusShelfSearch"]);
	});

	it("clear the search and the filter together", () => {
		const sifted = withUi(shelved, {
			query: "carl",
			filter: "audio",
			sort: "title",
		});

		const { model } = update(sifted, Message.ClearedShelfFilters());

		expect(model.shelfUi).toStrictEqual({
			...DEFAULT_SHELF_UI,
			sort: "title",
		});
	});

	it("sort and filter", () => {
		const sorted = update(
			shelved,
			Message.ChangedShelfSort({ sort: "author" })
		);

		const filtered = update(
			sorted.model,
			Message.SelectedShelfFilter({ filter: "kept" })
		);

		expect(filtered.model.shelfUi.sort).toBe("author");
		expect(filtered.model.shelfUi.filter).toBe("kept");
	});

	it("remember the grid or the list on this device", () => {
		const { model, commands } = update(
			shelved,
			Message.SelectedShelfLayout({ layout: "list" })
		);

		expect(model.shelfUi.layout).toBe("list");
		expect(names(commands ?? [])).toStrictEqual(["SaveShelfLayout"]);
	});

	it("show every title offline, and only the kept ones again", () => {
		const all = update(offline, Message.ToggledOfflineAll());

		expect(all.model.shelfUi.showAllOffline).toBeTruthy();

		const kept = update(all.model, Message.ToggledOfflineAll());

		expect(kept.model.shelfUi.showAllOffline).toBeFalsy();
	});

	it("show the kept ones first again after the connection returns", () => {
		const all = update(offline, Message.ToggledOfflineAll());
		const back = update(all.model, Message.WentOnline());

		expect(back.model.isOnline).toBeTruthy();
		expect(back.model.shelfUi.showAllOffline).toBeFalsy();
	});
});
