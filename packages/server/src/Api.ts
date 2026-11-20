import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { BunFileSystem, BunHttpPlatform } from "@effect/platform-bun";
import { PressApi } from "@prosody/domain/PressApi.api";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { COPIES, COPIES_ON_HOST, serveCopy } from "./Copies.ts";
import { API_ALIAS, Front } from "./Front.ts";
import { plainFetch } from "./Http.ts";
import { isPage, PageImage, servePage } from "./Page.ts";
import ProsodyLive, { Database } from "./ProsodyLive.ts";
import { authFetch, deviceOf, SessionLive, signedOut } from "./Session.ts";
import { sourceFingerprint } from "./Source.ts";
import { TAILSCALE, Tailscale } from "./Tailscale.ts";

/**
 * The model's front door, as a swarm service. It publishes no port: the relay and the press reach
 * it by name on the Front network.
 *
 *   /auth   Caddy's question before every request: is this one of your devices?
 *   /api    the reader's Api, for the web app (typed calls, and a WebSocket per live read)
 *   /press  the press's Api, closed to anything that arrives through the relay
 *   /copies the reading copies, read-only, for the reading room, once you are signed in
 *   /, /read/<work>, /assets/
 *           the web app
 *   /...    the reader's Api again as plain HTTP, for curl
 */
export default class Api extends Docker.Service<Api>()(
	"Api",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;
		const page = yield* PageImage;

		// The cluster's own network, when the database has one, and the Front network.
		const clusterNetworks =
			database.network?.kind === "docker"
				? [{ name: database.network.name }]
				: [];

		return {
			main: import.meta.url,
			image: page.imageRef,
			port: 3000,
			environment: { PROSODY_SOURCE: yield* sourceFingerprint },
			volumes: [
				{ hostPath: COPIES_ON_HOST, containerPath: COPIES, readOnly: true },
				{ hostPath: TAILSCALE, containerPath: TAILSCALE, readOnly: true },
			],
			// When tailscaled starts again, its socket is in a new folder the mount above cannot see.
			// Swarm then replaces the Api, and the new one mounts the new folder.
			healthcheck: {
				cmd: `test -S ${TAILSCALE}/tailscaled.sock`,
				interval: "10s",
				retries: 2,
			},
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
		const auth = yield* authFetch;

		return {
			fetch: Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const path = new URL(request.url, "http://localhost").pathname;

				if (path === "/auth") {
					return yield* auth;
				}

				if (path.startsWith("/api")) {
					return yield* reader.fetch;
				}

				if (path.startsWith("/copies/")) {
					return Option.isSome(deviceOf(request.headers))
						? yield* serveCopy
						: signedOut;
				}

				if (["GET", "HEAD"].includes(request.method) && isPage(path)) {
					return yield* servePage;
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
			}).pipe(
				// A copy or the page is served from Bun's file system, through its HTTP platform.
				Effect.provide([BunHttpPlatform.layer, BunFileSystem.layer])
			),
		};
	}).pipe(Effect.provide([ProsodyLive, Tailscale.layer, SessionLive]))
) {}
