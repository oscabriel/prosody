import type { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Match, Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { MAX_TEXT_SIZE, MIN_TEXT_SIZE, stepTextSize } from "./Appearance.ts";
import type { Leading, Measure } from "./Appearance.ts";
import { kindOf } from "./Copy.ts";
import type { Kind } from "./Copy.ts";
import {
	arrowDownIcon,
	backIcon,
	closeIcon,
	contentsIcon,
	moreIcon,
	returnBackIcon,
} from "./Icons.ts";
import {
	audioView,
	clockOf,
	dockView,
	listeningView,
	playerSheetView,
	sleepView,
	speedView,
} from "./Listening.ts";
import { Book, Message, Section } from "./Model.ts";
import type { Model, Room, RoomPanel } from "./Model.ts";
import { bookMenuView } from "./Moves.ts";
import {
	headingAt,
	jumpView,
	pageDisplayView,
	pageLabel,
	pagesBarView,
	pagesView,
} from "./Pages.ts";
import { isOpen, openerId, panelId } from "./RoomPanels.ts";
import {
	changed,
	segmentView,
	sheetHeadView,
	themeRowView,
} from "./RoomParts.ts";
import { copyFailureOf, isAlone } from "./Rooms.ts";
import { shelfRouter } from "./Route.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";
import { Read } from "./Text.ts";
import { heardOf, sectionDuration, sectionOf, spanOf } from "./Timeline.ts";
import {
	badgeView,
	coverView,
	offlineBannerView,
	themeButtonView,
} from "./Ui.ts";

const MAIN = "room-main";

const open = (panel: RoomPanel): Message =>
	Message.OpenedPanel({ panel, fromPlayerSheet: false });

const titleIn = (model: Model, room: Room): string =>
	Option.match(entryOf(model, room.work), {
		onNone: () => "",
		onSome: (entry) => entry.title,
	});

const tocButtonView = (room: Room, h: HtmlBuilder<Message>): Html =>
	h.button(
		[
			h.Type("button"),
			h.Id(openerId("toc")),
			h.Class("icon-btn"),
			h.AriaLabel("Contents"),
			h.AriaExpanded(isOpen(room, "toc")),
			h.AriaControls(panelId("toc")),
			h.OnClick(open("toc")),
		],
		[contentsIcon(h)]
	);

const displayButtonView = (
	room: Room,
	label: string,
	name: string,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Id(openerId("aa")),
			h.Class(
				label === "Aa" ? "icon-btn room-bar-aa" : "icon-btn room-bar-word"
			),
			h.AriaLabel(name),
			h.AriaExpanded(isOpen(room, "aa")),
			h.AriaControls(panelId("aa")),
			h.OnClick(open("aa")),
		],
		[label]
	);

const barView = (
	model: Model,
	room: Room,
	sub: string,
	left: ReadonlyArray<Html>,
	right: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("header")(
		"bar",
		[
			h.Class(room.chromeHidden ? "room-bar is-hidden" : "room-bar"),
			h.OnFocusEnter(Message.SetChromeHidden({ hidden: false })),
		],
		[
			h.div(
				[h.Class("room-bar-inner")],
				[
					h.div(
						[h.Class("room-bar-group")],
						[
							h.a(
								[
									h.Class("icon-btn"),
									h.Href(shelfRouter()),
									h.AriaLabel("Back to shelf"),
								],
								[
									backIcon(h),
									h.span([h.Class("room-bar-label hide-narrow")], ["Shelf"]),
								]
							),
							...left,
						]
					),
					h.div(
						[h.Class("room-bar-center")],
						[
							h.p(
								[h.Class("room-bar-title"), h.Dir("auto")],
								[titleIn(model, room)]
							),
							h.p([h.Class("room-bar-sub"), h.Dir("auto")], [sub]),
						]
					),
					h.div(
						[h.Class("room-bar-group")],
						[
							...right,
							h.button(
								[
									h.Type("button"),
									h.Id(openerId("menu")),
									h.Class("icon-btn"),
									h.AriaLabel("Book menu"),
									h.AriaExpanded(isOpen(room, "menu")),
									h.AriaControls(panelId("menu")),
									h.OnClick(open("menu")),
								],
								[moreIcon(h)]
							),
						]
					),
				]
			),
		]
	);

const peekView = (h: HtmlBuilder<Message>): Html =>
	h.keyed("div")(
		"peek",
		[
			h.Class("room-peek-zone"),
			h.AriaHidden(true),
			h.OnMouseEnter(Message.SetChromeHidden({ hidden: false })),
		],
		[]
	);

const bannersView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const offline = model.isOnline
		? []
		: [
				offlineBannerView(
					"Offline — your place is kept on this device and sent when you are back.",
					[],
					h
				),
			];

	const elsewhere = Option.match(room.elsewhere, {
		onNone: () => [],
		onSome: (place) => [
			h.div(
				[h.Class("banner elsewhere-banner"), h.Role("status")],
				[
					h.div(
						[h.Class("banner-lead")],
						[
							h.span(
								[],
								[
									"Further on ",
									h.strong(
										[],
										[place.device === "" ? "another device" : place.device]
									),
								]
							),
						]
					),
					h.div(
						[h.Class("elsewhere-actions")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-primary btn-sm"),
									h.OnClick(Message.ClickedElsewhere()),
								],
								["Jump there"]
							),
							h.button(
								[
									h.Type("button"),
									h.Class("icon-btn"),
									h.AriaLabel("Dismiss"),
									h.OnClick(Message.DismissedElsewhere()),
								],
								[closeIcon(h)]
							),
						]
					),
				]
			),
		],
	});

	return [...offline, ...elsewhere];
};

const techView = (reason: string, h: HtmlBuilder<Message>): Html =>
	h.details(
		[h.Class("tech-details")],
		[h.summary([], ["Technical details"]), h.pre([], [reason])]
	);

const shelfLinkView = (label: string, h: HtmlBuilder<Message>): Html =>
	h.a([h.Class("btn btn-secondary"), h.Href(shelfRouter())], [label]);

const skeletonView = (label: string, h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("reader-skeleton"), h.AriaBusy(true), h.AriaLabel(label)],
		[
			h.div([h.Class("skeleton is-heading")], []),
			h.div([h.Class("skeleton")], []),
			h.div([h.Class("skeleton")], []),
			h.div([h.Class("skeleton is-short")], []),
			h.div([h.Class("skeleton")], []),
			h.div([h.Class("skeleton")], []),
			h.div([h.Class("skeleton is-shorter")], []),
			h.span([h.Class("sr-only")], [label]),
		]
	);

const textView = (
	model: Model,
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const path = contents.sections[room.shown]?.path ?? "";
	const section = room.sections[path] ?? Section.Fetching();
	const isHeard = contents.audio !== null;

	const classes = [
		"text prose",
		room.isPlaying ? "is-playing" : "",
		room.isPlaying && isHeard && model.appearance.focusDim
			? "is-focus-dimming"
			: "",
	]
		.filter((name) => name !== "")
		.join(" ");

	return Section.match(section, {
		Fetching: () => skeletonView("Turning the page", h),
		Failed: ({ reason }) =>
			h.div(
				[h.Class("state-card")],
				[
					h.h2([h.Class("state-title")], ["This section could not be fetched"]),
					h.p(
						[h.Class("state-body")],
						[
							model.isOnline
								? "Something went wrong while turning the page. You can try again."
								: "You are offline, and this section is not on this device.",
						]
					),
					techView(reason, h),
					h.div(
						[h.Class("state-actions")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-primary"),
									h.OnClick(Message.ClickedChapter({ index: room.shown })),
								],
								["Try again"]
							),
							shelfLinkView("Back to shelf", h),
						]
					),
				]
			),
		Fetched: ({ html }) =>
			h.keyed("article")(
				path,
				[
					h.Class(classes),
					h.AriaLabel("Book text"),
					h.Dir("auto"),
					h.DataAttribute(
						"sentence",
						Option.match(
							Option.filter(room.sentence, (s) => sectionOf(s) === path),
							{ onNone: () => "", onSome: spanOf }
						)
					),
					h.DataAttribute("lookup", String(Option.isSome(room.returnChapter))),
					h.InnerHTML(html),
					h.OnMount(Read()),
				],
				[]
			),
	});
};

const turnsView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const previous = room.shown - 1;
	const next = room.shown + 1;

	const back =
		previous >= 0
			? [
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-ghost"),
							h.OnClick(Message.ClickedChapter({ index: previous })),
						],
						[`← ${titleOf(contents, previous)}`]
					),
				]
			: [];

	const on =
		next < contents.sections.length
			? [
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary is-next"),
							h.OnClick(Message.ClickedChapter({ index: next })),
						],
						[`${titleOf(contents, next)} →`]
					),
				]
			: [];

	return back.length + on.length === 0
		? []
		: [
				h.nav(
					[h.Class("chapter-turns"), h.AriaLabel("Chapter navigation")],
					[...back, ...on]
				),
			];
};

const pillView = (
	name: string,
	message: Message,
	icon: Html,
	label: string,
	hasPlayer: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("button")(
		name,
		[
			h.Type("button"),
			h.Class(hasPlayer ? "floating-pill" : "floating-pill no-player"),
			h.OnClick(message),
		],
		[icon, h.span([h.Dir("auto")], [label])]
	);

const pillsView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const hasPlayer = contents.audio !== null;

	if (room.isPlaying) {
		return room.isFollowing
			? []
			: [
					pillView(
						"pill-playing",
						Message.ClickedBackToPlaying(),
						arrowDownIcon(h),
						"Back to playing",
						hasPlayer,
						h
					),
				];
	}

	return Option.match(room.returnChapter, {
		onNone: () => [],
		onSome: (index) => [
			pillView(
				"pill-return",
				Message.ClickedReturnChapter(),
				returnBackIcon(h),
				`Back to ${titleOf(contents, index)}`,
				hasPlayer,
				h
			),
		],
	});
};

const tocRowView = (
	index: number,
	title: string,
	meta: string,
	marks: string,
	isCurrent: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const label = h.span([h.Class("toc-label"), h.Dir("auto")], [title]);

	return h.keyed("li")(
		String(index),
		[],
		[
			h.button(
				[
					h.Type("button"),
					h.Class(`toc-btn${marks}`),
					h.AriaCurrent(isCurrent ? "location" : "false"),
					h.OnClick(Message.ClickedChapter({ index })),
				],
				meta === ""
					? [label]
					: [label, h.span([h.Class("toc-meta tabular")], [meta])]
			),
		]
	);
};

const tocMetaOf = (
	contents: Contents,
	timeline: Timeline,
	index: number
): string => {
	const kind = kindOf(contents);

	if (kind === "audio") {
		const chapter = contents.chapters[index];

		return chapter === undefined ? "" : clockOf(chapter.end - chapter.start);
	}

	if (kind === "pages") {
		const heading = contents.headings[index];

		return heading === undefined ? "" : `p. ${heading.page}`;
	}

	const length = sectionDuration(
		heardOf(timeline),
		contents.sections[index]?.path ?? ""
	);

	return length >= 1 ? clockOf(length) : "";
};

const tocView = (
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): Html => {
	const kind = kindOf(contents);

	const current =
		kind === "pages"
			? headingAt(contents, room.shown)
			: chapterOf(room, contents);

	const shown = kind === "synced" || kind === "text" ? room.shown : current;

	const count =
		kind === "audio"
			? contents.chapters.length
			: Math.max(contents.headings.length, contents.sections.length);

	const marksOf = (index: number): string =>
		[
			index === current ? " is-current" : "",
			index < current ? " is-done" : "",
			index === shown && index !== current ? " is-shown" : "",
		].join("");

	return h.keyed("aside")(
		"toc",
		[
			h.Id(panelId("toc")),
			h.Class("drawer-left"),
			h.Role("dialog"),
			h.AriaLabel("Contents"),
		],
		[
			sheetHeadView("Contents", "Close contents", h),
			h.div(
				[h.Class("sheet-body toc-body")],
				[
					h.ol(
						[h.Class("toc-list")],
						Array.from({ length: count }, (_, index) =>
							tocRowView(
								index,
								titleOf(contents, index),
								tocMetaOf(contents, timeline, index),
								marksOf(index),
								index === current,
								h
							)
						)
					),
				]
			),
		]
	);
};

const LEADINGS: ReadonlyArray<readonly [Leading, string]> = [
	["1.45", "Snug"],
	["1.6", "Book"],
	["1.8", "Airy"],
];

const MEASURES: ReadonlyArray<readonly [Measure, string]> = [
	["52ch", "Narrow"],
	["64ch", "Classic"],
	["74ch", "Wide"],
];

const appearanceView = (
	model: Model,
	hasFocus: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const { appearance } = model;

	const focus = hasFocus
		? [
				h.div(
					[h.Class("setting-row")],
					[
						h.span([h.Class("setting-name")], ["Focus while listening"]),
						h.button(
							[
								h.Type("button"),
								h.Class("chip"),
								h.AriaLabel("Focus while listening"),
								h.AriaPressed(String(appearance.focusDim)),
								h.OnClick(
									changed({ ...appearance, focusDim: !appearance.focusDim })
								),
							],
							[appearance.focusDim ? "On" : "Off"]
						),
					]
				),
			]
		: [];

	return h.keyed("div")(
		"aa",
		[
			h.Id(panelId("aa")),
			h.Class("popover"),
			h.Role("dialog"),
			h.AriaLabel("Reading appearance"),
		],
		[
			h.div(
				[h.Class("popover-head is-spaced")],
				[
					h.h2([h.Class("popover-title")], ["Appearance"]),
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-ghost btn-sm"),
							h.OnClick(Message.ResetAppearance()),
						],
						["Reset"]
					),
				]
			),
			themeRowView(appearance, h),
			h.div(
				[h.Class("setting-row")],
				[
					h.span([h.Class("setting-name")], ["Text size"]),
					h.div(
						[h.Class("size-steps")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-secondary btn-sm"),
									h.AriaLabel("Decrease text size"),
									h.Disabled(appearance.size <= MIN_TEXT_SIZE),
									h.OnClick(
										changed({
											...appearance,
											size: stepTextSize(appearance.size, -1),
										})
									),
								],
								["A−"]
							),
							h.span([h.Class("size-value tabular")], [`${appearance.size}%`]),
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-secondary btn-sm"),
									h.AriaLabel("Increase text size"),
									h.Disabled(appearance.size >= MAX_TEXT_SIZE),
									h.OnClick(
										changed({
											...appearance,
											size: stepTextSize(appearance.size, 1),
										})
									),
								],
								["A+"]
							),
						]
					),
				]
			),
			h.div(
				[h.Class("setting-row")],
				[
					h.span([h.Class("setting-name")], ["Spacing"]),
					h.div(
						[
							h.Class("segmented"),
							h.Role("group"),
							h.AriaLabel("Line spacing"),
						],
						LEADINGS.map(([leading, label]) =>
							segmentView(
								label,
								appearance.leading === leading,
								changed({ ...appearance, leading }),
								h
							)
						)
					),
				]
			),
			h.div(
				[h.Class("setting-row hide-narrow")],
				[
					h.span([h.Class("setting-name")], ["Width"]),
					h.div(
						[
							h.Class("segmented"),
							h.Role("group"),
							h.AriaLabel("Column width"),
						],
						MEASURES.map(([measure, label]) =>
							segmentView(
								label,
								appearance.measure === measure,
								changed({ ...appearance, measure }),
								h
							)
						)
					),
				]
			),
			...focus,
		]
	);
};

const panelView = (
	model: Model,
	room: Room,
	contents: Contents,
	timeline: Timeline,
	panel: RoomPanel,
	h: HtmlBuilder<Message>
): Html => {
	const kind = kindOf(contents);

	return Match.value(panel).pipe(
		Match.when("toc", () => tocView(room, contents, timeline, h)),
		Match.when("player", () =>
			playerSheetView(model, room, contents, timeline, h)
		),
		Match.when("aa", () =>
			kind === "pages"
				? pageDisplayView(model, h)
				: appearanceView(model, kind === "synced", h)
		),
		Match.when("menu", () => bookMenuView(model, room, h)),
		Match.when("speed", () =>
			speedView(room, kind === "audio" || room.returnToPlayerSheet, h)
		),
		Match.when("sleep", () =>
			sleepView(room, kind === "audio" || room.returnToPlayerSheet, h)
		),
		Match.when("jump", () => jumpView(room, contents, h)),
		Match.exhaustive
	);
};

const SHEETS = new Set<RoomPanel>(["toc", "player"]);

const backdropView = (panel: RoomPanel, h: HtmlBuilder<Message>): Html =>
	h.keyed("div")(
		"backdrop",
		[
			h.Class(SHEETS.has(panel) ? "sheet-backdrop" : "sheet-backdrop is-clear"),
			h.OnClick(Message.ClosedPanels()),
		],
		[]
	);

const mainView = (
	name: string,
	title: string,
	children: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("main")(
		"main",
		[h.Class(name), h.Id(MAIN)],
		[h.h1([h.Class("sr-only")], [title]), ...children]
	);

const subOf = (room: Room, contents: Contents, kind: Kind): string => {
	if (kind === "audio") {
		return "Audio alone";
	}

	if (kind === "pages") {
		const heading = contents.headings[headingAt(contents, room.shown)];

		return heading === undefined
			? pageLabel(room.shown, contents.pictures.length)
			: heading.title;
	}

	return titleOf(contents, room.shown);
};

const openView = (
	model: Model,
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const kind = kindOf(contents);
	const title = titleIn(model, room);
	const banners = bannersView(model, room, h);

	const overlays = Option.match(room.openPanel, {
		onNone: () => [],
		onSome: (panel) => [
			backdropView(panel, h),
			panelView(model, room, contents, timeline, panel, h),
		],
	});

	const audio = audioView(room, contents, h);

	if (kind === "audio") {
		return [
			...audio,
			barView(
				model,
				room,
				subOf(room, contents, kind),
				[],
				[themeButtonView(model, h)],
				h
			),
			mainView(
				"audio-stage",
				title,
				[...banners, ...listeningView(model, room, contents, timeline, h)],
				h
			),
			...overlays,
		];
	}

	if (kind === "pages") {
		return [
			peekView(h),
			barView(
				model,
				room,
				subOf(room, contents, kind),
				contents.headings.length > 0 ? [tocButtonView(room, h)] : [],
				[displayButtonView(room, "Page", "Page display options", h)],
				h
			),
			mainView(
				"pages-stage",
				title,
				[...banners, ...pagesView(model, room, contents, h)],
				h
			),
			h.keyed("div")("pages-bar", [], [pagesBarView(room, contents, h)]),
			...overlays,
		];
	}

	const reading = mainView(
		kind === "synced" ? "reader-canvas" : "reader-canvas no-player",
		title,
		[
			...banners,
			textView(model, room, contents, h),
			...turnsView(room, contents, h),
		],
		h
	);

	const below =
		kind === "synced"
			? [dockView(room, contents, timeline, h)]
			: [
					h.keyed("div")(
						"footer",
						[h.Class("text-footer-bar")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("text-footer-btn tabular"),
									h.AriaLabel(
										`Section ${room.shown + 1} of ${contents.sections.length}. Show or hide reading controls`
									),
									h.OnClick(Message.ToggledChrome()),
								],
								[`Section ${room.shown + 1} of ${contents.sections.length}`]
							),
						]
					),
				];

	return [
		...audio,
		peekView(h),
		barView(
			model,
			room,
			subOf(room, contents, kind),
			[tocButtonView(room, h)],
			[displayButtonView(room, "Aa", "Reading appearance", h)],
			h
		),
		reading,
		...pillsView(room, contents, h),
		...below,
		...overlays,
	];
};

const editionsOf = (model: Model, room: Room): string =>
	Option.match(
		Option.flatMap(model.shelf, ({ works }) =>
			Option.fromUndefinedOr(works[room.work])
		),
		{
			onNone: () => "",
			onSome: (entry) => {
				if (entry.text && entry.audio) {
					return "Text and audio";
				}

				if (entry.text) {
					return "Text";
				}

				return entry.pages ? "Pages" : "Audio";
			},
		}
	);

const stateHeadView = (
	model: Model,
	room: Room,
	badge: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));
	const title = entry?.title ?? "This book";

	const meta = [entry?.author ?? "", editionsOf(model, room)]
		.filter((part) => part !== "")
		.join(" · ");

	return h.div(
		[h.Class("state-head")],
		[
			coverView(room.work, title, false, [], h, "state-cover"),
			h.div(
				[h.Class("state-head-meta")],
				[
					...badge,
					h.h1([h.Class("state-title"), h.Dir("auto")], [title]),
					h.p([h.Class("state-meta"), h.Dir("auto")], [meta]),
				]
			),
		]
	);
};

const unmadeWords = (alone: boolean, hasFailed: boolean) =>
	alone
		? {
				badge: "Not copied",
				idle: hasFailed
					? "The press could not make this book’s reading copy. You can ask it to try again now."
					: "The press has not made this book’s reading copy yet. You can ask it to make it now.",
				button: "Make it now",
				asked: "Asked the press to make it.",
				aligning:
					"The press is making its reading copy. The book opens here when it is done.",
				busy: "Making it…",
			}
		: {
				badge: "Not synced",
				idle: hasFailed
					? "The press could not sync this book. You can ask it to align it again."
					: "This reading copy was made before the reading room, so it has no pages to show yet. Aligning it again makes them, and takes a minute or two for a book the press has heard before.",
				button: "Align it again",
				asked: "Asked the press to align it again.",
				aligning:
					"The press is aligning it. The book opens here when it is done.",
				busy: "Aligning it…",
			};

const unmadeView = (
	model: Model,
	room: Room,
	phase: "idle" | "asked" | "aligning",
	h: HtmlBuilder<Message>
): Html => {
	const failure = copyFailureOf(model, room.work);
	const words = unmadeWords(isAlone(model, room.work), Option.isSome(failure));
	const isIdle = phase === "idle";

	const badge = isIdle
		? [
				badgeView(
					words.badge,
					Option.isSome(failure) ? "danger" : "neutral",
					false,
					h
				),
			]
		: [badgeView(words.busy, "warn", true, h)];

	return h.div(
		[h.Class("state-card")],
		[
			stateHeadView(model, room, badge, h),
			h.p(
				[h.Class("state-body"), h.Role("status")],
				[isIdle ? words.idle : words[phase]]
			),
			...Option.match(
				Option.filter(failure, () => isIdle),
				{
					onNone: () => [],
					onSome: (reason) => [techView(reason, h)],
				}
			),
			h.div(
				[h.Class("state-actions")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-primary"),
							h.Disabled(!isIdle || !model.isOnline),
							h.AriaBusy(!isIdle),
							h.OnClick(Message.ClickedRealign()),
						],
						[isIdle ? words.button : words.busy]
					),
					shelfLinkView("Back to shelf", h),
				]
			),
		]
	);
};

const failedView = (
	model: Model,
	room: Room,
	reason: string,
	h: HtmlBuilder<Message>
): Html => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));
	const title = entry?.title ?? "This book";

	if (!model.isOnline) {
		return h.div(
			[h.Class("state-card")],
			[
				badgeView("Offline", "warn", true, h),
				h.h1([h.Class("state-title is-alone")], ["Not kept on this device"]),
				h.p(
					[h.Class("state-body")],
					[
						h.strong([h.Dir("auto")], [title]),
						" is not kept on this device. It will open here as soon as you are back online.",
					]
				),
				h.div(
					[h.Class("state-actions")],
					[
						h.a(
							[h.Class("btn btn-primary"), h.Href(shelfRouter())],
							["View kept books on the shelf"]
						),
					]
				),
			]
		);
	}

	return h.div(
		[h.Class("state-card")],
		[
			stateHeadView(
				model,
				room,
				[badgeView("Could not open", "danger", false, h)],
				h
			),
			h.p(
				[h.Class("state-body")],
				["This book could not be opened. You can try again."]
			),
			techView(reason, h),
			h.div(
				[h.Class("state-actions")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-primary"),
							h.OnClick(Message.ClickedOpenAgain()),
						],
						["Try again"]
					),
					shelfLinkView("Back to shelf", h),
				]
			),
		]
	);
};

const closedView = (
	model: Model,
	room: Room,
	state: Html,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const closed = [
		barView(model, room, "", [], [], h),
		h.keyed("main")("main", [h.Class("room-state"), h.Id(MAIN)], [state]),
	];

	return isOpen(room, "menu")
		? [...closed, backdropView("menu", h), bookMenuView(model, room, h)]
		: closed;
};

export const roomView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): Document => {
	const title = Option.match(entryOf(model, room.work), {
		onNone: () => "Prosody",
		onSome: (entry) => entry.title,
	});

	const body = Book.match(room.book, {
		Opening: () =>
			closedView(
				model,
				room,
				h.div(
					[h.Class("room-opening")],
					[
						h.h1([h.Class("sr-only")], [title]),
						skeletonView("Opening the book", h),
					]
				),
				h
			),
		Failed: ({ reason }) =>
			closedView(model, room, failedView(model, room, reason, h), h),
		Unmade: ({ phase }) =>
			closedView(model, room, unmadeView(model, room, phase, h), h),
		Open: ({ contents, timeline }) =>
			openView(model, room, contents, timeline, h),
	});

	return {
		title,
		body: h.keyed("div")(`room-${room.work}`, [h.Class("room-shell")], body),
	};
};
