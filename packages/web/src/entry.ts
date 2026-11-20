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

// The service worker keeps the app on the device, so it opens with no network. The dev server
// builds none.
if (import.meta.env.PROD) {
	void navigator.serviceWorker.register("/worker.js");
}

/** A fresh session for this page, for its command ids. */
const flags = Effect.gen(function* () {
	const random = yield* SecureRandom.SecureRandom;

	return { session: yield* random.uuidV4() };
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
