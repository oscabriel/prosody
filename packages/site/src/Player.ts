import { Effect, Schema, Stream } from "effect";
import { Command, Mount } from "foldkit";

import { Message } from "./Model.ts";

export const PLAYER = "passage-player";

class PlayRefused extends Schema.TaggedError<PlayRefused>()(
	"PlayRefused",
	{}
) {}

const player = (): HTMLAudioElement | undefined => {
	const element = document.querySelector(`#${PLAYER}`);

	return element instanceof HTMLAudioElement ? element : undefined;
};

const startPlaying = (audio: HTMLAudioElement | undefined) =>
	Effect.tryPromise({
		try: async () => {
			await audio?.play();
		},
		catch: () => new PlayRefused(),
	}).pipe(Effect.ignore);

export const Listen = Mount.defineStream("Listen", {
	messages: [Message.Played, Message.Paused, Message.Ticked],
	execute: ({ element }) => {
		if (!(element instanceof HTMLAudioElement)) {
			return Stream.empty;
		}

		const audio = element;

		const played = Stream.fromEventListener(audio, "play").pipe(
			Stream.map(() => Message.Played())
		);

		const paused = Stream.fromEventListener(audio, "pause").pipe(
			Stream.map(() => Message.Paused())
		);

		const ticked = Stream.fromEventListener(audio, "timeupdate").pipe(
			Stream.map(() => Message.Ticked({ time: audio.currentTime }))
		);

		return Stream.merge(played, Stream.merge(paused, ticked));
	},
});

export const Play = Command.define("Play", {
	messages: [Message.CompletedPlayer],
	execute: Effect.suspend(() => startPlaying(player())).pipe(
		Effect.as(Message.CompletedPlayer())
	),
});

export const Pause = Command.define("Pause", {
	messages: [Message.CompletedPlayer],
	execute: Effect.sync(() => player()?.pause()).pipe(
		Effect.as(Message.CompletedPlayer())
	),
});

export const PlayFrom = Command.define("PlayFrom", {
	args: { time: Schema.Finite },
	messages: [Message.CompletedPlayer],
	execute: ({ time }) =>
		Effect.gen(function* () {
			const audio = player();

			if (audio !== undefined) {
				audio.currentTime = time;
			}

			yield* startPlaying(audio);

			return Message.CompletedPlayer();
		}),
});
