import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./Model.ts";
import type { Listening } from "./Model.ts";
import { AUDIO, LENGTH, PASSAGE } from "./Passage.ts";
import { Listen, PLAYER } from "./Player.ts";

const clockOf = (seconds: number): string => {
	const whole = Math.max(0, Math.floor(seconds));

	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const stateOf = (index: number, sentence: number | null): string => {
	if (sentence === null) {
		return "ahead";
	}

	if (index === sentence) {
		return "spoken";
	}

	return index < sentence ? "heard" : "ahead";
};

export const roomView = (listening: Listening, h: HtmlBuilder<Message>): Html =>
	h.figure(
		[h.Class("room")],
		[
			h.div(
				[h.Class("room-head")],
				[
					h.p([h.Class("label")], ["Moby-Dick · Chapter 1: Loomings"]),
					h.p(
						[h.Class("label clock")],
						[`${clockOf(listening.time)} of ${clockOf(LENGTH)}`]
					),
				]
			),
			h.p(
				[h.Class("passage")],
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
				[h.Class("room-foot")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("play"),
							h.OnClick(Message.ClickedPlay()),
						],
						[listening.isPlaying ? "Pause" : "Listen"]
					),
					h.p(
						[h.Class("hint")],
						["Tap any sentence to jump straight to that point in the audio."]
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
