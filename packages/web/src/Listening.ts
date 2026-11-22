import type { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import { Option } from "effect";
import type { Attribute, Html, HtmlBuilder } from "foldkit/html";

import { copyUrl, kindOf } from "./Copy.ts";
import {
	chevUpIcon,
	contentsIcon,
	downloadIcon,
	keptIcon,
	moonIcon,
	nextChapIcon,
	pauseIcon,
	playIcon,
	prevChapIcon,
	skipAheadIcon,
	skipBackIcon,
} from "./Icons.ts";
import { Message } from "./Model.ts";
import type { Model, Room, RoomPanel } from "./Model.ts";
import { keepingOf } from "./Moves.ts";
import { percentOf, sizeIn } from "./OnDevice.ts";
import { Listen, PLAYER, Scrub, SKIP_AHEAD, SKIP_BACK } from "./Player.ts";
import { isOpen, openerId, panelId, sheetOpenerId } from "./RoomPanels.ts";
import { closeButtonView, fillOf, Flick } from "./RoomParts.ts";
import { bookEnd } from "./Rooms.ts";
import { SLEEP_CHOICES, sleepLabel, sleepTag } from "./RoomSleep.ts";
import { FASTEST, rateLabel, SLOWEST } from "./RoomUpdate.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";
import { heardOf, lengthOf, sectionBounds, timeIn } from "./Timeline.ts";
import type { Stretch } from "./Timeline.ts";
import { coverView } from "./Ui.ts";

const PRESETS: ReadonlyArray<number> = [0.8, 1, 1.25, 1.5, 1.75, 2];

export const clockOf = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const rest = String(whole % 60).padStart(2, "0");

	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
		: `${minutes}:${rest}`;
};

export const leftOf = (seconds: number): string => {
	const minutes = Math.max(1, Math.round(seconds / 60));

	if (minutes < 60) {
		return `${minutes}m left`;
	}

	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;

	return rest === 0 ? `${hours}h left` : `${hours}h ${rest}m left`;
};

export interface Hearing {
	readonly chapter: number;
	readonly title: string;
	readonly stretch: Stretch | undefined;
	readonly within: number;
	readonly length: number;
	readonly leftInChapter: number;
	readonly leftInBook: number;
}

const stretchOf = (
	room: Room,
	contents: Contents,
	timeline: Timeline
): Stretch | undefined => {
	const chapter = chapterOf(room, contents);

	return kindOf(contents) === "audio"
		? contents.chapters[chapter]
		: sectionBounds(heardOf(timeline), contents.sections[chapter]?.path ?? "");
};

export const hearingOf = (
	room: Room,
	contents: Contents,
	timeline: Timeline
): Hearing => {
	const chapter = chapterOf(room, contents);
	const stretch = stretchOf(room, contents, timeline);
	const time = Option.getOrElse(room.scrubbingTime, () => room.time);
	const rate = room.rate > 0 ? room.rate : 1;
	const length = stretch === undefined ? 0 : lengthOf(stretch);
	const within = stretch === undefined ? 0 : timeIn(stretch, time);

	return {
		chapter,
		title: titleOf(contents, chapter),
		stretch,
		within,
		length,
		leftInChapter: Math.max(0, length - within) / rate,
		leftInBook: Math.max(0, bookEnd(contents, timeline) - time) / rate,
	};
};

export const audioView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	contents.audio === null
		? []
		: [
				h.keyed("audio")(
					PLAYER,
					[
						h.Id(PLAYER),
						h.Src(
							copyUrl(
								room.work,
								`audio/${encodeURIComponent(contents.audio)}${room.isKeptHere ? "?kept" : ""}`
							)
						),
						h.Preload("metadata"),
						h.OnMount(Listen()),
					],
					[]
				),
			];

const scrubberView = (
	id: string,
	label: string,
	hearing: Hearing,
	h: HtmlBuilder<Message>
): Html => {
	const max = Math.max(1, Math.round(hearing.length));
	const value = Math.min(max, Math.round(hearing.within));

	return h.div(
		[h.Class("scrubber-wrap")],
		[
			h.label([h.Class("sr-only"), h.For(id)], [label]),
			h.input([
				h.Id(id),
				h.Class("scrubber"),
				h.Type("range"),
				h.Min("0"),
				h.Max(String(max)),
				h.Step("1"),
				h.Value(String(value)),
				h.Disabled(hearing.length <= 0),
				h.AriaValuetext(
					`${clockOf(hearing.within)} of ${clockOf(hearing.length)}`
				),
				h.DataAttribute("start", String(hearing.stretch?.start ?? 0)),
				h.Style({ "--val": fillOf(value, max) }),
				h.OnMount(Scrub()),
			]),
		]
	);
};

const playButtonView = (
	room: Room,
	large: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class(large ? "play-btn play-btn-lg" : "play-btn"),
			h.AriaLabel(room.isPlaying ? "Pause" : "Play"),
			h.OnClick(
				room.isPlaying ? Message.ClickedPause() : Message.ClickedPlay()
			),
		],
		[
			room.isPlaying
				? pauseIcon(h, large ? 24 : 20)
				: playIcon(h, large ? 24 : 20),
		]
	);

const skipButtonsView = (h: HtmlBuilder<Message>): readonly [Html, Html] => [
	h.button(
		[
			h.Type("button"),
			h.Class("icon-btn"),
			h.AriaLabel(`Skip back ${SKIP_BACK} seconds`),
			h.OnClick(Message.ClickedSkip({ seconds: -SKIP_BACK })),
		],
		[skipBackIcon(h)]
	),
	h.button(
		[
			h.Type("button"),
			h.Class("icon-btn"),
			h.AriaLabel(`Skip forward ${SKIP_AHEAD} seconds`),
			h.OnClick(Message.ClickedSkip({ seconds: SKIP_AHEAD })),
		],
		[skipAheadIcon(h)]
	),
];

const chapterButtonView = (
	to: number | undefined,
	label: string,
	icon: Html,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("icon-btn"),
			h.AriaLabel(label),
			h.Disabled(to === undefined),
			h.OnClick(
				to === undefined
					? Message.CompletedRoomDom()
					: Message.ClickedChapter({ index: to })
			),
		],
		[icon]
	);

export const heardBeside = (
	contents: Contents,
	timeline: Timeline,
	from: number,
	by: number
): number | undefined => {
	if (kindOf(contents) === "audio") {
		const to = from + by;

		return to >= 0 && to < contents.chapters.length ? to : undefined;
	}

	const heard = heardOf(timeline);

	for (let to = from + by; to >= 0 && to < contents.sections.length; to += by) {
		if (sectionBounds(heard, contents.sections[to]?.path ?? "") !== undefined) {
			return to;
		}
	}

	return undefined;
};

const transportView = (
	room: Room,
	contents: Contents,
	timeline: Timeline,
	chapter: number,
	h: HtmlBuilder<Message>
): Html => {
	const [back, ahead] = skipButtonsView(h);

	return h.div(
		[h.Class("audio-transport")],
		[
			chapterButtonView(
				heardBeside(contents, timeline, chapter, -1),
				"Previous chapter",
				prevChapIcon(h),
				h
			),
			back,
			playButtonView(room, true, h),
			ahead,
			chapterButtonView(
				heardBeside(contents, timeline, chapter, 1),
				"Next chapter",
				nextChapIcon(h),
				h
			),
		]
	);
};

const utilityView = (
	id: string,
	message: Message,
	lead: Html,
	label: string,
	more: ReadonlyArray<Attribute<Message>>,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[h.Type("button"), h.Id(id), h.OnClick(message), ...more],
		[lead, h.span([], [label])]
	);

const keepUtilityView = (
	model: Model,
	room: Room,
	id: string,
	fromSheet: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const keeping = keepingOf(model, room);

	const toMenu = Message.OpenedPanel({
		panel: "menu",
		fromPlayerSheet: fromSheet,
	});

	if (keeping.kept !== undefined) {
		return utilityView(
			id,
			toMenu,
			h.span([h.Class("util-ok")], [keptIcon(h, 18)]),
			sizeIn(keeping.kept.bytes),
			[h.Class("util-btn is-active"), h.AriaLabel("Kept on this device")],
			h
		);
	}

	if (Option.isSome(keeping.copying)) {
		const { done, of } = keeping.copying.value;

		return utilityView(
			id,
			toMenu,
			downloadIcon(h),
			of > 0 ? `${percentOf(done, of)}%` : "Keeping…",
			[h.Class("util-btn is-active"), h.AriaLabel("Keeping on this device")],
			h
		);
	}

	return utilityView(
		id,
		keeping.isBusy ? toMenu : Message.ClickedKeepCopy(),
		downloadIcon(h),
		"Keep",
		[
			h.Class("util-btn"),
			h.AriaLabel("Keep on this device"),
			h.Disabled(!keeping.canKeep && !keeping.isBusy),
		],
		h
	);
};

const utilitiesView = (
	model: Model,
	room: Room,
	fromSheet: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const idOf = fromSheet ? sheetOpenerId : openerId;

	const open = (panel: RoomPanel): Message =>
		Message.OpenedPanel({ panel, fromPlayerSheet: fromSheet });

	return h.div(
		[h.Class("audio-utilities")],
		[
			utilityView(
				idOf("speed"),
				open("speed"),
				h.span([h.Class("util-value tabular")], [rateLabel(room.rate)]),
				"Speed",
				[
					h.Class("util-btn"),
					h.AriaLabel(`Playback speed ${rateLabel(room.rate)}`),
					h.AriaExpanded(isOpen(room, "speed")),
				],
				h
			),
			utilityView(
				idOf("sleep"),
				open("sleep"),
				moonIcon(h),
				sleepLabel(room),
				[
					h.Class(
						sleepLabel(room) === "Sleep" ? "util-btn" : "util-btn is-active"
					),
					h.AriaExpanded(isOpen(room, "sleep")),
				],
				h
			),
			utilityView(
				idOf("toc"),
				open("toc"),
				contentsIcon(h, 18),
				"Contents",
				[h.Class("util-btn"), h.AriaExpanded(isOpen(room, "toc"))],
				h
			),
			keepUtilityView(
				model,
				room,
				fromSheet ? sheetOpenerId("menu") : "room-keep",
				fromSheet,
				h
			),
		]
	);
};

const readoutView = (hearing: Hearing, h: HtmlBuilder<Message>): Html =>
	h.div(
		[h.Class("audio-times tabular")],
		[
			h.span([], [clockOf(hearing.within)]),
			h.span([], [`${leftOf(hearing.leftInBook)} in book`]),
			h.span([], [`-${clockOf(hearing.leftInChapter)}`]),
		]
	);

const bookLine = (model: Model, room: Room): string => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));

	return [entry?.title ?? "", entry?.author ?? ""]
		.filter((part) => part !== "")
		.join(" · ");
};

export const listeningView = (
	model: Model,
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const hearing = hearingOf(room, contents, timeline);
	const title = Option.getOrUndefined(entryOf(model, room.work))?.title ?? "";

	return [
		coverView(
			room.work,
			title,
			contents.cover !== null,
			[],
			h,
			"audio-cover is-square"
		),
		h.div(
			[h.Class("audio-stage-body")],
			[
				h.div(
					[h.Class("audio-titles")],
					[
						h.p(
							[h.Class("audio-kicker tabular")],
							[`Chapter ${hearing.chapter + 1} of ${contents.chapters.length}`]
						),
						h.h2([h.Class("audio-chapter"), h.Dir("auto")], [hearing.title]),
						h.p(
							[h.Class("audio-book"), h.Dir("auto")],
							[bookLine(model, room)]
						),
					]
				),
				h.div(
					[h.Class("audio-scrubber-block")],
					[
						scrubberView("audio-range", "Chapter timeline", hearing, h),
						readoutView(hearing, h),
					]
				),
				transportView(room, contents, timeline, hearing.chapter, h),
				utilitiesView(model, room, false, h),
			]
		),
	];
};

export const dockView = (
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): Html => {
	const hearing = hearingOf(room, contents, timeline);
	const [back, ahead] = skipButtonsView(h);

	const toSheet = Message.OpenedPanel({
		panel: "player",
		fromPlayerSheet: false,
	});

	const times =
		hearing.length > 0
			? `${clockOf(hearing.within)} · ${leftOf(hearing.leftInChapter)}`
			: "No aligned audio";

	return h.keyed("div")(
		"dock",
		[h.Class("player-dock"), h.Role("region"), h.AriaLabel("Player")],
		[
			h.div(
				[h.Class("player-dock-card")],
				[
					h.div(
						[h.Class("dock-scrubber")],
						[scrubberView("dock-range", "Chapter progress", hearing, h)]
					),
					h.div(
						[h.Class("dock-row")],
						[
							h.div(
								[h.Class("dock-transport")],
								[back, playButtonView(room, false, h), ahead]
							),
							h.button(
								[
									h.Type("button"),
									h.Id(openerId("player")),
									h.Class("dock-info"),
									h.AriaLabel(`Open full player. ${hearing.title}, ${times}`),
									h.AriaExpanded(isOpen(room, "player")),
									h.OnClick(toSheet),
								],
								[
									h.span(
										[h.Class("dock-chapter"), h.Dir("auto")],
										[hearing.title]
									),
									h.span(
										[h.Class("dock-time tabular")],
										[`${times}${sleepTag(room)}`]
									),
								]
							),
							h.div(
								[h.Class("dock-actions")],
								[
									h.button(
										[
											h.Type("button"),
											h.Id(openerId("speed")),
											h.Class("icon-btn rate-pill tabular"),
											h.AriaLabel(`Playback speed ${rateLabel(room.rate)}`),
											h.AriaExpanded(isOpen(room, "speed")),
											h.OnClick(
												Message.OpenedPanel({
													panel: "speed",
													fromPlayerSheet: false,
												})
											),
										],
										[rateLabel(room.rate)]
									),
									h.button(
										[
											h.Type("button"),
											h.Class("icon-btn dock-expand-chevron"),
											h.AriaLabel("Open full player"),
											h.OnClick(toSheet),
										],
										[chevUpIcon(h)]
									),
								]
							),
						]
					),
				]
			),
		]
	);
};

export const playerSheetView = (
	model: Model,
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): Html => {
	const hearing = hearingOf(room, contents, timeline);
	const title = Option.getOrUndefined(entryOf(model, room.work))?.title ?? "";

	return h.keyed("section")(
		"player",
		[
			h.Id(panelId("player")),
			h.Class("sheet-bottom"),
			h.Role("dialog"),
			h.AriaLabel("Audio player"),
		],
		[
			h.div(
				[h.Class("sheet-top"), h.OnMount(Flick())],
				[
					h.div([h.Class("sheet-grabber"), h.AriaHidden(true)], []),
					h.div(
						[h.Class("sheet-head")],
						[
							h.h2([h.Class("sheet-title")], ["Now listening"]),
							closeButtonView("Collapse player", h),
						]
					),
				]
			),
			h.div(
				[h.Class("sheet-body player-sheet-body")],
				[
					coverView(
						room.work,
						title,
						contents.cover !== null,
						[],
						h,
						"audio-cover is-sheet"
					),
					h.div(
						[h.Class("audio-titles")],
						[
							h.h3([h.Class("audio-chapter"), h.Dir("auto")], [hearing.title]),
							h.p(
								[h.Class("audio-book"), h.Dir("auto")],
								[bookLine(model, room)]
							),
						]
					),
					h.div(
						[h.Class("audio-scrubber-block")],
						[
							scrubberView("sheet-range", "Chapter timeline", hearing, h),
							readoutView(hearing, h),
						]
					),
					transportView(room, contents, timeline, hearing.chapter, h),
					utilitiesView(model, room, true, h),
				]
			),
		]
	);
};

export const speedView = (
	room: Room,
	isCentered: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("div")(
		"speed",
		[
			h.Id(panelId("speed")),
			h.Class(
				isCentered ? "popover from-bottom is-centered" : "popover from-bottom"
			),
			h.Role("dialog"),
			h.AriaLabel("Playback speed"),
		],
		[
			h.div(
				[h.Class("popover-head")],
				[
					h.h2([h.Class("popover-title")], ["Playback speed"]),
					h.span(
						[h.Class("popover-value tabular")],
						[`${room.rate.toFixed(2)}×`]
					),
				]
			),
			h.div(
				[h.Class("scrubber-wrap")],
				[
					h.label([h.Class("sr-only"), h.For("speed-range")], ["Speed"]),
					h.input([
						h.Id("speed-range"),
						h.Class("scrubber"),
						h.Type("range"),
						h.Min(String(SLOWEST)),
						h.Max(String(FASTEST)),
						h.Step("0.05"),
						h.Value(String(room.rate)),
						h.AriaValuetext(`${room.rate.toFixed(2)} times`),
						h.Style({
							"--val": fillOf(room.rate - SLOWEST, FASTEST - SLOWEST),
						}),
						h.OnInput((value) => Message.SetSpeed({ rate: Number(value) })),
					]),
				]
			),
			h.div(
				[h.Class("speed-presets")],
				PRESETS.map((rate) =>
					h.button(
						[
							h.Type("button"),
							h.Class("chip"),
							h.AriaPressed(String(Math.abs(rate - room.rate) < 0.01)),
							h.OnClick(Message.SetSpeed({ rate })),
						],
						[rateLabel(rate)]
					)
				)
			),
		]
	);

const sleepChoiceView = (
	label: string,
	isPressed: boolean,
	message: Message,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("menu-item"),
			h.AriaPressed(String(isPressed)),
			h.OnClick(message),
		],
		[label]
	);

export const sleepView = (
	room: Room,
	isCentered: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const isOff = !room.sleepEndOfChapter && Option.isNone(room.sleepMinutes);

	const left = Option.match(room.sleepLeft, {
		onNone: () => [],
		onSome: (minutes) => [
			h.span(
				[h.Class("popover-value tabular")],
				[minutes === 1 ? "1 minute left" : `${minutes} minutes left`]
			),
		],
	});

	return h.keyed("div")(
		"sleep",
		[
			h.Id(panelId("sleep")),
			h.Class(
				isCentered ? "popover from-bottom is-centered" : "popover from-bottom"
			),
			h.Role("dialog"),
			h.AriaLabel("Sleep timer"),
		],
		[
			h.div(
				[h.Class("popover-head")],
				[h.h2([h.Class("popover-title")], ["Sleep timer"]), ...left]
			),
			h.div(
				[h.Class("sleep-list")],
				[
					sleepChoiceView(
						"Off",
						isOff,
						Message.SetSleepTimer({
							minutes: Option.none(),
							endOfChapter: false,
						}),
						h
					),
					...SLEEP_CHOICES.map((minutes) =>
						sleepChoiceView(
							`${minutes} minutes`,
							Option.exists(room.sleepMinutes, (set) => set === minutes),
							Message.SetSleepTimer({
								minutes: Option.some(minutes),
								endOfChapter: false,
							}),
							h
						)
					),
					sleepChoiceView(
						"End of chapter",
						room.sleepEndOfChapter,
						Message.SetSleepTimer({
							minutes: Option.none(),
							endOfChapter: true,
						}),
						h
					),
				]
			),
		]
	);
};
