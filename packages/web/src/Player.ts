import { Effect, Option, Schema, Stream } from "effect";
import { Command, Mount } from "foldkit";

import { Message } from "./Model.ts";

/** The id of the one audio element. */
export const PLAYER = "prosody-player";

/** The browser would not play: it wants the page touched first, or the audio could not load. */
class PlayRefused extends Schema.TaggedError<PlayRefused>()(
	"PlayRefused",
	{}
) {}

/** Play `audio`. A refusal is ignored: the Listen button stays, to be pressed again. */
const startPlaying = (audio: HTMLAudioElement | undefined) =>
	Effect.tryPromise({
		try: async () => {
			await audio?.play();
		},
		catch: () => new PlayRefused(),
	}).pipe(Effect.ignore);

const player = (): HTMLAudioElement | undefined => {
	const element = document.querySelector(`#${PLAYER}`);

	return element instanceof HTMLAudioElement ? element : undefined;
};

/**
 * What the audio element does, as Messages: when it starts, where it is (about four times a
 * second while it plays) and when it stops. Each carries the clock, so a place kept from it says
 * when it was kept.
 */
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
			Stream.map(() =>
				Message.Paused({ time: audio.currentTime, at: Date.now() })
			)
		);

		const ticked = Stream.fromEventListener(audio, "timeupdate").pipe(
			Stream.map(() =>
				Message.Ticked({ time: audio.currentTime, at: Date.now() })
			)
		);

		return Stream.merge(played, Stream.merge(paused, ticked));
	},
});

/** Start the audio. A browser may refuse until the page has been touched; the button stays. */
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

/** The next animation frame. */
const frame = Effect.callback<undefined>((resume) => {
	requestAnimationFrame(() => {
		resume(Effect.undefined);
	});
});

/**
 * The audio element once it is on the page. A seek can be sent in the same update that first
 * draws the player, before the element exists, so look again each frame, for a second at most.
 */
const playerOnPage = Effect.gen(function* () {
	for (let tries = 0; tries < 60; tries += 1) {
		const audio = player();

		if (audio !== undefined) {
			return Option.some(audio);
		}

		yield* frame;
	}

	return Option.none<HTMLAudioElement>();
});

/** Move the audio to `time`, in seconds, and play from there if `play`. */
export const Seek = Command.define("Seek", {
	args: { time: Schema.Finite, play: Schema.Boolean },
	messages: [Message.CompletedPlayer],
	execute: ({ time, play }) =>
		Effect.gen(function* () {
			const found = yield* playerOnPage;

			if (Option.isNone(found)) {
				return Message.CompletedPlayer();
			}

			const audio = found.value;

			// A seek before the audio knows its length is dropped, so wait for that first.
			if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
				yield* Effect.callback<undefined>((resume) => {
					audio.addEventListener(
						"loadedmetadata",
						() => {
							resume(Effect.undefined);
						},
						{ once: true }
					);
				});
			}

			audio.currentTime = time;

			if (play) {
				yield* startPlaying(audio);
			}

			return Message.CompletedPlayer();
		}),
});

export const SetRate = Command.define("SetRate", {
	args: { rate: Schema.Finite },
	messages: [Message.CompletedPlayer],
	execute: ({ rate }) =>
		Effect.sync(() => {
			const audio = player();

			if (audio !== undefined) {
				audio.playbackRate = rate;
			}
		}).pipe(Effect.as(Message.CompletedPlayer())),
});
