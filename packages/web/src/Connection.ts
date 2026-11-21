import { Duration, Effect, Stream } from "effect";
import { HttpClient } from "effect/http";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import type { Return } from "./Steps.ts";

const TRY_AGAIN_AFTER = Duration.seconds(5);

const isAnswering = Effect.flatMap(HttpClient.HttpClient, (client) =>
	client.head("/")
).pipe(
	Effect.map((response) => response.status >= 200 && response.status < 300),
	Effect.timeout(TRY_AGAIN_AFTER),
	Effect.orElseSucceed(() => false)
);

const TryAgain = Command.define("TryAgain", {
	messages: [Message.WentOnline],
	execute: isAnswering.pipe(
		Effect.delay(TRY_AGAIN_AFTER),
		Effect.repeat({ until: (isUp) => isUp }),
		Effect.as(Message.WentOnline())
	),
});

export const lostConnection = (model: Model): Return =>
	model.isOnline
		? {
				model: modifyFields(model, { isOnline: () => false }),
				commands: [TryAgain()],
			}
		: { model };

export const networkChanges = Stream.suspend(() =>
	Stream.merge(
		Stream.fromEventListener(window, "online").pipe(
			Stream.map(() => Message.WentOnline())
		),
		Stream.fromEventListener(window, "offline").pipe(
			Stream.map(() => Message.WentOffline())
		)
	)
);
