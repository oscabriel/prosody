import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { PressApi } from "@prosody/domain/PressApi.api";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { API_ALIAS, Front } from "./Front.ts";
import { plainFetch } from "./Http.ts";
import ProsodyLive, { Database } from "./ProsodyLive.ts";
import { sourceFingerprint } from "./Source.ts";

/**
 * The model's front door, as a swarm service. It publishes no port: the relay and the press reach
 * it by name on the Front network.
 *
 *   /api    the reader's Api, for the web app (typed calls, and a WebSocket per live read)
 *   /press  the press's Api, closed to anything that arrives through the relay
 *   /...    the reader's Api again as plain HTTP, for curl
 */
export default class Api extends Docker.Service<Api>()(
	"Api",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;

		// The cluster's own network, when the database has one, and the Front network.
		const clusterNetworks =
			database.network?.kind === "docker"
				? [{ name: database.network.name }]
				: [];

		return {
			main: import.meta.url,
			port: 3000,
			environment: { PROSODY_SOURCE: yield* sourceFingerprint },
			networks: [
				...clusterNetworks,
				{ name: front.name, aliases: [API_ALIAS] },
			],
		};
	}).pipe(Effect.provide(Database)),
	Effect.gen(function* () {
		const reader = yield* ReaderApi;
		const press = yield* PressApi;
		const plain = yield* plainFetch;

		return {
			fetch: Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const path = new URL(request.url, "http://localhost").pathname;

				if (path.startsWith("/api")) {
					return yield* reader.fetch;
				}

				if (path.startsWith("/press")) {
					// The relay is a reverse proxy, and a reverse proxy always adds this header. The press
					// calls the Api directly, so its requests never carry it.
					const isRelayed = request.headers["x-forwarded-for"] !== undefined;

					return isRelayed
						? HttpServerResponse.text("Not Found", { status: 404 })
						: yield* press.fetch;
				}

				return yield* plain;
			}),
		};
	}).pipe(Effect.provide(ProsodyLive))
) {}
