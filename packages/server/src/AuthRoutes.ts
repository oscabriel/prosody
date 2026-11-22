import { ReaderId, Role } from "@prosody/domain/Reader.id";
import {
	Clock,
	Context,
	Duration,
	Effect,
	Layer,
	Match,
	Option,
	Ref,
	Schema,
} from "effect";
import type { SecureRandom } from "effect/crypto";
import type { Headers } from "effect/http";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { AuthSettings } from "./AuthSettings.ts";
import type {
	Authenticated,
	AuthStoreError,
	InvalidInvite,
	LastAdmin,
	NotFound,
	PublicInvite,
	PublicUser,
	SessionInfo,
	SetupAlreadyDone,
	UsernameTaken,
} from "./AuthStore.ts";
import { AuthStore, isValidUsername } from "./AuthStore.ts";
import type { CryptoFailed } from "./Crypto.ts";
import {
	constantTimeEqual,
	dummyVerifyPassword,
	hashPassword,
	randomToken,
	sha256Base64Url,
	verifyPassword,
} from "./Crypto.ts";
import type { OidcFailed } from "./Oidc.ts";
import { OidcClient } from "./Oidc.ts";
import {
	bearerOf,
	isCrossSite,
	isEarlyData,
	noStore,
	OIDC_STATE_COOKIE,
	parseCookies,
	SESSION_COOKIE,
	Sessions,
	tokenFrom,
} from "./Session.ts";

export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
	status: Schema.Int,
	reason: Schema.String,
}) {}

const rejected = (status: number, reason: string) =>
	new Rejected({ status, reason });

export const ATTEMPT_WINDOW = Duration.toMillis(Duration.minutes(5));

export const ATTEMPTS_PER_USERNAME = 10;

export const MAX_ATTEMPT_KEYS = 4096;

const OIDC_STATE_LIFETIME = Duration.toMillis(Duration.minutes(10));

const MIN_PASSWORD = 8;

const MAX_PASSWORD = 1024;

const MAX_NAME = 64;

const MAX_NOTE = 200;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
	[/\bEdg(?:e|A|iOS)?\//u, "Edge"],
	[/\b(?:OPR|Opera)\//u, "Opera"],
	[/\b(?:Firefox|FxiOS)\//u, "Firefox"],
	[/\b(?:Chrome|CriOS|Chromium)\//u, "Chrome"],
	[/\bVersion\/[\d.]+.*\bSafari\//u, "Safari"],
];

const PLATFORMS: ReadonlyArray<readonly [RegExp, string]> = [
	[/\biPhone\b/u, "iPhone"],
	[/\biPad\b/u, "iPad"],
	[/\bAndroid\b/u, "Android"],
	[/\bCrOS\b/u, "ChromeOS"],
	[/\b(?:Macintosh|Mac OS X)\b/u, "Mac"],
	[/\bWindows\b/u, "Windows"],
	[/\bLinux\b/u, "Linux"],
];

const firstMatch = (
	table: ReadonlyArray<readonly [RegExp, string]>,
	text: string
): string | undefined => table.find(([pattern]) => pattern.test(text))?.[1];

export const deviceNameFromUserAgent = (agent = ""): string => {
	const browser = firstMatch(BROWSERS, agent);
	const platform = firstMatch(PLATFORMS, agent);

	if (browser !== undefined && platform !== undefined) {
		return `${browser} on ${platform}`;
	}

	if (browser !== undefined) {
		return browser;
	}

	return platform === undefined ? "Browser" : `Browser on ${platform}`;
};

const forwardedProto = (headers: Headers.Headers): string | undefined =>
	headers["x-forwarded-proto"]?.split(",")[0]?.trim().toLowerCase();

export const isSecureRequest = (
	headers: Headers.Headers,
	publicUrl: string
): boolean =>
	publicUrl.startsWith("https://") || forwardedProto(headers) === "https";

export const originOf = (headers: Headers.Headers, publicUrl: string): string =>
	publicUrl === ""
		? `${forwardedProto(headers) === "https" ? "https" : "http"}://${headers.host ?? "localhost"}`
		: publicUrl;

export const safeRedirect = (target: string | null): string =>
	target !== null &&
	target.startsWith("/") &&
	!target.startsWith("//") &&
	!target.includes("\\") &&
	/^[ -~]*$/u.test(target)
		? target
		: "/";

const cleanName = (value: string | undefined, max: number): string =>
	(value ?? "").replaceAll(/\s+/gu, " ").trim().slice(0, max);

const Mode = Schema.Literals(["cookie", "bearer"]);

type Mode = typeof Mode.Type;

const Credentials = Schema.Struct({
	username: Schema.String,
	password: Schema.String,
	deviceName: Schema.optionalKey(Schema.String),
	mode: Schema.optionalKey(Mode),
});

const Setup = Schema.Struct({
	username: Schema.String,
	password: Schema.String,
	displayName: Schema.optionalKey(Schema.String),
	deviceName: Schema.optionalKey(Schema.String),
	mode: Schema.optionalKey(Mode),
});

const Register = Schema.Struct({
	token: Schema.String,
	username: Schema.String,
	password: Schema.String,
	displayName: Schema.optionalKey(Schema.String),
	deviceName: Schema.optionalKey(Schema.String),
	mode: Schema.optionalKey(Mode),
});

const Rename = Schema.Struct({ deviceName: Schema.String });

const InviteRequest = Schema.Struct({
	role: Schema.optionalKey(Role),
	note: Schema.optionalKey(Schema.String),
});

const RoleChange = Schema.Struct({ role: Role });

const bodyOf = <A>(schema: Schema.ConstraintDecoder<A>) =>
	HttpServerRequest.schemaBodyJson(schema).pipe(
		Effect.mapError(() => rejected(400, "The request body could not be read"))
	);

const respond = (status: number, body: Schema.Json) =>
	HttpServerResponse.jsonUnsafe(body, { status, headers: noStore });

const noContent = HttpServerResponse.empty({ status: 204, headers: noStore });

const redirect = (location: string) =>
	HttpServerResponse.redirect(location, { status: 302, headers: noStore });

const sessionView = (session: SessionInfo, current: string) => ({
	id: session.id,
	deviceName: session.device,
	createdAt: session.createdAt,
	lastSeenAt: session.lastSeenAt,
	expiresAt: session.expiresAt,
	current: session.id === current,
});

const inviteView = (invite: PublicInvite) => ({
	id: invite.id,
	role: invite.role,
	note: invite.note,
	createdBy: invite.createdBy,
	createdAt: invite.createdAt,
	expiresAt: invite.expiresAt,
});

const userView = (user: PublicUser) => ({
	id: user.id,
	username: user.username,
	displayName: user.displayName,
	role: user.role,
	createdAt: user.createdAt,
});

const usernameOf = (raw: string) => {
	const username = raw.trim().toLowerCase();

	return isValidUsername(username)
		? Effect.succeed(username)
		: Effect.fail(
				rejected(
					400,
					"A username is 1 to 32 lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit"
				)
			);
};

const passwordOf = (password: string) =>
	password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD
		? Effect.succeed(password)
		: Effect.fail(
				rejected(400, `A password is at least ${MIN_PASSWORD} characters`)
			);

export interface Attempts {
	readonly count: number;
	readonly since: number;
}

export const admit = (
	seen: ReadonlyMap<string, Attempts>,
	key: string,
	now: number
): readonly [boolean, ReadonlyMap<string, Attempts>] => {
	const entry = seen.get(key);

	const current =
		entry !== undefined && now - entry.since < ATTEMPT_WINDOW
			? entry
			: undefined;

	if (current !== undefined && current.count >= ATTEMPTS_PER_USERNAME) {
		return [false, seen];
	}

	const kept = [...seen].filter(
		([name, other]) => name !== key && now - other.since < ATTEMPT_WINDOW
	);

	const counted: Attempts =
		current === undefined
			? { count: 1, since: now }
			: { count: current.count + 1, since: current.since };

	return [
		true,
		new Map([
			...kept.slice(Math.max(kept.length - (MAX_ATTEMPT_KEYS - 1), 0)),
			[key, counted],
		]),
	];
};

const segmentsOf = (path: string): ReadonlyArray<string> =>
	path.split("/").filter((segment) => segment !== "");

const PARAMETER = ":";

const matches = (
	pattern: ReadonlyArray<string>,
	segments: ReadonlyArray<string>
): boolean =>
	pattern.length === segments.length &&
	pattern.every(
		(part, index) =>
			(part === PARAMETER && segments[index] !== "") || part === segments[index]
	);

interface Asked {
	readonly headers: Headers.Headers;
	readonly url: URL;
	readonly id: string;
}

type RouteError =
	| Rejected
	| OidcFailed
	| AuthStoreError
	| UsernameTaken
	| SetupAlreadyDone
	| InvalidInvite
	| LastAdmin
	| NotFound
	| CryptoFailed;

type Route = readonly [
	method: string,
	pattern: ReadonlyArray<string>,
	handle: (
		asked: Asked
	) => Effect.Effect<
		HttpServerResponse.HttpServerResponse,
		RouteError,
		HttpServerRequest.HttpServerRequest | SecureRandom.SecureRandom
	>,
];

export class AuthRoutes extends Context.Service<
	AuthRoutes,
	{
		readonly fetch: Effect.Effect<
			HttpServerResponse.HttpServerResponse,
			never,
			HttpServerRequest.HttpServerRequest | SecureRandom.SecureRandom
		>;
	}
>()("@prosody/server/AuthRoutes", {
	make: Effect.gen(function* () {
		const store = yield* AuthStore;
		const sessions = yield* Sessions;
		const oidc = yield* OidcClient;
		const settings = yield* AuthSettings;

		const attempts = yield* Ref.make<ReadonlyMap<string, Attempts>>(
			new Map<string, Attempts>()
		);

		const admitAttempt = Effect.fnUntraced(function* (key: string) {
			const now = yield* Clock.currentTimeMillis;

			return yield* Ref.modify(attempts, (seen) => admit(seen, key, now));
		});

		const forgetAttempts = (key: string) =>
			Ref.update(attempts, (seen) => {
				const next = new Map(seen);

				next.delete(key);

				return next;
			});

		const sessionCookie = (
			response: HttpServerResponse.HttpServerResponse,
			headers: Headers.Headers,
			token: string
		) =>
			HttpServerResponse.setCookieUnsafe(response, SESSION_COOKIE, token, {
				httpOnly: true,
				path: "/",
				sameSite: "lax",
				secure: isSecureRequest(headers, settings.publicUrl),
				maxAge: "90 days",
			});

		const expireSessionCookie = (
			response: HttpServerResponse.HttpServerResponse,
			headers: Headers.Headers
		) =>
			HttpServerResponse.expireCookieUnsafe(response, SESSION_COOKIE, {
				httpOnly: true,
				path: "/",
				sameSite: "lax",
				secure: isSecureRequest(headers, settings.publicUrl),
			});

		const stateCookieOptions = (headers: Headers.Headers) => ({
			httpOnly: true,
			path: "/auth/oidc",
			sameSite: "lax" as const,
			secure: isSecureRequest(headers, settings.publicUrl),
		});

		const expireStateCookie = (
			response: HttpServerResponse.HttpServerResponse,
			headers: Headers.Headers
		) =>
			HttpServerResponse.expireCookieUnsafe(
				response,
				OIDC_STATE_COOKIE,
				stateCookieOptions(headers)
			);

		const signIn = Effect.fnUntraced(function* (
			headers: Headers.Headers,
			user: PublicUser,
			named: string | undefined,
			mode: Mode,
			status: number
		) {
			const chosen = cleanName(named, MAX_NAME);

			const { session, rawToken } = yield* store.createSession({
				userId: user.id,
				deviceName:
					chosen === ""
						? deviceNameFromUserAgent(headers["user-agent"])
						: chosen,
			});

			const response = respond(status, {
				user: userView(user),
				session: sessionView(session, session.id),
				token: mode === "bearer" ? rawToken : null,
			});

			return mode === "bearer"
				? response
				: sessionCookie(response, headers, rawToken);
		});

		const signedIn = Effect.fnUntraced(function* (headers: Headers.Headers) {
			const current = yield* sessions.authenticate(headers);

			if (Option.isNone(current)) {
				return yield* rejected(401, "Signed out");
			}

			return current.value;
		});

		const asAdmin = Effect.fnUntraced(function* (headers: Headers.Headers) {
			const current = yield* signedIn(headers);

			if (current.user.role !== "admin") {
				return yield* rejected(403, "Only an admin can do that");
			}

			return current;
		});

		const requireLocal = settings.localAuth
			? Effect.void
			: Effect.fail(
					rejected(403, "Password sign-in is turned off on this host")
				);

		const me = Effect.fnUntraced(function* (headers: Headers.Headers) {
			const current = yield* sessions.authenticate(headers);
			const users = yield* store.userCount;

			const kept = Option.filter(
				tokenFrom(headers),
				({ source }) => source === "cookie" && Option.isSome(current)
			);

			const response = respond(200, {
				user: Option.match(current, {
					onNone: () => null,
					onSome: ({ user }) => userView(user),
				}),
				session: Option.match(current, {
					onNone: () => null,
					onSome: ({ session }) => sessionView(session, session.id),
				}),
				setupRequired: users === 0 && settings.localAuth,
				localAuth: settings.localAuth,
				oidc: oidc.enabled ? { displayName: settings.displayName } : null,
			});

			return Option.match(kept, {
				onNone: () => response,
				onSome: ({ token }) => sessionCookie(response, headers, token),
			});
		});

		const setup = Effect.fnUntraced(function* (headers: Headers.Headers) {
			yield* requireLocal;

			const body = yield* bodyOf(Setup);
			const username = yield* usernameOf(body.username);
			const password = yield* passwordOf(body.password);

			if ((yield* store.userCount) > 0) {
				return yield* rejected(409, "Prosody is already set up");
			}

			const displayName = cleanName(body.displayName, MAX_NAME);

			const user = yield* store.createFirstAdmin({
				username,
				displayName: displayName === "" ? username : displayName,
				passwordHash: yield* hashPassword(password),
			});

			return yield* signIn(
				headers,
				user,
				body.deviceName,
				body.mode ?? "cookie",
				201
			);
		});

		const login = Effect.fnUntraced(function* (headers: Headers.Headers) {
			yield* requireLocal;

			const body = yield* bodyOf(Credentials);
			const username = body.username.trim().toLowerCase();

			if (
				!isValidUsername(username) ||
				body.password.length === 0 ||
				body.password.length > MAX_PASSWORD
			) {
				yield* dummyVerifyPassword(body.password.slice(0, MAX_PASSWORD));

				return yield* rejected(401, "Wrong username or password");
			}

			if (!(yield* admitAttempt(username))) {
				return yield* rejected(
					429,
					"Too many wrong passwords. Wait a few minutes and try again."
				);
			}

			const found = yield* store.findUserByUsername(username);

			const hash = Option.flatMap(found, (user) => user.passwordHash);

			const right = Option.isSome(hash)
				? yield* verifyPassword(body.password, hash.value)
				: yield* dummyVerifyPassword(body.password);

			if (!right || Option.isNone(found)) {
				return yield* rejected(401, "Wrong username or password");
			}

			yield* forgetAttempts(username);

			return yield* signIn(
				headers,
				found.value,
				body.deviceName,
				body.mode ?? "cookie",
				200
			);
		});

		const logout = Effect.fnUntraced(function* (headers: Headers.Headers) {
			const presented = tokenFrom(headers);

			if (Option.isSome(presented)) {
				yield* store.deleteSessionByToken(presented.value.token);
			}

			return expireSessionCookie(noContent, headers);
		});

		const oidcStart = Effect.fnUntraced(function* (
			headers: Headers.Headers,
			url: URL
		) {
			if (!oidc.enabled) {
				return yield* rejected(
					404,
					"Single sign-on is not set up on this host"
				);
			}

			const state = yield* randomToken(32);
			const nonce = yield* randomToken(32);
			const codeVerifier = yield* randomToken(48);
			const now = yield* Clock.currentTimeMillis;

			yield* store.saveOidcState({
				state,
				codeVerifier,
				nonce,
				redirectTo: safeRedirect(url.searchParams.get("redirect")),
				expiresAt: now + OIDC_STATE_LIFETIME,
			});

			const location = yield* oidc.authorizationUrl({
				redirectUri: `${originOf(headers, settings.publicUrl)}/auth/oidc/callback`,
				state,
				nonce,
				codeChallenge: sha256Base64Url(codeVerifier),
			});

			return HttpServerResponse.setCookieUnsafe(
				redirect(location),
				OIDC_STATE_COOKIE,
				state,
				{ ...stateCookieOptions(headers), maxAge: "10 minutes" }
			);
		});

		const oidcCallback = Effect.fnUntraced(function* (
			headers: Headers.Headers,
			url: URL
		) {
			const code = url.searchParams.get("code");
			const state = url.searchParams.get("state");
			const bound = parseCookies(headers.cookie).get(OIDC_STATE_COOKIE);

			if (
				!oidc.enabled ||
				code === null ||
				state === null ||
				bound === undefined ||
				!constantTimeEqual(bound, state)
			) {
				return yield* rejected(
					400,
					"This sign-in link is not one Prosody started"
				);
			}

			const record = yield* store.consumeOidcState(state);

			if (Option.isNone(record)) {
				return yield* rejected(400, "This sign-in has expired. Start again.");
			}

			const identity = yield* oidc.exchange({
				code,
				redirectUri: `${originOf(headers, settings.publicUrl)}/auth/oidc/callback`,
				codeVerifier: record.value.codeVerifier,
				nonce: record.value.nonce,
			});

			const user = yield* store.upsertOidcUser({
				...identity,
				adminGroup: settings.adminGroup,
			});

			const { rawToken } = yield* store.createSession({
				userId: user.id,
				deviceName: deviceNameFromUserAgent(headers["user-agent"]),
			});

			return expireStateCookie(
				sessionCookie(redirect(record.value.redirectTo), headers, rawToken),
				headers
			);
		});

		const listSessions = Effect.fnUntraced(function* (current: Authenticated) {
			const found = yield* store.listSessions(current.user.id);

			return respond(200, {
				sessions: found.map((session) =>
					sessionView(session, current.session.id)
				),
			});
		});

		const renameSession = Effect.fnUntraced(function* (current: Authenticated) {
			const body = yield* bodyOf(Rename);
			const deviceName = cleanName(body.deviceName, MAX_NAME);

			if (deviceName === "") {
				return yield* rejected(400, "A device needs a name");
			}

			yield* store.renameSession(
				current.user.id,
				current.session.id,
				deviceName
			);

			return respond(200, {
				session: sessionView(
					{ ...current.session, device: deviceName },
					current.session.id
				),
			});
		});

		const revokeSession = Effect.fnUntraced(function* (
			headers: Headers.Headers,
			current: Authenticated,
			id: string
		) {
			if (!(yield* store.deleteSession(current.user.id, id))) {
				return yield* rejected(404, "No such session");
			}

			return id === current.session.id
				? expireSessionCookie(noContent, headers)
				: noContent;
		});

		const createInvite = Effect.fnUntraced(function* (current: Authenticated) {
			const body = yield* bodyOf(InviteRequest);

			const { invite, rawToken } = yield* store.createInvite({
				createdBy: current.user.id,
				role: body.role ?? "reader",
				note: cleanName(body.note, MAX_NOTE),
			});

			return respond(201, {
				invite: inviteView(invite),
				token: rawToken,
				path: `/invite/${rawToken}`,
			});
		});

		const checkInvite = Effect.fnUntraced(function* (token: string) {
			const invite = yield* store.findValidInvite(token);

			if (Option.isNone(invite)) {
				return yield* rejected(404, "This invite is used, expired or unknown");
			}

			return respond(200, {
				invite: { role: invite.value.role, expiresAt: invite.value.expiresAt },
				localAuth: settings.localAuth,
			});
		});

		const register = Effect.fnUntraced(function* (headers: Headers.Headers) {
			yield* requireLocal;

			const body = yield* bodyOf(Register);
			const username = yield* usernameOf(body.username);
			const password = yield* passwordOf(body.password);

			if (Option.isNone(yield* store.findValidInvite(body.token))) {
				return yield* rejected(400, "This invite is used, expired or unknown");
			}

			const displayName = cleanName(body.displayName, MAX_NAME);

			const user = yield* store.registerWithInvite({
				inviteToken: body.token,
				username,
				displayName: displayName === "" ? username : displayName,
				passwordHash: yield* hashPassword(password),
			});

			return yield* signIn(
				headers,
				user,
				body.deviceName,
				body.mode ?? "cookie",
				201
			);
		});

		const readerIdOf = (id: string) =>
			Schema.is(ReaderId)(id)
				? Effect.succeed(ReaderId.make(id))
				: Effect.fail(rejected(404, "No such reader"));

		const changeRole = Effect.fnUntraced(function* (id: string) {
			const reader = yield* readerIdOf(id);
			const body = yield* bodyOf(RoleChange);
			const user = yield* store.updateUserRole(reader, body.role);

			return respond(200, { user: userView(user) });
		});

		const removeUser = Effect.fnUntraced(function* (
			current: Authenticated,
			id: string
		) {
			const reader = yield* readerIdOf(id);

			if (reader === current.user.id) {
				return yield* rejected(409, "You cannot remove yourself");
			}

			yield* store.deleteUser(reader);

			return noContent;
		});

		const listInvites = Effect.fnUntraced(function* (headers: Headers.Headers) {
			yield* asAdmin(headers);

			const invites = yield* store.listInvites;

			return respond(200, { invites: invites.map(inviteView) });
		});

		const removeInvite = Effect.fnUntraced(function* (
			headers: Headers.Headers,
			id: string
		) {
			yield* asAdmin(headers);

			if (!(yield* store.deleteInvite(id))) {
				return yield* rejected(404, "No such invite");
			}

			return noContent;
		});

		const listUsers = Effect.fnUntraced(function* (headers: Headers.Headers) {
			yield* asAdmin(headers);

			const users = yield* store.listUsers;

			return respond(200, { users: users.map(userView) });
		});

		const routes: ReadonlyArray<Route> = [
			["GET", ["me"], ({ headers }) => me(headers)],
			["POST", ["setup"], ({ headers }) => setup(headers)],
			["POST", ["login"], ({ headers }) => login(headers)],
			["POST", ["logout"], ({ headers }) => logout(headers)],
			["GET", ["oidc", "start"], ({ headers, url }) => oidcStart(headers, url)],
			[
				"GET",
				["oidc", "callback"],
				({ headers, url }) => oidcCallback(headers, url),
			],
			[
				"GET",
				["sessions"],
				({ headers }) => Effect.flatMap(signedIn(headers), listSessions),
			],
			[
				"PATCH",
				["session"],
				({ headers }) => Effect.flatMap(signedIn(headers), renameSession),
			],
			[
				"DELETE",
				["sessions", PARAMETER],
				({ headers, id }) =>
					Effect.flatMap(signedIn(headers), (current) =>
						revokeSession(headers, current, id)
					),
			],
			[
				"POST",
				["invites"],
				({ headers }) => Effect.flatMap(asAdmin(headers), createInvite),
			],
			["GET", ["invites"], ({ headers }) => listInvites(headers)],
			["GET", ["invites", PARAMETER], ({ id }) => checkInvite(id)],
			[
				"DELETE",
				["invites", PARAMETER],
				({ headers, id }) => removeInvite(headers, id),
			],
			["POST", ["register"], ({ headers }) => register(headers)],
			["GET", ["users"], ({ headers }) => listUsers(headers)],
			[
				"PATCH",
				["users", PARAMETER],
				({ headers, id }) => Effect.andThen(asAdmin(headers), changeRole(id)),
			],
			[
				"DELETE",
				["users", PARAMETER],
				({ headers, id }) =>
					Effect.flatMap(asAdmin(headers), (current) =>
						removeUser(current, id)
					),
			],
		];

		const guard = (headers: Headers.Headers, method: string) => {
			if (isEarlyData(method, headers)) {
				return Effect.fail(rejected(425, "Too early"));
			}

			if (!MUTATING.has(method)) {
				return Effect.void;
			}

			return Option.isNone(bearerOf(headers)) && isCrossSite(headers)
				? Effect.andThen(
						Effect.logInfo("refused", {
							origin: headers.origin ?? "another site",
						}),
						Effect.fail(
							rejected(403, "Prosody refuses requests from other sites")
						)
					)
				: Effect.void;
		};

		const route = Effect.fnUntraced(function* (
			request: HttpServerRequest.HttpServerRequest,
			url: URL
		) {
			yield* guard(request.headers, request.method);

			const segments = segmentsOf(url.pathname).slice(1);

			const found = routes.find(
				([method, pattern]) =>
					method === request.method && matches(pattern, segments)
			);

			if (found === undefined) {
				return yield* rejected(404, "Not Found");
			}

			return yield* found[2]({
				headers: request.headers,
				url,
				id: segments[1] ?? "",
			});
		});

		const failToLogin = (headers: Headers.Headers, url: URL) =>
			url.pathname.startsWith("/auth/oidc/")
				? Option.some(expireStateCookie(redirect("/login?error=sso"), headers))
				: Option.none();

		const replyTo = (
			headers: Headers.Headers,
			url: URL,
			refusal: RouteError
		): Effect.Effect<HttpServerResponse.HttpServerResponse> =>
			Match.valueTags(refusal, {
				Rejected: ({ status, reason }) =>
					Effect.succeed(
						Option.getOrElse(
							status === 400 ? failToLogin(headers, url) : Option.none(),
							() => respond(status, { error: reason })
						)
					),
				OidcFailed: ({ reason }) =>
					Effect.as(
						Effect.logWarning("single sign-on failed", { reason }),
						Option.getOrElse(failToLogin(headers, url), () =>
							respond(502, { error: reason })
						)
					),
				UsernameTaken: () =>
					Effect.succeed(respond(409, { error: "That username is taken" })),
				SetupAlreadyDone: () =>
					Effect.succeed(respond(409, { error: "Prosody is already set up" })),
				InvalidInvite: () =>
					Effect.succeed(
						respond(400, { error: "This invite is used, expired or unknown" })
					),
				LastAdmin: () =>
					Effect.succeed(
						respond(409, { error: "Prosody needs at least one admin" })
					),
				NotFound: () =>
					Effect.succeed(respond(404, { error: "No such reader" })),
				AuthStoreError: (error) =>
					Effect.as(
						Effect.logError("the sign-in store failed", { error }),
						respond(503, { error: "Sign-in is unavailable right now" })
					),
				CryptoFailed: (error) =>
					Effect.as(
						Effect.logError("a password could not be checked", { error }),
						respond(500, { error: "Sign-in is unavailable right now" })
					),
			});

		const fetch = Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const url = new URL(request.url, "http://localhost");

			return yield* route(request, url).pipe(
				Effect.catch((error: RouteError) =>
					replyTo(request.headers, url, error)
				)
			);
		}).pipe(Effect.withSpan("AuthRoutes.fetch"));

		return { fetch };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}
