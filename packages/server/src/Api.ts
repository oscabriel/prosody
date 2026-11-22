import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import { BunFileSystem, BunHttpPlatform } from "@effect/platform-bun";
import { PressApi } from "@prosody/domain/PressApi.api";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Effect, Layer, Option, Redacted } from "effect";
import { SecureRandom } from "effect/crypto";
import {
	FetchHttpClient,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";

import { AuthRoutes } from "./AuthRoutes.ts";
import { AuthSettings } from "./AuthSettings.ts";
import { AuthDatabase, AuthStore } from "./AuthStore.ts";
import { COPIES, serveCopy } from "./Copies.ts";
import { API_ALIAS, Front } from "./Front.ts";
import {
	copiesOnHost,
	localAuthOnHost,
	oidcAdminGroupOnHost,
	oidcClientIdOnHost,
	oidcClientSecretOnHost,
	oidcDisplayNameOnHost,
	oidcInternalUrlOnHost,
	oidcIssuerOnHost,
	oidcScopesOnHost,
	publicUrlOnHost,
} from "./Host.ts";
import { plainFetch } from "./Http.ts";
import { OidcClient } from "./Oidc.ts";
import { isPage, PageImage, servePage } from "./Page.ts";
import ProsodyLive, { Database } from "./ProsodyLive.ts";
import {
	isEarlyData,
	noStore,
	Sessions,
	SessionLive,
	signedOut,
	storeUnavailable,
	tooEarly,
} from "./Session.ts";
import { sourceFingerprint } from "./Source.ts";

const healthy = HttpServerResponse.text("ok", {
	status: 200,
	headers: noStore,
});

const AuthLive = AuthRoutes.layer.pipe(
	Layer.provideMerge(Sessions.layer),
	Layer.provideMerge(Layer.mergeAll(AuthStore.layer, OidcClient.layer)),
	Layer.provideMerge(AuthSettings.layer),
	Layer.provide([
		AuthDatabase.layer,
		SecureRandom.layerWebCrypto,
		FetchHttpClient.layer,
	])
);

export default class Api extends Docker.Service<Api>()(
	"Api",
	Effect.gen(function* () {
		const database = yield* Cluster.Database.Database;
		const front = yield* Front;
		const page = yield* PageImage;
		const secret = yield* oidcClientSecretOnHost;

		const clusterNetworks =
			database.network?.kind === "docker"
				? [{ name: database.network.name }]
				: [];

		return {
			main: import.meta.url,
			image: page.imageRef,
			port: 3000,
			environment: {
				PROSODY_SOURCE: yield* sourceFingerprint,
				PROSODY_DATABASE_URL: database.url,
				PROSODY_PUBLIC_URL: yield* publicUrlOnHost,
				PROSODY_LOCAL_AUTH: yield* localAuthOnHost,
				OIDC_ISSUER_URL: yield* oidcIssuerOnHost,
				OIDC_INTERNAL_URL: yield* oidcInternalUrlOnHost,
				OIDC_CLIENT_ID: yield* oidcClientIdOnHost,
				OIDC_CLIENT_SECRET: Redacted.make(secret),
				OIDC_DISPLAY_NAME: yield* oidcDisplayNameOnHost,
				OIDC_ADMIN_GROUP: yield* oidcAdminGroupOnHost,
				OIDC_SCOPES: yield* oidcScopesOnHost,
			},
			volumes: [
				{
					hostPath: yield* copiesOnHost,
					containerPath: COPIES,
					readOnly: true,
				},
			],
			healthcheck: {
				cmd: "bun -e 'fetch(\"http://127.0.0.1:3000/health\").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'",
				interval: "15s",
				retries: 3,
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
		const auth = yield* AuthRoutes;
		const sessions = yield* Sessions;

		return {
			fetch: Effect.gen(function* () {
				const request = yield* HttpServerRequest.HttpServerRequest;
				const path = new URL(request.url, "http://localhost").pathname;

				if (isEarlyData(request.method, request.headers)) {
					return tooEarly;
				}

				if (path === "/health") {
					return healthy;
				}

				if (path === "/auth" || path.startsWith("/auth/")) {
					return yield* auth.fetch;
				}

				if (path.startsWith("/api")) {
					return yield* reader.fetch;
				}

				if (path.startsWith("/copies/")) {
					return yield* sessions.authenticate(request.headers).pipe(
						Effect.flatMap(
							Option.match({
								onNone: () => Effect.succeed(signedOut),
								onSome: () => serveCopy,
							})
						),
						Effect.catchTag("AuthStoreError", () =>
							Effect.succeed(storeUnavailable)
						)
					);
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
			}).pipe(
				Effect.provide([
					BunHttpPlatform.layer,
					BunFileSystem.layer,
					SecureRandom.layerWebCrypto,
				])
			),
		};
	}).pipe(Effect.provide([ProsodyLive, SessionLive]), Effect.provide(AuthLive))
) {}
