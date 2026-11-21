import type { Contents, Timeline } from "@prosody/domain/Reading/Copy";
import type { Html, HtmlBuilder } from "foldkit/html";

import { copyUrl, kindOf } from "./Copy.ts";
import { Message } from "./Model.ts";
import type { Room } from "./Model.ts";
import { Listen, PLAYER, SKIP_AHEAD, SKIP_BACK } from "./Player.ts";
import { chapterOf, titleOf } from "./Steps.ts";
import { heardOf, leftInSection } from "./Timeline.ts";

export const clockOf = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const rest = String(whole % 60).padStart(2, "0");

	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
		: `${minutes}:${rest}`;
};

export const listeningView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const index = chapterOf(room, contents);
	const chapter = contents.chapters[index];
	const start = chapter?.start ?? 0;
	const length = (chapter?.end ?? start) - start;

	const cover =
		contents.cover === null
			? []
			: [
					h.img([
						h.Class("listening-cover"),
						h.Src(copyUrl(room.work, contents.cover)),
						h.Alt(""),
					]),
				];

	return [
		h.p(
			[h.Class("label chapter")],
			[`Chapter ${index + 1} of ${contents.chapters.length}`]
		),
		h.h2([h.Class("listening-title")], [titleOf(contents, index)]),
		...cover,
		h.p(
			[h.Class("clock")],
			[`${clockOf(room.time - start)} of ${clockOf(length)}`]
		),
		h.div(
			[h.Class("skips")],
			[
				h.button(
					[
						h.Type("button"),
						h.OnClick(Message.ClickedSkip({ seconds: -SKIP_BACK })),
					],
					[`← Back ${SKIP_BACK} seconds`]
				),
				h.button(
					[
						h.Type("button"),
						h.OnClick(Message.ClickedSkip({ seconds: SKIP_AHEAD })),
					],
					[`On ${SKIP_AHEAD} seconds →`]
				),
			]
		),
	];
};

const minutes = (seconds: number): string => {
	const whole = Math.round(seconds / 60);

	if (whole < 1) {
		return "under a minute";
	}

	return whole === 1 ? "1 minute" : `${whole} minutes`;
};

const leftInChapter = (
	room: Room,
	contents: Contents,
	timeline: Timeline
): number => {
	const index = chapterOf(room, contents);

	if (kindOf(contents) === "audio") {
		return Math.max(0, (contents.chapters[index]?.end ?? 0) - room.time);
	}

	const section = contents.sections[index]?.path ?? "";

	return leftInSection(heardOf(timeline), section, room.time);
};

export const playerView = (
	room: Room,
	contents: Contents,
	timeline: Timeline,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (contents.audio === null) {
		return [];
	}

	const left = leftInChapter(room, contents, timeline);

	return [
		h.div(
			[h.Class("player")],
			[
				h.audio(
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
				h.button(
					[
						h.Type("button"),
						h.Class("play"),
						h.OnClick(
							room.isPlaying ? Message.ClickedPause() : Message.ClickedPlay()
						),
					],
					[room.isPlaying ? "Pause" : "Listen"]
				),
				h.button(
					[
						h.Type("button"),
						h.Class("rate"),
						h.AriaLabel("Speed"),
						h.OnClick(Message.ClickedRate()),
					],
					[`${room.rate}×`]
				),
				h.span(
					[h.Class("left")],
					[left > 0 ? `${minutes(left / room.rate)} left in the chapter` : ""]
				),
			]
		),
	];
};
