import { Stacks } from "@prosody/domain/Library/Stacks.external";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { PRESS_ALIAS } from "./Front.ts";

/**
 * The Stacks, played by the press, the one writer of the library: it queues the payload and answers
 * at once, and a press that can't be reached is a failure, so the Shelving policy runs again.
 */
export const PressStacks = Stacks.toLayer(
	Effect.gen(function* () {
		const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);

		return {
			shelve: (request) =>
				client
					.execute(
						HttpClientRequest.post(`http://${PRESS_ALIAS}:3000/shelve`).pipe(
							HttpClientRequest.bodyJsonUnsafe(request)
						)
					)
					.pipe(Effect.asVoid, Effect.orDie),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));
