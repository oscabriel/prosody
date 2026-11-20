import * as Domain from "@alchemy.run/domain";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Layer } from "effect";
import { SecureRandom } from "effect/crypto";
import { FetchHttpClient } from "effect/http";
import { Socket } from "effect/socket";
import { Runtime } from "foldkit";

import { init, subscriptions, update, view } from "./Main.ts";
import { Flags, Message, Model } from "./Model.ts";

/**
 * The reader's Api for the life of the page, on this page's own origin. Calls go over HTTP; each
 * live read is a WebSocket the model pushes changes down. The reading copies are plain fetches.
 */
const Connection = ReaderApi.layerClient.pipe(
	Layer.provide(Domain.protocolWebSocket(`${location.origin}/api`)),
	Layer.provide(Socket.layerWebSocketConstructorGlobal),
	Layer.provideMerge(FetchHttpClient.layer)
);

/** What a device calls itself, from its browser: enough to say "on your iPhone". */
const deviceName = (): string => {
	const agent = navigator.userAgent;

	for (const [pattern, name] of [
		[/iPhone/u, "iPhone"],
		[/iPad/u, "iPad"],
		[/Android/u, "Android"],
		[/Macintosh/u, "Mac"],
		[/Windows/u, "Windows"],
		[/Linux/u, "Linux"],
	] as const) {
		if (pattern.test(agent)) {
			return name;
		}
	}

	return "another device";
};

/**
 * This browser's name for itself, kept between visits, so a place it kept is known as its own.
 * A browser that keeps nothing gets a new name each visit, which only means it is offered its own
 * places back.
 */
const keptName = (fresh: string): string => {
	try {
		const kept = localStorage.getItem("prosody-device");

		if (kept !== null) {
			return kept;
		}

		localStorage.setItem("prosody-device", fresh);
	} catch {
		// Storage is off: the fresh name will do for this visit.
	}

	return fresh;
};

/** This device's name, and a new session for this page. */
const flags = Effect.gen(function* () {
	const random = yield* SecureRandom.SecureRandom;
	const fresh = `${deviceName()} (${(yield* random.uuidV4()).slice(0, 4)})`;

	return {
		device: yield* Effect.sync(() => keptName(fresh)),
		session: yield* random.uuidV4(),
	};
}).pipe(Effect.provide(SecureRandom.layerWebCrypto));

Runtime.run(
	Runtime.makeApplication({
		Model,
		Flags,
		init,
		update,
		view,
		subscriptions,
		resources: Connection,
		container: document.querySelector("#root"),
		routing: {
			onUrlRequest: (request) => Message.ClickedLink({ request }),
			onUrlChange: (url) => Message.ChangedUrl({ url }),
		},
	}),
	{
		flags,
	}
);
