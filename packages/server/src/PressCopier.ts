import { Copier } from "@prosody/domain/Reading/Copier.external";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { PRESS_ALIAS } from "./Front.ts";

/**
 * The Copier, played by the press, as the PressAligner is: the press queues the edition and answers
 * at once, and a press that can't be reached is a failure, so the ReadingCopy policy runs again.
 */
export const PressCopier = Copier.toLayer(
	Effect.gen(function* () {
		const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);

		return {
			copy: (request) =>
				client
					.execute(
						HttpClientRequest.post(`http://${PRESS_ALIAS}:3000/copy`).pipe(
							HttpClientRequest.bodyJsonUnsafe(request)
						)
					)
					.pipe(Effect.asVoid, Effect.orDie),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));
