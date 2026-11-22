import type { Contents } from "@prosody/domain/Reading/Copy";
import { Clock, Effect, Option, Schema, Stream } from "effect";
import { Dom, Mount } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { effectiveTheme } from "./Appearance.ts";
import type { PageFit, PageTone } from "./Appearance.ts";
import { copyUrl } from "./Copy.ts";
import { backIcon, chevRightIcon } from "./Icons.ts";
import { Message } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { isOpen, openerId, panelId } from "./RoomPanels.ts";
import { changed, fillOf, segmentView, themeRowView } from "./RoomParts.ts";

export const PRINTED = "printed";

const SWIPE = 50;

const TAP = 10;

const EDGE = 0.25;

export type Turn = "prev" | "next" | "toggle" | "none";

interface Point {
	readonly x: number;
	readonly y: number;
}

interface Sheet {
	readonly left: number;
	readonly width: number;
}

export const turnOf = (down: Point, up: Point, page: Sheet): Turn => {
	const across = up.x - down.x;
	const along = up.y - down.y;

	if (Math.abs(across) >= SWIPE && Math.abs(across) > Math.abs(along)) {
		return across < 0 ? "next" : "prev";
	}

	if (Math.abs(across) >= TAP || Math.abs(along) >= TAP) {
		return "none";
	}

	const within = page.width > 0 ? (up.x - page.left) / page.width : 0.5;

	if (within < EDGE) {
		return "prev";
	}

	return within > 1 - EDGE ? "next" : "toggle";
};

const isZoomed = (): boolean => (window.visualViewport?.scale ?? 1) > 1;

const pointOf = (touch: Touch | undefined): Point => ({
	x: touch?.clientX ?? 0,
	y: touch?.clientY ?? 0,
});

type Leafed =
	| typeof Message.TurnedPage.Type
	| typeof Message.ToggledChrome.Type;

export const Leaf = Mount.defineStream("Leaf", {
	args: { index: Schema.Int },
	messages: [Message.ShowedPage, Message.TurnedPage, Message.ToggledChrome],
	execute: ({ element, index }) => {
		const turn = (from: Point, to: Point): Stream.Stream<Leafed> => {
			const turned = turnOf(from, to, element.getBoundingClientRect());

			if (turned === "none") {
				return Stream.empty;
			}

			if (turned === "toggle") {
				return Stream.succeed(Message.ToggledChrome());
			}

			return Stream.succeed(
				Message.TurnedPage({ index: turned === "next" ? index + 1 : index - 1 })
			);
		};

		const shown = Stream.fromEffect(
			Effect.map(Clock.currentTimeMillis, (at) =>
				Message.ShowedPage({ index, at })
			).pipe(Effect.delay("1 second"))
		);

		const clicks = Stream.fromEventListener<PointerEvent>(
			element,
			"pointerdown"
		).pipe(
			Stream.filter(
				(down) => down.pointerType === "mouse" && down.button === 0
			),
			Stream.switchMap((down) =>
				Stream.fromEventListener<PointerEvent>(element, "pointerup").pipe(
					Stream.take(1),
					Stream.flatMap((up) =>
						up.pointerType === "mouse"
							? turn(
									{ x: down.clientX, y: down.clientY },
									{ x: up.clientX, y: up.clientY }
								)
							: Stream.empty
					)
				)
			)
		);

		const touches = Stream.fromEventListener<TouchEvent>(
			element,
			"touchstart"
		).pipe(
			Stream.switchMap((start) =>
				start.touches.length > 1 || isZoomed()
					? Stream.empty
					: Stream.fromEventListener<TouchEvent>(element, "touchend").pipe(
							Stream.take(1),
							Stream.flatMap((end) =>
								turn(
									pointOf(start.changedTouches[0]),
									pointOf(end.changedTouches[0])
								)
							)
						)
			)
		);

		return Stream.merge(shown, Stream.merge(clicks, touches));
	},
});

export const GoTo = Mount.defineStream("GoTo", {
	messages: [Message.JumpedToPage],
	execute: ({ element }) =>
		Dom.streamFromEventFilterMapPreventDefault({
			target: element,
			type: "submit",
			filterMapEvent: () => {
				const field = element.querySelector("input");

				const page =
					field instanceof HTMLInputElement
						? Math.round(Number(field.value))
						: 0;

				return Option.some(
					Message.JumpedToPage({ page: Number.isFinite(page) ? page : 0 })
				);
			},
		}),
});

export const headingAt = (contents: Contents, shown: number): number =>
	contents.headings.findLastIndex(({ page }) => page <= shown + 1);

export const pageLabel = (shown: number, count: number): string =>
	`Page ${shown + 1} of ${count}`;

const FIGURE_FIT: Readonly<Record<PageFit, string>> = {
	page: "",
	width: " is-fit-width",
};

const FIGURE_TONE: Readonly<Record<PageTone, string>> = {
	original: "",
	dimmed: " is-dimmed",
	inverted: " is-inverted",
};

const isInk = (model: Model): boolean =>
	effectiveTheme(model.appearance.theme, model.systemDark) === "dark";

export const pagesView = (
	model: Model,
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const { shown } = room;
	const count = contents.pictures.length;

	const picture = (index: number) =>
		copyUrl(room.work, `pictures/${contents.pictures[index] ?? ""}`);

	const tone = isInk(model) ? FIGURE_TONE[model.appearance.pageTone] : "";

	const ahead =
		shown + 1 < count
			? [
					h.img([
						h.Class("pages-ahead"),
						h.Src(picture(shown + 1)),
						h.Alt(""),
						h.AriaHidden(true),
					]),
				]
			: [];

	return [
		h.keyed("figure")(
			String(shown),
			[
				h.Id(PRINTED),
				h.Class(`pages-figure${FIGURE_FIT[model.appearance.pageFit]}${tone}`),
				h.Title(
					"Tap the left or right edge to turn the page; tap the middle to show or hide the controls"
				),
				h.OnMount(Leaf({ index: shown })),
			],
			[h.img([h.Src(picture(shown)), h.Alt(pageLabel(shown, count))])]
		),
		...ahead,
	];
};

export const pagesBarView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const count = contents.pictures.length;

	const page = Math.round(
		Option.getOrElse(room.scrubbingTime, () => room.shown + 1)
	);

	const label = `Page ${page} of ${count}`;
	const read = Math.round((page / Math.max(1, count)) * 100);

	return h.nav(
		[
			h.Class(room.chromeHidden ? "pages-bar is-hidden" : "pages-bar"),
			h.AriaLabel("Page navigation"),
			h.OnFocusEnter(Message.SetChromeHidden({ hidden: false })),
		],
		[
			h.div(
				[h.Class("pages-bar-inner")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("icon-btn"),
							h.AriaLabel("Previous page"),
							h.Disabled(room.shown <= 0),
							h.OnClick(Message.TurnedPage({ index: room.shown - 1 })),
						],
						[backIcon(h)]
					),
					h.div(
						[h.Class("pages-bar-mid")],
						[
							h.div(
								[h.Class("scrubber-wrap")],
								[
									h.label(
										[h.Class("sr-only"), h.For("page-range")],
										["Page number"]
									),
									h.input([
										h.Id("page-range"),
										h.Class("scrubber"),
										h.Type("range"),
										h.Min("1"),
										h.Max(String(Math.max(1, count))),
										h.Step("1"),
										h.Value(String(page)),
										h.AriaValuetext(label),
										h.Style({ "--val": fillOf(page - 1, count - 1) }),
										h.OnInput((value) =>
											Message.ScrubbedAudio({ time: Number(value) })
										),
										h.OnChange((value) =>
											Message.TurnedPage({
												index: Math.round(Number(value)) - 1,
											})
										),
									]),
								]
							),
							h.button(
								[
									h.Type("button"),
									h.Id(openerId("jump")),
									h.Class("page-jump-btn tabular"),
									h.AriaLabel(`${label}. Go to a page`),
									h.AriaExpanded(isOpen(room, "jump")),
									h.OnClick(
										Message.OpenedPanel({
											panel: "jump",
											fromPlayerSheet: false,
										})
									),
								],
								[`${label} · ${read}%`]
							),
						]
					),
					h.button(
						[
							h.Type("button"),
							h.Class("icon-btn"),
							h.AriaLabel("Next page"),
							h.Disabled(room.shown + 1 >= count),
							h.OnClick(Message.TurnedPage({ index: room.shown + 1 })),
						],
						[chevRightIcon(h)]
					),
				]
			),
		]
	);
};

export const pageDisplayView = (
	model: Model,
	h: HtmlBuilder<Message>
): Html => {
	const { appearance } = model;

	const tones = isInk(model)
		? [
				h.div(
					[h.Class("setting-row")],
					[
						h.span([h.Class("setting-name")], ["Bright pages"]),
						h.div(
							[
								h.Class("segmented"),
								h.Role("group"),
								h.AriaLabel("Page brightness in dark mode"),
							],
							[
								segmentView(
									"Original",
									appearance.pageTone === "original",
									changed({ ...appearance, pageTone: "original" }),
									h
								),
								segmentView(
									"Dimmed",
									appearance.pageTone === "dimmed",
									changed({ ...appearance, pageTone: "dimmed" }),
									h
								),
								segmentView(
									"Inverted",
									appearance.pageTone === "inverted",
									changed({ ...appearance, pageTone: "inverted" }),
									h
								),
							]
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
			h.AriaLabel("Page display options"),
		],
		[
			h.h2([h.Class("popover-title popover-title-spaced")], ["Page display"]),
			themeRowView(appearance, h),
			h.div(
				[h.Class("setting-row")],
				[
					h.span([h.Class("setting-name")], ["Fit"]),
					h.div(
						[h.Class("segmented"), h.Role("group"), h.AriaLabel("Page fit")],
						[
							segmentView(
								"Fit page",
								appearance.pageFit === "page",
								changed({ ...appearance, pageFit: "page" }),
								h
							),
							segmentView(
								"Fit width",
								appearance.pageFit === "width",
								changed({ ...appearance, pageFit: "width" }),
								h
							),
						]
					),
				]
			),
			...tones,
		]
	);
};

export const jumpView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): Html => {
	const count = contents.pictures.length;

	return h.keyed("div")(
		"jump",
		[
			h.Id(panelId("jump")),
			h.Class("popover from-bottom is-centered"),
			h.Role("dialog"),
			h.AriaLabel("Go to page"),
		],
		[
			h.h2([h.Class("popover-title")], ["Go to page"]),
			h.form(
				[h.Class("goto-form"), h.OnMount(GoTo())],
				[
					h.label(
						[h.Class("sr-only"), h.For("goto-input")],
						[`Page number (1 to ${count})`]
					),
					h.input([
						h.Id("goto-input"),
						h.Class("input"),
						h.Type("number"),
						h.Min("1"),
						h.Max(String(count)),
						h.InputMode("numeric"),
						h.Attribute("value", String(room.shown + 1)),
					]),
					h.button([h.Type("submit"), h.Class("btn btn-primary")], ["Go"]),
				]
			),
		]
	);
};
