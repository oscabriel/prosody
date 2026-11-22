import { Match, Option, Schema } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import {
	alertIcon,
	audioIcon,
	closeIcon,
	gridIcon,
	keptIcon,
	listIcon,
	pagesIcon,
	searchIcon,
	syncedIcon,
	textIcon,
} from "./Icons.ts";
import { Message, ShelfSort } from "./Model.ts";
import type { Model } from "./Model.ts";
import { lastReadOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { deskRouter, roomRouter } from "./Route.ts";
import {
	booksOf,
	chipsOf,
	countOf,
	isAvailable,
	isKept,
	isKeptOnly,
	isSifted,
	KIND_LABEL,
	listedBooks,
	nightstandBooks,
	offlineNotice,
	rowStatusOf,
	statusOf,
} from "./ShelfBooks.ts";
import type { BookKind, BookStatus, ShelfBook } from "./ShelfBooks.ts";
import { SHELF_SEARCH_ID } from "./ShelfUpdate.ts";
import {
	badgeView,
	coverView,
	emptyStateView,
	offlineBannerView,
} from "./Ui.ts";

const kindIconView = (
	kind: BookKind,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Match.value(kind).pipe(
		Match.when("synced", () => [syncedIcon(h)]),
		Match.when("audio", () => [audioIcon(h)]),
		Match.when("pages", () => [pagesIcon(h)]),
		Match.when("text", () => [textIcon(h)]),
		Match.orElse(() => [])
	);

const kindNoteView = (
	kind: BookKind,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	kind === "unknown" || kind === "none"
		? []
		: [h.span([h.Class("sr-only")], [KIND_LABEL[kind]])];

const coverChipsView = (
	book: ShelfBook,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (book.state === "failed") {
		return [
			h.span(
				[h.Class("cover-chip is-danger"), h.Title("Needs attention")],
				[alertIcon(h)]
			),
		];
	}

	return book.kind === "synced" ||
		book.kind === "audio" ||
		book.kind === "pages"
		? [
				h.span(
					[h.Class("cover-chip"), h.Title(KIND_LABEL[book.kind])],
					kindIconView(book.kind, h)
				),
			]
		: [];
};

const hasCover = (book: ShelfBook): boolean => book.opens || isKept(book);

const STATE_CLASS = {
	muted: "book-card-state",
	ok: "book-card-state is-ok",
	danger: "book-card-state is-danger",
};

const cardStatusView = (
	status: Option.Option<BookStatus>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(status, {
		onNone: () => [],
		onSome: ({ text, tone, isKept: hasKeptMark }) => [
			h.span(
				[h.Class(STATE_CLASS[tone])],
				hasKeptMark ? [keptIcon(h), h.span([], [text])] : [h.span([], [text])]
			),
		],
	});

const cardView = (
	book: ShelfBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const isOpenable = isAvailable(book, isOnline);

	const inner = [
		coverView(book.id, book.title, hasCover(book), coverChipsView(book, h), h),
		h.p(
			[h.Class("book-card-title"), h.Dir("auto"), h.Title(book.title)],
			[book.title]
		),
		h.p(
			[h.Class("book-card-author"), h.Dir("auto"), h.Title(book.author)],
			[book.author]
		),
		...kindNoteView(book.kind, h),
		...cardStatusView(statusOf(book, isOnline), h),
	];

	return h.keyed("li")(
		book.id,
		[h.Class(isOpenable ? "book-card" : "book-card is-inert")],
		[
			isOpenable
				? h.a(
						[h.Class("book-card-link"), h.Href(roomRouter({ work: book.id }))],
						inner
					)
				: h.div([h.Class("book-card-link"), h.AriaDisabled(true)], inner),
		]
	);
};

const TONE_BADGE = {
	muted: "neutral",
	ok: "ok",
	danger: "danger",
} as const;

const rowBadgesView = (
	book: ShelfBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const kept = isKept(book)
		? [
				h.span(
					[h.Class("badge badge-ok"), h.Title("Kept on this device")],
					[
						keptIcon(h),
						h.span([h.Class("sr-only")], ["Kept on this device, "]),
						h.span([], [sizeIn(book.keptBytes)]),
					]
				),
			]
		: [];

	const { text, tone } = rowStatusOf(book, isOnline);

	return text === ""
		? kept
		: [...kept, badgeView(text, TONE_BADGE[tone], false, h)];
};

const rowView = (
	book: ShelfBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const isOpenable = isAvailable(book, isOnline);

	const inner = [
		coverView(book.id, book.title, hasCover(book), [], h),
		h.div(
			[h.Class("book-row-main")],
			[
				h.p(
					[h.Class("book-row-title"), h.Dir("auto"), h.Title(book.title)],
					[book.title]
				),
				h.p(
					[h.Class("book-row-author"), h.Dir("auto"), h.Title(book.author)],
					[book.author]
				),
			]
		),
		h.div([h.Class("book-row-end")], rowBadgesView(book, isOnline, h)),
	];

	return h.keyed("li")(
		book.id,
		[h.Class(isOpenable ? "book-row" : "book-row is-inert")],
		[
			isOpenable
				? h.a(
						[
							h.Class("book-row-inner book-row-link"),
							h.Href(roomRouter({ work: book.id })),
						],
						inner
					)
				: h.div([h.Class("book-row-inner"), h.AriaDisabled(true)], inner),
		]
	);
};

const nightstandCardView = (
	book: ShelfBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const isOpenable = isAvailable(book, isOnline);
	const isMissing = !isOnline && !isKept(book);

	const kept = isKept(book)
		? [
				h.span(
					[
						h.Class("kept-mark"),
						h.Title(`Kept on this device (${sizeIn(book.keptBytes)})`),
					],
					[keptIcon(h), h.span([h.Class("sr-only")], ["Kept on this device"])]
				),
			]
		: [];

	const inner = [
		coverView(book.id, book.title, hasCover(book), [], h),
		h.div(
			[h.Class("nightstand-meta")],
			[
				h.p(
					[h.Class("nightstand-title"), h.Dir("auto"), h.Title(book.title)],
					[book.title]
				),
				h.p(
					[h.Class("nightstand-author"), h.Dir("auto"), h.Title(book.author)],
					[book.author]
				),
				h.div(
					[h.Class("nightstand-foot")],
					[
						...kindIconView(book.kind, h),
						...kindNoteView(book.kind, h),
						h.span(
							[h.Class("nightstand-foot-text")],
							[
								isMissing
									? "Not on this device"
									: lastReadOf(book.device, book.at),
							]
						),
						...kept,
					]
				),
			]
		),
	];

	return isOpenable
		? h.keyed("a")(
				book.id,
				[h.Class("nightstand-card"), h.Href(roomRouter({ work: book.id }))],
				inner
			)
		: h.keyed("div")(
				book.id,
				[h.Class("nightstand-card is-inert"), h.AriaDisabled(true)],
				inner
			);
};

const nightstandView = (
	model: Model,
	books: ReadonlyArray<ShelfBook>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const reading = nightstandBooks(model, books);

	return reading.length === 0
		? []
		: [
				h.section(
					[h.AriaLabelledBy("nightstand-heading")],
					[
						h.div(
							[h.Class("section-head first")],
							[
								h.h2(
									[h.Class("section-title"), h.Id("nightstand-heading")],
									["On the nightstand"]
								),
								h.span(
									[h.Class("page-count tabular")],
									[`${reading.length} reading`]
								),
							]
						),
						h.div(
							[h.Class("nightstand-rail")],
							reading.map((book) => nightstandCardView(book, model.isOnline, h))
						),
					]
				),
			];
};

const sortOf = (value: string): ShelfSort =>
	Schema.is(ShelfSort)(value) ? value : "recent";

const SORTS = [
	["recent", "Sort: Recent"],
	["author", "Sort: Author"],
	["title", "Sort: Title"],
] as const;

const controlsView = (
	model: Model,
	books: ReadonlyArray<ShelfBook>,
	h: HtmlBuilder<Message>
): Html => {
	const { query, sort, filter, layout } = model.shelfUi;

	return h.div(
		[h.Class("shelf-controls")],
		[
			h.div(
				[h.Class("shelf-toolbar")],
				[
					h.div(
						[h.Class("search-wrap")],
						[
							h.span([h.Class("search-icon")], [searchIcon(h)]),
							h.label(
								[h.Class("sr-only"), h.For(SHELF_SEARCH_ID)],
								["Search books by title or author"]
							),
							h.input([
								h.Id(SHELF_SEARCH_ID),
								h.Class("input input-compact"),
								h.Type("search"),
								h.Placeholder("Search title or author…"),
								h.Autocomplete("off"),
								h.AriaKeyshortcuts("/"),
								h.Value(query),
								h.OnInput((value) => Message.ChangedShelfQuery({ value })),
							]),
							h.button(
								[
									h.Type("button"),
									h.Class("search-clear"),
									h.AriaLabel("Clear search"),
									h.Hidden(query === ""),
									h.OnClick(Message.ClearedShelfQuery()),
								],
								[closeIcon(h)]
							),
						]
					),
					h.div(
						[h.Class("shelf-toolbar-right")],
						[
							h.select(
								[
									h.Id("shelf-sort"),
									h.Class("select select-compact"),
									h.AriaLabel("Sort books"),
									h.OnChange((value) =>
										Message.ChangedShelfSort({ sort: sortOf(value) })
									),
								],
								SORTS.map(([value, label]) =>
									h.option(
										[h.Value(value), h.Selected(sort === value)],
										[label]
									)
								)
							),
							h.div(
								[
									h.Class("segmented"),
									h.Role("group"),
									h.AriaLabel("Library view"),
								],
								[
									h.button(
										[
											h.Type("button"),
											h.Class("segmented-btn"),
											h.AriaLabel("Grid view"),
											h.AriaKeyshortcuts("G"),
											h.AriaPressed(String(layout === "grid")),
											h.OnClick(
												Message.SelectedShelfLayout({ layout: "grid" })
											),
										],
										[gridIcon(h)]
									),
									h.button(
										[
											h.Type("button"),
											h.Class("segmented-btn"),
											h.AriaLabel("List view"),
											h.AriaKeyshortcuts("L"),
											h.AriaPressed(String(layout === "list")),
											h.OnClick(
												Message.SelectedShelfLayout({ layout: "list" })
											),
										],
										[listIcon(h)]
									),
								]
							),
						]
					),
				]
			),
			h.div(
				[h.Class("chips"), h.Role("group"), h.AriaLabel("Filter library")],
				chipsOf(books, filter).map((chip) =>
					h.keyed("button")(
						chip.filter,
						[
							h.Type("button"),
							h.Class("chip"),
							h.AriaPressed(String(filter === chip.filter)),
							h.OnClick(Message.SelectedShelfFilter({ filter: chip.filter })),
						],
						[chip.label]
					)
				)
			),
		]
	);
};

const listingView = (
	model: Model,
	books: ReadonlyArray<ShelfBook>,
	listed: ReadonlyArray<ShelfBook>,
	h: HtmlBuilder<Message>
): Html => {
	if (listed.length > 0) {
		return model.shelfUi.layout === "grid"
			? h.ol(
					[h.Class("book-grid")],
					listed.map((book) => cardView(book, model.isOnline, h))
				)
			: h.ol(
					[h.Class("book-list")],
					listed.map((book) => rowView(book, model.isOnline, h))
				);
	}

	if (isKeptOnly(model) && !isSifted(model) && books.length > 0) {
		return emptyStateView(
			3,
			"Nothing kept on this device",
			"Books you keep on this device open here while you are offline.",
			[
				h.button(
					[
						h.Type("button"),
						h.Class("btn btn-secondary"),
						h.OnClick(Message.ToggledOfflineAll()),
					],
					["Show all titles"]
				),
			],
			h
		);
	}

	return emptyStateView(
		3,
		"No matching books",
		"Nothing on the shelf matches your current search or filter.",
		[
			h.button(
				[
					h.Type("button"),
					h.Class("btn btn-secondary"),
					h.OnClick(Message.ClearedShelfFilters()),
				],
				["Clear filters"]
			),
		],
		h
	);
};

const libraryView = (
	model: Model,
	books: ReadonlyArray<ShelfBook>,
	h: HtmlBuilder<Message>
): Html => {
	const listed = listedBooks(model, books);

	return h.section(
		[h.AriaLabelledBy("library-heading")],
		[
			h.div(
				[h.Class("section-head")],
				[
					h.h2(
						[h.Class("section-title"), h.Id("library-heading")],
						["Every work"]
					),
					h.span(
						[h.Class("page-count tabular"), h.AriaLive("polite")],
						[
							listed.length === books.length
								? ""
								: `${listed.length} of ${books.length}`,
						]
					),
				]
			),
			controlsView(model, books, h),
			listingView(model, books, listed, h),
		]
	);
};

const offlineView = (
	model: Model,
	books: ReadonlyArray<ShelfBook>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (model.isOnline) {
		return [];
	}

	const toggle = books.some((book) => !isKept(book))
		? [
				h.button(
					[
						h.Type("button"),
						h.Class("btn btn-secondary btn-sm"),
						h.OnClick(Message.ToggledOfflineAll()),
					],
					[model.shelfUi.showAllOffline ? "Kept only" : "Show all titles"]
				),
			]
		: [];

	return [
		offlineBannerView(
			offlineNotice(books, model.shelfUi.showAllOffline),
			toggle,
			h
		),
	];
};

const SKELETONS = ["82%", "74%", "88%", "70%", "80%", "76%"];

const headerView = (status: string, h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("page-header")],
		[
			h.h1([h.Class("page-title")], ["The shelf"]),
			h.span([h.Class("page-count tabular"), h.AriaLive("polite")], [status]),
		]
	);

const openingView = (h: HtmlBuilder<Message>): Html =>
	h.section(
		[h.AriaBusy(true), h.AriaLabel("Opening the shelf")],
		[
			headerView("Opening the shelf…", h),
			h.div(
				[h.Class("book-grid"), h.AriaHidden(true)],
				SKELETONS.map((width) =>
					h.div(
						[h.Class("skel-card")],
						[
							h.div([h.Class("skeleton shelf-skel-cover")], []),
							h.div(
								[h.Class("skeleton shelf-skel-title"), h.Style({ width })],
								[]
							),
							h.div([h.Class("skeleton shelf-skel-author")], []),
						]
					)
				)
			),
		]
	);

const unreachableOf = (model: Model): string =>
	Option.match(model.error, {
		onNone: () => "Can't reach the shelf",
		onSome: (reason) => `Can't reach the shelf: ${reason}`,
	});

const statusLineOf = (model: Model, count: number): string =>
	Option.isSome(model.error) || (Option.isNone(model.shelf) && !model.isOnline)
		? unreachableOf(model)
		: countOf(count);

export const shelfView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const books = booksOf(model);

	const isUnreachable =
		Option.isNone(model.shelf) &&
		(!model.isOnline || Option.isSome(model.error));

	if (books.length === 0 && isUnreachable) {
		return {
			title: "Prosody",
			body: h.div(
				[],
				[
					...offlineView(model, books, h),
					emptyStateView(
						1,
						unreachableOf(model),
						"Books you keep on this device open here while you are offline. The rest of the shelf returns when you are back.",
						[],
						h
					),
				]
			),
		};
	}

	if (!model.hasAnswered && Option.isNone(model.shelf) && !isUnreachable) {
		return {
			title: "Prosody",
			body: h.div([], [openingView(h)]),
		};
	}

	if (books.length === 0) {
		return {
			title: "Prosody",
			body: h.div(
				[],
				[
					emptyStateView(
						1,
						"Nothing on the shelf yet",
						"Your library lives here. Books with text and audio joined are synced; books with one edition open to read, hear, or turn page by page. Each opens where you left it across your devices.",
						[
							h.a(
								[h.Class("btn btn-primary"), h.Href(deskRouter())],
								["Ask at the desk"]
							),
						],
						h
					),
				]
			),
		};
	}

	return {
		title: "Prosody",
		body: h.div(
			[],
			[
				headerView(statusLineOf(model, books.length), h),
				...offlineView(model, books, h),
				...nightstandView(model, books, h),
				libraryView(model, books, h),
			]
		),
	};
};
