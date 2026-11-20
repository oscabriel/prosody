import { Duration, Effect, Stream } from "effect";
import { HttpClient } from "effect/http";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import type { Return } from "./Steps.ts";

/** How long to wait between tries of the server after losing it, and for each to be answered. */
const TRY_AGAIN_AFTER = Duration.seconds(5);

/** Whether the server answers a HEAD of the page, which the service worker lets through. */
const isAnswering = Effect.flatMap(HttpClient.HttpClient, (client) =>
	client.head("/")
).pipe(
	Effect.map((response) => response.status >= 200 && response.status < 300),
	Effect.timeout(TRY_AGAIN_AFTER),
	Effect.orElseSucceed(() => false)
);

/** Ask the server every few seconds, and say so once it answers. */
const TryAgain = Command.define("TryAgain", {
	messages: [Message.WentOnline],
	execute: isAnswering.pipe(
		Effect.delay(TRY_AGAIN_AFTER),
		Effect.repeat({ until: (isUp) => isUp }),
		Effect.as(Message.WentOnline())
	),
});

/**
 * The model could not be reached: a live read dropped, or a command's answer was lost. Stop the
 * live reads until the server answers again. Places kept meanwhile wait on the device.
 */
export const lostConnection = (model: Model): Return =>
	model.isOnline
		? {
				model: modifyFields(model, { isOnline: () => false }),
				commands: [TryAgain()],
			}
		: { model };

/** The browser's word on its network, as it changes. The window is found when it is followed. */
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
