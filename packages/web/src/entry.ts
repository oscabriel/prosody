import * as Domain from "@alchemy.run/domain";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { Socket } from "effect/socket";
import { Runtime } from "foldkit";

import { Flags, init, Model, subscriptions, update, view } from "./Shelf.ts";

/**
 * The reader's Api for the life of the page, on this page's own origin. Calls go over HTTP; each
 * live read is a WebSocket the model pushes changes down.
 */
const Connection = ReaderApi.layerClient.pipe(
	Layer.provide(Domain.protocolWebSocket(`${location.origin}/api`)),
	Layer.provide(
		Layer.mergeAll(
			FetchHttpClient.layer,
			Socket.layerWebSocketConstructorGlobal
		)
	)
);

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
	}),
	{ flags: Effect.succeed({}) }
);
