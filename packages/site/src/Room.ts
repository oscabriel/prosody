import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./Model.ts";
import type { Listening } from "./Model.ts";
import { AUDIO, LENGTH, PASSAGE } from "./Passage.ts";
import { Listen, PLAYER } from "./Player.ts";

const clockOf = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));

	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const stateOf = (index: number, sentence: number | null): string =>
	index === sentence ? "spoken" : "quiet";

const playIcon = (h: HtmlBuilder<Message>): Html =>
	h.svg(
		[
			h.Width("18"),
			h.Height("18"),
			h.ViewBox("0 0 24 24"),
			h.Fill("currentColor"),
			h.AriaHidden(true),
		],
		[
			h.path(
				[
					h.D(
						"M7 5.2v13.6c0 .8.85 1.3 1.54.9l10.8-6.8a1.05 1.05 0 0 0 0-1.8L8.54 4.3A1.05 1.05 0 0 0 7 5.2Z"
					),
				],
				[]
			),
		]
	);

const pauseIcon = (h: HtmlBuilder<Message>): Html =>
	h.svg(
		[
			h.Width("18"),
			h.Height("18"),
			h.ViewBox("0 0 24 24"),
			h.Fill("currentColor"),
			h.AriaHidden(true),
		],
		[
			h.rect(
				[h.X("6"), h.Y("4.5"), h.Width("4.2"), h.Height("15"), h.Rx("1.2")],
				[]
			),
			h.rect(
				[h.X("13.8"), h.Y("4.5"), h.Width("4.2"), h.Height("15"), h.Rx("1.2")],
				[]
			),
		]
	);

export const roomView = (
	listening: Listening,
	h: HtmlBuilder<Message>
): Html => {
	const progress = Math.min(1, Math.max(0, listening.time / LENGTH));
	const remaining = Math.max(0, LENGTH - listening.time);

	const passageClasses = [
		"passage",
		listening.isPlaying ? "is-playing" : "",
		listening.sentence === null ? "" : "has-active",
	]
		.filter((name) => name !== "")
		.join(" ");

	return h.figure(
		[h.Class("room")],
		[
			h.div(
				[h.Class("room-head")],
				[
					h.p([h.Class("room-book")], ["Moby-Dick"]),
					h.p([h.Class("room-chapter")], ["Chapter 1: Loomings"]),
				]
			),
			h.p(
				[h.Class(passageClasses)],
				PASSAGE.flatMap((spoken, index) => [
					h.span(
						[
							h.Class("sentence"),
							h.DataAttribute("state", stateOf(index, listening.sentence)),
							h.OnClick(Message.ClickedSentence({ index })),
						],
						[spoken.text]
					),
					" ",
				])
			),
			h.div(
				[h.Class("room-dock")],
				[
					h.div(
						[h.Class("room-progress"), h.AriaHidden(true)],
						[
							h.div(
								[
									h.Class("room-progress-fill"),
									h.Style({ "--progress": String(progress) }),
								],
								[]
							),
						]
					),
					h.div(
						[h.Class("room-dock-row")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("play"),
									h.AriaLabel(listening.isPlaying ? "Pause" : "Listen"),
									h.OnClick(Message.ClickedPlay()),
								],
								[listening.isPlaying ? pauseIcon(h) : playIcon(h)]
							),
							h.div(
								[h.Class("room-dock-meta")],
								[
									h.p([h.Class("room-dock-title")], ["Chapter 1: Loomings"]),
									h.p(
										[h.Class("room-dock-clock")],
										[`${clockOf(listening.time)} · ${clockOf(remaining)} left`]
									),
								]
							),
							h.p(
								[h.Class("hint")],
								[
									"Tap any sentence to jump straight to that point in the audio.",
								]
							),
						]
					),
				]
			),
			h.audio(
				[
					h.Id(PLAYER),
					h.Src(AUDIO),
					h.Preload("metadata"),
					h.OnMount(Listen()),
				],
				[]
			),
			h.figcaption(
				[],
				[
					"Live output from Prosody’s aligner on public-domain sources: Project Gutenberg’s text of Moby-Dick and Stewart Wills’s LibriVox recording.",
				]
			),
		]
	);
};
