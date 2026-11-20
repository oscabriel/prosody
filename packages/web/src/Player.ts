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

/** How far the lock screen's skip buttons go, in seconds, when they do not say. */
const SKIP_BACK = 15;

const SKIP_AHEAD = 30;

/**
 * Answer the lock screen's buttons by moving the audio element itself: what it does then comes
 * back as its own events, as if the page's own buttons were pressed.
 */
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

/** Leave the lock screen as it was before the book was open. */
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

/** Show where the audio is on the lock screen's bar, once it knows its length. */
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

/**
 * What the audio element does, as Messages: when it starts, where it is (about four times a
 * second while it plays) and when it stops. Each carries the clock, so a place kept from it says
 * when it was kept. While the element is on the page, the lock screen's buttons move it.
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
