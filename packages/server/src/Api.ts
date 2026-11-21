import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { BunFileSystem, BunHttpPlatform } from "@effect/platform-bun";
import { PressApi } from "@prosody/domain/PressApi.api";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Option } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { COPIES, serveCopy } from "./Copies.ts";
import { API_ALIAS, Front } from "./Front.ts";
import { copiesOnHost } from "./Host.ts";
import { plainFetch } from "./Http.ts";
import { isPage, PageImage, servePage } from "./Page.ts";
import ProsodyLive, { Database } from "./ProsodyLive.ts";
import { authFetch, deviceOf, SessionLive, signedOut } from "./Session.ts";
import { sourceFingerprint } from "./Source.ts";
import { TAILSCALE, Tailscale } from "./Tailscale.ts";

export default class Api extends Docker.Service<Api>()(
	"Api",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;
		const page = yield* PageImage;

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
				{
					hostPath: yield* copiesOnHost,
					containerPath: COPIES,
					readOnly: true,
				},
				{ hostPath: TAILSCALE, containerPath: TAILSCALE, readOnly: true },
			],
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
					const isRelayed = request.headers["x-forwarded-for"] !== undefined;

					return isRelayed
						? HttpServerResponse.text("Not Found", { status: 404 })
						: yield* press.fetch;
				}

				return yield* plain;
			}).pipe(Effect.provide([BunHttpPlatform.layer, BunFileSystem.layer])),
		};
	}).pipe(Effect.provide([ProsodyLive, Tailscale.layer, SessionLive]))
) {}
