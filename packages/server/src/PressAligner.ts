import { Aligner } from "@prosody/domain/Narration/Aligner.external";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { PRESS_ALIAS } from "./Front.ts";

/**
 * The Aligner, played by the press. The runner asks it over the cluster's network; the press queues
 * the pair and answers at once. A press that can't be reached is a failure, not an answer, so the
 * Alignment policy runs again.
 */
export const PressAligner = Aligner.toLayer(
	Effect.gen(function* () {
		const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);

		return {
			align: (request) =>
				client
					.execute(
						HttpClientRequest.post(`http://${PRESS_ALIAS}:3000/align`).pipe(
							HttpClientRequest.bodyJsonUnsafe(request)
						)
					)
					.pipe(Effect.asVoid, Effect.orDie),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));
