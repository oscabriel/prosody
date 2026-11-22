import type {
	Made,
	ShelfEntry,
	Sync,
} from "@prosody/domain/Library/Shelf.view";
import { editionToCopy } from "@prosody/domain/Reading/CopyEdition.command";
import type { Standing } from "@prosody/domain/Reading/Nightstand.view";
import type { Stage } from "@prosody/domain/Reading/Stage";
import { Option } from "effect";

import type { Copying, Model, ShelfFilter, ShelfSort } from "./Model.ts";
import { percentOf, sizeIn } from "./OnDevice.ts";

export type BookKind =
	| "synced"
	| "text"
	| "audio"
	| "pages"
	| "none"
	| "unknown";

export type BookState =
	| "ready"
	| "syncing"
	| "copying"
	| "failed"
	| "unpaired"
	| "unmade"
	| "none";

export interface Keeping {
	readonly done: number;
	readonly of: number;
}

export interface ShelfBook {
	readonly id: string;
	readonly title: string;
	readonly author: string;
	readonly kind: BookKind;
	readonly state: BookState;
	readonly opens: boolean;
	readonly stage: Stage;
	readonly at: number;
	readonly device: string;
	readonly keptBytes: number;
	readonly keeping: Option.Option<Keeping>;
}

export type StatusTone = "muted" | "ok" | "danger";

export interface BookStatus {
	readonly text: string;
	readonly tone: StatusTone;
	readonly isKept: boolean;
}

export interface FilterChip {
	readonly filter: ShelfFilter;
	readonly label: string;
}

interface Readiness {
	readonly kind: BookKind;
	readonly state: BookState;
	readonly opens: boolean;
}

const PAIR_STATE = {
	syncing: { state: "syncing", opens: false },
	synced: { state: "ready", opens: true },
	failed: { state: "failed", opens: true },
} as const;

const ALONE_STATE = {
	copying: { state: "copying", opens: false },
	made: { state: "ready", opens: true },
	failed: { state: "failed", opens: true },
} as const;

const readinessOf = (
	entry: ShelfEntry,
	sync: Sync | undefined,
	made: Made | undefined
): Readiness => {
	if (entry.text && entry.audio) {
		return sync === undefined
			? { kind: "synced", state: "unpaired", opens: false }
			: { kind: "synced", ...PAIR_STATE[sync.state] };
	}

	const alone = editionToCopy((kind) => entry[kind]);

	if (alone === undefined) {
		return { kind: "none", state: "none", opens: false };
	}

	return made === undefined
		? { kind: alone, state: "unmade", opens: false }
		: { kind: alone, ...ALONE_STATE[made.state] };
};

const keepingOf = (
	copying: Option.Option<Copying>,
	work: string
): Option.Option<Keeping> =>
	Option.map(
		Option.filter(
			copying,
			(active) => active.work === work && active.problem === null
		),
		({ done, of }) => ({ done, of })
	);

const UNOPENED: Standing = { stage: "unopened", at: 0, device: "" };

export const booksOf = (model: Model): ReadonlyArray<ShelfBook> => {
	const standings = Option.match(model.nightstand, {
		onNone: (): Readonly<Record<string, Standing>> => ({}),
		onSome: ({ works }) => works,
	});

	return Option.match(model.shelf, {
		onNone: () =>
			Object.entries(model.copies).map(([id, copy]) => {
				const standing = standings[id] ?? UNOPENED;

				return {
					id,
					title: copy.title,
					author: copy.author,
					kind: "unknown" as const,
					state: "ready" as const,
					opens: true,
					stage: standing.stage,
					at: standing.at,
					device: standing.device,
					keptBytes: copy.bytes,
					keeping: Option.none(),
				};
			}),
		onSome: ({ works, syncs, copies }) =>
			Object.entries(works).map(([id, entry]) => {
				const standing = standings[id] ?? UNOPENED;

				return {
					id,
					title: entry.title,
					author: entry.author,
					...readinessOf(entry, syncs[id], copies[id]),
					stage: standing.stage,
					at: standing.at,
					device: standing.device,
					keptBytes: model.copies[id]?.bytes ?? 0,
					keeping: keepingOf(model.copying, id),
				};
			}),
	});
};

const GENERATION = /^(?:jr|sr|ii|iii|iv)\.?$/iu;

export const surnameOf = (author: string): string => {
	const parts = author.trim().split(/\s+/u);
	const last = parts.at(-1) ?? "";

	if (parts.length > 1 && GENERATION.test(last)) {
		return parts.at(-2) ?? last;
	}

	return last;
};

const byTitle = (a: ShelfBook, b: ShelfBook): number =>
	a.title.localeCompare(b.title);

const byAuthor = (a: ShelfBook, b: ShelfBook): number =>
	surnameOf(a.author).localeCompare(surnameOf(b.author)) ||
	a.author.localeCompare(b.author) ||
	byTitle(a, b);

const byRecent = (a: ShelfBook, b: ShelfBook): number =>
	b.at - a.at || byTitle(a, b);

const ORDER = { recent: byRecent, author: byAuthor, title: byTitle };

export const sortBooks = (
	books: ReadonlyArray<ShelfBook>,
	sort: ShelfSort
): ReadonlyArray<ShelfBook> => books.toSorted(ORDER[sort]);

export const isKept = (book: ShelfBook): boolean => book.keptBytes > 0;

export const needsAttention = (book: ShelfBook): boolean =>
	book.state === "failed" ||
	book.state === "syncing" ||
	book.state === "copying";

const FILTERS: Readonly<Record<ShelfFilter, (book: ShelfBook) => boolean>> = {
	all: () => true,
	synced: (book) => book.kind === "synced",
	text: (book) => book.kind === "text",
	audio: (book) => book.kind === "audio",
	pages: (book) => book.kind === "pages",
	kept: isKept,
	finished: (book) => book.stage === "finished",
	attention: needsAttention,
};

const isFound = (book: ShelfBook, query: string): boolean => {
	const sought = query.trim().toLowerCase();

	return (
		sought === "" ||
		book.title.toLowerCase().includes(sought) ||
		book.author.toLowerCase().includes(sought)
	);
};

export const isKeptOnly = (model: Model): boolean =>
	!model.isOnline && !model.shelfUi.showAllOffline;

export const isSifted = (model: Model): boolean =>
	model.shelfUi.query.trim() !== "" || model.shelfUi.filter !== "all";

export const listedBooks = (
	model: Model,
	books: ReadonlyArray<ShelfBook>
): ReadonlyArray<ShelfBook> => {
	const { query, filter, sort } = model.shelfUi;
	const keptOnly = isKeptOnly(model);

	return sortBooks(
		books.filter(
			(book) =>
				(!keptOnly || isKept(book)) &&
				FILTERS[filter](book) &&
				isFound(book, query)
		),
		sort
	);
};

export const nightstandBooks = (
	model: Model,
	books: ReadonlyArray<ShelfBook>
): ReadonlyArray<ShelfBook> => {
	if (isSifted(model)) {
		return [];
	}

	const keptOnly = isKeptOnly(model);

	return books
		.filter((book) => book.stage === "reading" && (!keptOnly || isKept(book)))
		.toSorted((a, b) => b.at - a.at);
};

export const isAvailable = (book: ShelfBook, isOnline: boolean): boolean =>
	book.opens && (isOnline || isKept(book));

export const keepingLabel = ({ done, of }: Keeping): string =>
	of > 0 ? `Keeping · ${percentOf(done, of)}%` : "Keeping…";

const muted = (text: string): Option.Option<BookStatus> =>
	Option.some({ text, tone: "muted", isKept: false });

const STATE_STATUS: Readonly<Record<BookState, Option.Option<BookStatus>>> = {
	ready: Option.none(),
	syncing: muted("Syncing…"),
	copying: muted("Copying…"),
	failed: Option.none(),
	unpaired: muted("Not paired"),
	unmade: muted("One edition"),
	none: muted("No editions"),
};

const standingStatusOf = (book: ShelfBook): Option.Option<BookStatus> => {
	if (book.stage === "finished") {
		return Option.some({
			text: isKept(book) ? "Finished · Kept" : "Finished",
			tone: "ok",
			isKept: isKept(book),
		});
	}

	return isKept(book)
		? Option.some({ text: "Kept", tone: "ok", isKept: true })
		: Option.none();
};

export const statusOf = (
	book: ShelfBook,
	isOnline: boolean
): Option.Option<BookStatus> => {
	if (!isOnline && !isKept(book)) {
		return muted("Not on this device");
	}

	if (book.state === "failed") {
		return Option.some({
			text: book.kind === "synced" ? "Not synced" : "Not copied",
			tone: "danger",
			isKept: false,
		});
	}

	return Option.orElse(STATE_STATUS[book.state], () =>
		Option.orElse(
			Option.map(book.keeping, (keeping) => ({
				text: keepingLabel(keeping),
				tone: "muted" as const,
				isKept: false,
			})),
			() => standingStatusOf(book)
		)
	);
};

export const KIND_LABEL: Readonly<Record<BookKind, string>> = {
	synced: "Synced",
	text: "Text",
	audio: "Audio",
	pages: "Pages",
	none: "No editions",
	unknown: "",
};

export interface RowStatus {
	readonly text: string;
	readonly tone: StatusTone;
}

export const rowStatusOf = (book: ShelfBook, isOnline: boolean): RowStatus => {
	const kind: RowStatus = { text: KIND_LABEL[book.kind], tone: "muted" };

	return Option.match(statusOf(book, isOnline), {
		onNone: () => kind,
		onSome: ({ text, tone, isKept: hasKeptMark }) => {
			if (!hasKeptMark) {
				return { text, tone };
			}

			return book.stage === "finished"
				? { text: "Finished", tone: "ok" }
				: kind;
		},
	});
};

export interface KeptTotal {
	readonly count: number;
	readonly bytes: number;
}

export const keptTotalOf = (books: ReadonlyArray<ShelfBook>): KeptTotal => {
	const kept = books.filter(isKept);

	return {
		count: kept.length,
		bytes: kept.reduce((sum, book) => sum + book.keptBytes, 0),
	};
};

export const chipsOf = (
	books: ReadonlyArray<ShelfBook>,
	selected: ShelfFilter
): ReadonlyArray<FilterChip> => {
	const kept = keptTotalOf(books);
	const attention = books.filter(needsAttention).length;

	const chips: Array<FilterChip> = [
		{ filter: "all", label: "All" },
		{ filter: "synced", label: "Synced" },
		{ filter: "text", label: "Text" },
		{ filter: "audio", label: "Audio" },
		{ filter: "pages", label: "Pages" },
		{
			filter: "kept",
			label:
				kept.count > 0
					? `On this device · ${kept.count} (${sizeIn(kept.bytes)})`
					: "On this device",
		},
		{ filter: "finished", label: "Finished" },
	];

	if (attention > 0 || selected === "attention") {
		chips.push({
			filter: "attention",
			label: `Needs attention · ${attention}`,
		});
	}

	return chips;
};

export const countOf = (count: number): string =>
	count === 1 ? "1 work" : `${count} works`;

export const offlineNotice = (
	books: ReadonlyArray<ShelfBook>,
	showsAll: boolean
): string => {
	const kept = keptTotalOf(books);

	if (kept.count === 0) {
		return "Offline — no books are kept on this device. Your place is kept locally and sent when you are back.";
	}

	const noun = kept.count === 1 ? "book" : "books";

	const lead = showsAll ? "Offline —" : "Offline — showing";

	return `${lead} ${kept.count} ${noun} kept on this device (${sizeIn(kept.bytes)}). Your place is kept locally and sent when you are back.`;
};
