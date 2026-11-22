import * as Domain from "@alchemy.run/domain";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Layer, Option } from "effect";
import { SecureRandom } from "effect/crypto";
import { FetchHttpClient } from "effect/http";
import { Socket } from "effect/socket";
import { Runtime } from "foldkit";

import {
	applyAppearance,
	savedAppearance,
	savedShelfLayout,
} from "./Appearance.ts";
import { savedReader } from "./AuthApi.ts";
import { savedCopies } from "./DeviceCopies.ts";
import { init, subscriptions, update, view } from "./Main.ts";
import { Flags, Message, Model } from "./Model.ts";
import { savedPlaces } from "./Places.ts";

const Connection = ReaderApi.layerClient.pipe(
	Layer.provide(Domain.protocolWebSocket(`${location.origin}/api`)),
	Layer.provide(Socket.layerWebSocketConstructorGlobal),
	Layer.provideMerge(FetchHttpClient.layer)
);

if (import.meta.env.PROD) {
	void navigator.serviceWorker.register("/worker.js");
}

const flags = Effect.gen(function* () {
	const random = yield* SecureRandom.SecureRandom;
	const appearance = yield* savedAppearance;

	applyAppearance(appearance);

	const reader = yield* savedReader;

	return {
		session: yield* random.uuidV4(),
		isOnline: navigator.onLine,
		reader,
		places: yield* savedPlaces(Option.map(reader, (user) => user.id)),
		copies: yield* savedCopies,
		appearance,
		shelfLayout: yield* savedShelfLayout,
		systemDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
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
