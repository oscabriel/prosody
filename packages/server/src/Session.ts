import { Actor } from "@prosody/domain/Actor.context";
import { Session, SignedOut } from "@prosody/domain/Session.middleware";
import { Context, Effect, Layer, Option } from "effect";
import type { Headers } from "effect/http";
import { HttpServerResponse } from "effect/http";

import type { Authenticated, AuthStoreError } from "./AuthStore.ts";
import { AuthStore } from "./AuthStore.ts";

export const SESSION_COOKIE = "prosody_session";

export const OIDC_STATE_COOKIE = "prosody_oidc_state";

export const noStore = { "cache-control": "no-store" };

const hostOf = (origin: string): string =>
	URL.canParse(origin) ? new URL(origin).host : "";

export const isCrossSite = (headers: Headers.Headers): boolean => {
	const { origin, host } = headers;

	if (origin !== undefined && hostOf(origin) !== host) {
		return true;
	}

	const site = headers["sec-fetch-site"];

	const isPageLoad =
		headers["sec-fetch-mode"] === "navigate" &&
		headers["sec-fetch-dest"] === "document";

	return (site === "cross-site" || site === "same-site") && !isPageLoad;
};

const ESCAPE = /^%[0-9a-f]{2}/iu;

const decodeCookie = (value: string): string => {
	if (!value.includes("%")) {
		return value;
	}

	const bytes: Array<number> = [];

	for (let at = 0; at < value.length; at += 1) {
		const rest = value.slice(at);

		if (ESCAPE.test(rest)) {
			bytes.push(Number.parseInt(rest.slice(1, 3), 16));
			at += 2;
		} else {
			bytes.push(...Buffer.from(rest.slice(0, 1), "utf-8"));
		}
	}

	return new TextDecoder().decode(new Uint8Array(bytes));
};

export const parseCookies = (
	header: string | undefined
): ReadonlyMap<string, string> => {
	const cookies = new Map<string, string>();

	for (const part of (header ?? "").split(";")) {
		const split = part.indexOf("=");
		const name = part.slice(0, Math.max(split, 0)).trim();

		if (split > 0 && name !== "" && !cookies.has(name)) {
			const raw = part.slice(split + 1).trim();

			const quoted =
				raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');

			cookies.set(name, decodeCookie(quoted ? raw.slice(1, -1) : raw));
		}
	}

	return cookies;
};

export interface PresentedToken {
	readonly token: string;
	readonly source: "bearer" | "cookie";
}

const BEARER = /^Bearer\s+(?<token>\S+)$/iu;

export const bearerOf = (headers: Headers.Headers): Option.Option<string> =>
	Option.fromNullishOr(BEARER.exec(headers.authorization ?? "")?.groups?.token);

export const tokenFrom = (
	headers: Headers.Headers
): Option.Option<PresentedToken> =>
	bearerOf(headers).pipe(
		Option.map((token): PresentedToken => ({ token, source: "bearer" })),
		Option.orElse(() =>
			Option.fromUndefinedOr(
				parseCookies(headers.cookie).get(SESSION_COOKIE)
			).pipe(
				Option.filter((token) => token !== ""),
				Option.map((token): PresentedToken => ({ token, source: "cookie" }))
			)
		)
	);

export class Sessions extends Context.Service<
	Sessions,
	{
		readonly authenticate: (
			headers: Headers.Headers
		) => Effect.Effect<Option.Option<Authenticated>, AuthStoreError>;
	}
>()("@prosody/server/Sessions", {
	make: Effect.gen(function* () {
		const store = yield* AuthStore;

		const authenticate = Effect.fn("Sessions.authenticate")(function* (
			headers: Headers.Headers
		) {
			const presented = tokenFrom(headers);

			if (
				Option.isNone(presented) ||
				(presented.value.source === "cookie" && isCrossSite(headers))
			) {
				return Option.none<Authenticated>();
			}

			return yield* store.authenticateSession(presented.value.token);
		});

		return { authenticate };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

export const authenticateRequest = (headers: Headers.Headers) =>
	Sessions.use((sessions) => sessions.authenticate(headers));

export const SessionLive = Layer.effect(Session)(
	Effect.gen(function* () {
		const sessions = yield* Sessions;

		return (effect, { headers }) =>
			sessions.authenticate(headers).pipe(
				Effect.orDie,
				Effect.flatMap(
					Option.match({
						onNone: () => Effect.fail(new SignedOut()),
						onSome: ({ user, session }) =>
							Effect.provideService(effect, Actor, {
								reader: user.id,
								role: user.role,
								device: session.device,
							}),
					})
				)
			);
	})
);

export const signedOut = HttpServerResponse.text("Signed out", {
	status: 401,
	headers: noStore,
});

const SAFE_METHODS = new Set(["GET", "HEAD"]);

export const isEarlyData = (
	method: string,
	headers: Headers.Headers
): boolean => !SAFE_METHODS.has(method) && headers["early-data"] === "1";

export const tooEarly = HttpServerResponse.text("Too early", {
	status: 425,
	headers: noStore,
});

export const storeUnavailable = HttpServerResponse.text(
	"Sign-in is unavailable right now",
	{ status: 503, headers: noStore }
);
