import { Effect, Option, Schema, Stream } from "effect";
import { Command, Mount } from "foldkit";

import { Message } from "./Model.ts";

export const PLAYER = "prosody-player";

class PlayRefused extends Schema.TaggedError<PlayRefused>()(
	"PlayRefused",
	{}
) {}

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

export const SKIP_BACK = 15;

export const SKIP_AHEAD = 30;

const takeControls = (audio: HTMLAudioElement) =>
	Effect.sync(() => {
		const session = navigator.mediaSession;

		session.setActionHandler("play", () => {
			void audio.play();
		});
		session.setActionHandler("pause", () => {
			audio.pause();
		});
		session.setActionHandler("seekbackward", ({ seekOffset }) => {
			audio.currentTime = Math.max(
				0,
				audio.currentTime - (seekOffset ?? SKIP_BACK)
			);
		});
		session.setActionHandler("seekforward", ({ seekOffset }) => {
			audio.currentTime = Math.min(
				audio.duration,
				audio.currentTime + (seekOffset ?? SKIP_AHEAD)
			);
		});
		session.setActionHandler("seekto", ({ seekTime }) => {
			audio.currentTime = seekTime ?? audio.currentTime;
		});
	});

const dropControls = Effect.sync(() => {
	const session = navigator.mediaSession;

	for (const action of [
		"play",
		"pause",
		"seekbackward",
		"seekforward",
		"seekto",
	] as const) {
		session.setActionHandler(action, null);
	}

	session.metadata = null;
});

const showPosition = (audio: HTMLAudioElement) =>
	Effect.sync(() => {
		if (Number.isFinite(audio.duration)) {
			navigator.mediaSession.setPositionState({
				duration: audio.duration,
				playbackRate: audio.playbackRate,
				position: Math.min(audio.currentTime, audio.duration),
			});
		}
	});

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
			Stream.tap(() => showPosition(audio)),
			Stream.map(() =>
				Message.Ticked({ time: audio.currentTime, at: Date.now() })
			)
		);

		return Stream.unwrap(
			Effect.acquireRelease(takeControls(audio), () => dropControls).pipe(
				Effect.as(Stream.merge(played, Stream.merge(paused, ticked)))
			)
		);
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

const frame = Effect.callback<undefined>((resume) => {
	requestAnimationFrame(() => {
		resume(Effect.undefined);
	});
});

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
