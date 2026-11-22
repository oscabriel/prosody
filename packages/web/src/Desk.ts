import type { Release } from "@prosody/domain/Acquisition/Release";
import type {
	Catalogued,
	WantedBook,
} from "@prosody/domain/Acquisition/Wanted.view";
import type { Recording } from "@prosody/domain/Library/Metadata.external";
import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { correctionView, correctView } from "./Correcting.ts";
import { DESK_TAB_ID } from "./DeskUpdate.ts";
import { activityOf, grabsView, kindOf } from "./Grabbed.ts";
import { externalIcon } from "./Icons.ts";
import { ConfirmAction, Message } from "./Model.ts";
import type { Correction, DeskTab, Model } from "./Model.ts";
import { dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { badgeView, emptyStateView, offlineBannerView } from "./Ui.ts";

const PANEL_ID: Readonly<Record<DeskTab, string>> = {
	wants: "panel-wants",
	grabs: "panel-grabs",
};

const lengthOf = (minutes: number): string =>
	minutes < 60
		? `${minutes} min`
		: `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

const dateOf = (iso: string): string =>
	new Date(iso).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

const countedOf = (count: number, one: string, many: string): string =>
	count === 1 ? `1 ${one}` : `${count} ${many}`;

const openLibraryView = (
	openLibrary: string | null,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html | string> =>
	openLibrary === null
		? []
		: [
				" ",
				h.span(
					[h.Class("desk-meta-tail")],
					[
						"· ",
						h.a(
							[
								h.Class("desk-link"),
								h.Href(`https://openlibrary.org/works/${openLibrary}`),
								h.Target("_blank"),
								h.Rel("noreferrer"),
							],
							["Open Library", externalIcon(h)]
						),
					]
				),
			];

const bylineView = (
	book: WantedBook,
	catalogued: Option.Option<Catalogued>,
	h: HtmlBuilder<Message>
): Html => {
	const wanted = `Wanted ${dayOf(book.at)}`;

	return Option.match(catalogued, {
		onNone: () =>
			h.p(
				[h.Class("desk-meta"), h.Dir("auto")],
				[`${book.author} · ${wanted}`]
			),
		onSome: ({ author, description: { year, openLibrary } }) =>
			h.p(
				[h.Class("desk-meta"), h.Dir("auto")],
				[
					`${year === null ? author : `${author}, ${year}`} · ${wanted}`,
					...openLibraryView(openLibrary, h),
				]
			),
	});
};

const failureView = (
	book: WantedBook,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	book.state === "failed"
		? [h.p([h.Class("desk-meta is-danger")], [book.note])]
		: [];

const recordingOf = ({ narrators, minutes, chapters }: Recording): string => {
	const parts = [
		narrators.length === 0
			? "Audiobook"
			: `Audiobook read by ${narrators.join(", ")}`,
	];

	if (minutes > 0) {
		parts.push(lengthOf(minutes));
	}

	if (chapters.length > 0) {
		parts.push(countedOf(chapters.length, "chapter", "chapters"));
	}

	return parts.join(", ");
};

const recordingView = (
	catalogued: Option.Option<Catalogued>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(
		Option.flatMapNullishOr(
			catalogued,
			({ description }) => description.recording
		),
		{
			onNone: () => [],
			onSome: (recording) => [
				h.p([h.Class("desk-meta")], [recordingOf(recording)]),
			],
		}
	);

const grabView = (
	work: string,
	release: Release,
	book: WantedBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html => {
	if (book.grabbed.includes(release.id)) {
		return badgeView("Grabbed", "ok", false, h);
	}

	return release.link === null
		? badgeView("Search again to grab", "neutral", false, h)
		: h.button(
				[
					h.Type("button"),
					h.Class("btn btn-secondary btn-sm"),
					h.Disabled(!isOnline),
					h.OnClick(Message.ClickedGrab({ work, release: release.id })),
				],
				["Grab"]
			);
};

const offerTitleView = (release: Release, h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("offer-title"), h.Dir("auto")],
		[
			release.page === null
				? release.title
				: h.a(
						[h.Href(release.page), h.Target("_blank"), h.Rel("noreferrer")],
						[h.span([], [release.title]), externalIcon(h)]
					),
		]
	);

const offerView = (
	work: string,
	release: Release,
	book: WantedBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("li")(
		release.id,
		[h.Class("offer-row")],
		[
			h.div(
				[h.Class("offer-main")],
				[
					offerTitleView(release, h),
					h.div(
						[h.Class("offer-meta")],
						[
							badgeView(kindOf(release.kind), "neutral", false, h),
							h.span([], [sizeIn(release.bytes)]),
							h.span(
								[],
								[`· ${countedOf(release.seeders, "seeder", "seeders")}`]
							),
							h.span([], [`· ${dateOf(release.published)}`]),
							h.span([], [`· ${release.indexer}`]),
						]
					),
				]
			),
			h.div(
				[h.Class("offer-end")],
				[grabView(work, release, book, isOnline, h)]
			),
		]
	);

const stateView = (book: WantedBook, h: HtmlBuilder<Message>): Html => {
	if (book.state === "searching") {
		return badgeView("Searching…", "neutral", true, h);
	}

	if (book.state === "failed") {
		return badgeView("Search failed", "danger", false, h);
	}

	return badgeView(
		countedOf(book.offers.length, "offer", "offers"),
		"neutral",
		false,
		h
	);
};

const titleOf = (
	book: WantedBook,
	catalogued: Option.Option<Catalogued>
): string =>
	Option.match(catalogued, {
		onNone: () => book.title,
		onSome: ({ title }) => title,
	});

const headingView = (
	book: WantedBook,
	catalogued: Option.Option<Catalogued>,
	correcting: Option.Option<Correction>,
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(correcting, {
		onSome: (correction) => [correctionView(correction, model.isOnline, h)],
		onNone: () => [
			h.div(
				[h.Class("desk-item-head")],
				[
					h.h3(
						[h.Class("desk-item-title"), h.Dir("auto")],
						[titleOf(book, catalogued)]
					),
					stateView(book, h),
				]
			),
			bylineView(book, catalogued, h),
		],
	});

const offersView = (
	work: string,
	book: WantedBook,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	book.offers.length === 0
		? []
		: [
				h.ol(
					[h.Class("offers-list")],
					book.offers.map((release) =>
						offerView(work, release, book, isOnline, h)
					)
				),
			];

const isShelved = (model: Model, work: string): boolean =>
	Option.exists(model.wanted, ({ grabs }) =>
		Object.values(grabs).some(
			(grabbed) => grabbed.work === work && grabbed.shelf !== null
		)
	);

const wantView = (
	work: string,
	book: WantedBook,
	catalogued: Option.Option<Catalogued>,
	model: Model,
	h: HtmlBuilder<Message>
): Html => {
	const correcting = Option.filter(
		model.desk.correcting,
		(correction) => correction.work === work
	);

	return h.keyed("li")(
		work,
		[h.Class("desk-item")],
		[
			...headingView(book, catalogued, correcting, model, h),
			...recordingView(catalogued, h),
			...failureView(book, h),
			h.div(
				[h.Class("desk-actions")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary btn-sm"),
							h.Disabled(!model.isOnline),
							h.OnClick(Message.ClickedSearchAgain({ work })),
						],
						["Search again"]
					),
					...correctView(
						work,
						isShelved(model, work) || Option.isSome(correcting),
						model.isOnline,
						h
					),
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-danger-ghost btn-sm"),
							h.Disabled(!model.isOnline),
							h.OnClick(
								Message.RequestedConfirm({
									action: ConfirmAction.Withdraw({
										work,
										title: titleOf(book, catalogued),
									}),
								})
							),
						],
						["Withdraw"]
					),
				]
			),
			...offersView(work, book, model.isOnline, h),
		]
	);
};

const formView = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.form(
		[
			h.Class("desk-form"),
			h.Novalidate(true),
			h.AriaLabel("Ask for a book"),
			h.OnSubmit(Message.SubmittedWant()),
		],
		[
			h.div(
				[h.Class("field-group")],
				[
					h.label([h.Class("field-label"), h.For("want-title")], ["Title"]),
					h.input([
						h.Id("want-title"),
						h.Class("input"),
						h.Name("title"),
						h.Value(model.desk.title),
						h.Placeholder("e.g. Piranesi"),
						h.Required(true),
						h.Autocomplete("off"),
						h.Disabled(!model.isOnline),
						h.OnInput((value) => Message.ChangedWantTitle({ value })),
					]),
				]
			),
			h.div(
				[h.Class("field-group")],
				[
					h.label([h.Class("field-label"), h.For("want-author")], ["Author"]),
					h.input([
						h.Id("want-author"),
						h.Class("input"),
						h.Name("author"),
						h.Value(model.desk.author),
						h.Placeholder("e.g. Susanna Clarke"),
						h.Required(true),
						h.Autocomplete("off"),
						h.Disabled(!model.isOnline),
						h.OnInput((value) => Message.ChangedWantAuthor({ value })),
					]),
				]
			),
			h.button(
				[
					h.Type("submit"),
					h.Class("btn btn-primary"),
					h.Disabled(!model.isOnline),
				],
				["Want it"]
			),
		]
	);

const problemView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(model.desk.problem, {
		onNone: () => [],
		onSome: (problem) => [
			h.div(
				[h.Class("banner banner-danger"), h.Role("alert")],
				[h.span([], [problem])]
			),
		],
	});

const activityView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const summary = Option.match(model.wanted, {
		onNone: () => "",
		onSome: ({ grabs }) => activityOf(grabs),
	});

	return summary === "" || model.deskUi.tab === "grabs"
		? []
		: [
				h.div(
					[h.Class("activity-strip")],
					[
						h.span([], [summary]),
						h.button(
							[
								h.Type("button"),
								h.Class("btn btn-ghost btn-sm"),
								h.OnClick(Message.SelectedDeskTab({ tab: "grabs" })),
							],
							["View grabs →"]
						),
					]
				),
			];
};

const otherTab = (tab: DeskTab): DeskTab =>
	tab === "wants" ? "grabs" : "wants";

const tabView = (
	tab: DeskTab,
	label: string,
	model: Model,
	h: HtmlBuilder<Message>
): Html => {
	const isSelected = model.deskUi.tab === tab;

	return h.button(
		[
			h.Type("button"),
			h.Class("segmented-btn"),
			h.Role("tab"),
			h.Id(DESK_TAB_ID[tab]),
			h.AriaControls(PANEL_ID[tab]),
			h.AriaSelected(isSelected),
			h.Tabindex(isSelected ? 0 : -1),
			h.OnClick(Message.SelectedDeskTab({ tab })),
			h.OnKeyDownFocus((key) =>
				key === "ArrowLeft" || key === "ArrowRight"
					? Option.some({
							focusSelector: `#${DESK_TAB_ID[otherTab(tab)]}`,
							message: Message.SelectedDeskTab({ tab: otherTab(tab) }),
						})
					: Option.none()
			),
		],
		[label]
	);
};

const labelOf = (name: string, count: Option.Option<number>): string =>
	Option.match(count, {
		onNone: () => name,
		onSome: (total) => `${name} (${total})`,
	});

const skeletonView = (h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("desk-skeleton"), h.AriaHidden(true)],
		["46%", "58%", "38%"].map((width) =>
			h.div(
				[h.Class("desk-item")],
				[
					h.div([h.Class("skeleton desk-skel-title"), h.Style({ width })], []),
					h.div([h.Class("skeleton desk-skel-meta")], []),
					h.div([h.Class("skeleton desk-skel-moves")], []),
				]
			)
		)
	);

const unopenedView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	model.isOnline
		? [skeletonView(h)]
		: [
				emptyStateView(
					2,
					"Can't reach the desk",
					"Your wants and grabs appear here when you are back online.",
					[],
					h
				),
			];

const wantsView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(model.wanted, {
		onNone: () => unopenedView(model, h),
		onSome: ({ wants, catalogue }) => {
			const entries = Object.entries(wants).toSorted(
				([, a], [, b]) => b.at - a.at
			);

			return entries.length === 0
				? [
						emptyStateView(
							2,
							"Nothing wanted yet",
							"Enter a title and author above to search for offers and follow them to the shelf.",
							[],
							h
						),
					]
				: [
						h.ol(
							[h.Class("desk-list")],
							entries.map(([work, book]) =>
								wantView(
									work,
									book,
									Option.fromUndefinedOr(catalogue[work]),
									model,
									h
								)
							)
						),
					];
		},
	});

const grabsPanelView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(model.wanted, {
		onNone: () => unopenedView(model, h),
		onSome: ({ grabs }) => grabsView(grabs, model.isOnline, h),
	});

const offlineView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	model.isOnline
		? []
		: [
				offlineBannerView(
					"Offline — connect to ask for books, grab offers, or manage downloads.",
					[],
					h
				),
			];

const statusOf = (model: Model): string =>
	Option.match(model.wanted, {
		onNone: () =>
			model.isOnline ? "Opening the desk" : "Can't reach the desk",
		onSome: ({ wants, grabs }) =>
			model.deskUi.tab === "wants"
				? `${countedOf(Object.keys(wants).length, "book", "books")} wanted`
				: countedOf(Object.keys(grabs).length, "grab", "grabs"),
	});

export const deskView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const { tab } = model.deskUi;
	const isOpening = Option.isNone(model.wanted) && model.isOnline;

	const wantCount = Option.map(
		model.wanted,
		({ wants }) => Object.keys(wants).length
	);

	const grabCount = Option.map(
		model.wanted,
		({ grabs }) => Object.keys(grabs).length
	);

	return {
		title: "The desk · Prosody",
		body: h.div(
			[],
			[
				h.div(
					[h.Class("page-header")],
					[
						h.h1([h.Class("page-title")], ["The desk"]),
						h.span(
							[h.Class("page-count")],
							["Ask for a book and follow it to the shelf"]
						),
					]
				),
				...offlineView(model, h),
				formView(model, h),
				...problemView(model, h),
				...activityView(model, h),
				h.div(
					[h.Class("desk-tabs-row")],
					[
						h.div(
							[
								h.Class("segmented"),
								h.Role("tablist"),
								h.AriaLabel("Desk sections"),
							],
							[
								tabView("wants", labelOf("Wants", wantCount), model, h),
								tabView("grabs", labelOf("Grabs", grabCount), model, h),
							]
						),
						h.span(
							[h.Class("sr-only"), h.AriaLive("polite")],
							[statusOf(model)]
						),
					]
				),
				h.section(
					[
						h.Id(PANEL_ID.wants),
						h.Role("tabpanel"),
						h.AriaLabelledBy(DESK_TAB_ID.wants),
						h.AriaBusy(isOpening),
						h.Hidden(tab !== "wants"),
					],
					[h.h2([h.Class("sr-only")], ["Wants"]), ...wantsView(model, h)]
				),
				h.section(
					[
						h.Id(PANEL_ID.grabs),
						h.Role("tabpanel"),
						h.AriaLabelledBy(DESK_TAB_ID.grabs),
						h.AriaBusy(isOpening),
						h.Hidden(tab !== "grabs"),
					],
					grabsPanelView(model, h)
				),
			]
		),
	};
};
