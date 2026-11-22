import { assert, describe, it, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import {
	Headers,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";

import type { Attempts } from "../src/AuthRoutes.ts";
import {
	admit,
	ATTEMPT_WINDOW,
	ATTEMPTS_PER_USERNAME,
	AuthRoutes,
	deviceNameFromUserAgent,
	MAX_ATTEMPT_KEYS,
	isSecureRequest,
	originOf,
	safeRedirect,
} from "../src/AuthRoutes.ts";
import { AuthSettings } from "../src/AuthSettings.ts";
import {
	AuthStore,
	AuthStoreError,
	isValidUsername,
} from "../src/AuthStore.ts";
import { OidcClient } from "../src/Oidc.ts";
import { Sessions } from "../src/Session.ts";
import { FakeAuthStore } from "./FakeAuthStore.ts";

const HOST = "prosody.example.com";

const PASSWORD = "a long enough password";

const nowhere = HttpClient.make((request) =>
	Effect.succeed(
		HttpClientResponse.fromWeb(request, new Response("", { status: 404 }))
	)
);

const PickyStore = Layer.effect(
	AuthStore,
	Effect.gen(function* () {
		const store = yield* AuthStore;

		return {
			...store,
			findUserByUsername: (username: string) =>
				isValidUsername(username)
					? store.findUserByUsername(username)
					: Effect.fail(
							new AuthStoreError({ reason: "the store cannot keep this name" })
						),
		};
	})
).pipe(Layer.provide(FakeAuthStore));

const routesWith = (settings: Readonly<Record<string, string>> = {}) =>
	AuthRoutes.layer.pipe(
		Layer.provideMerge(Sessions.layer),
		Layer.provideMerge(PickyStore),
		Layer.provideMerge(OidcClient.layer),
		Layer.provideMerge(AuthSettings.layer),
		Layer.provideMerge(SecureRandom.layerWebCrypto),
		Layer.provide(Layer.succeed(HttpClient.HttpClient, nowhere)),
		Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(settings)))
	);

const fresh = (settings: Readonly<Record<string, string>> = {}) =>
	layer(routesWith(settings), { buildPerTest: true });

const UserView = Schema.Struct({
	id: Schema.String,
	username: Schema.String,
	displayName: Schema.String,
	role: Schema.String,
	createdAt: Schema.Finite,
});

const SessionView = Schema.Struct({
	id: Schema.String,
	deviceName: Schema.String,
	createdAt: Schema.Finite,
	lastSeenAt: Schema.Finite,
	expiresAt: Schema.Finite,
	current: Schema.Boolean,
});

const InviteView = Schema.Struct({
	id: Schema.String,
	role: Schema.String,
	note: Schema.String,
	createdBy: Schema.String,
	createdAt: Schema.Finite,
	expiresAt: Schema.Finite,
});

const Me = Schema.Struct({
	user: Schema.NullOr(UserView),
	session: Schema.NullOr(SessionView),
	setupRequired: Schema.Boolean,
	localAuth: Schema.Boolean,
	oidc: Schema.NullOr(Schema.Struct({ displayName: Schema.String })),
});

const SignedIn = Schema.Struct({
	user: UserView,
	session: SessionView,
	token: Schema.NullOr(Schema.String),
});

const InviteMade = Schema.Struct({
	invite: InviteView,
	token: Schema.String,
	path: Schema.String,
});

const InviteChecked = Schema.Struct({
	invite: Schema.Struct({ role: Schema.String, expiresAt: Schema.Finite }),
	localAuth: Schema.Boolean,
});

const Invites = Schema.Struct({ invites: Schema.Array(InviteView) });

const SessionList = Schema.Struct({ sessions: Schema.Array(SessionView) });

const Renamed = Schema.Struct({ session: SessionView });

const UserList = Schema.Struct({ users: Schema.Array(UserView) });

const Changed = Schema.Struct({ user: UserView });

interface Answer {
	readonly status: number;
	readonly text: string;
	readonly cookies: ReadonlyArray<string>;
}

const call = (
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
	path: string,
	options: {
		readonly body?: Schema.Json;
		readonly headers?: Readonly<Record<string, string>>;
	} = {}
) =>
	Effect.gen(function* () {
		const routes = yield* AuthRoutes;

		const base = HttpClientRequest.make(method)(`http://${HOST}${path}`).pipe(
			HttpClientRequest.setHeaders({ host: HOST, ...options.headers })
		);

		const request =
			options.body === undefined
				? base
				: HttpClientRequest.bodyJsonUnsafe(base, options.body);

		const response = HttpServerResponse.toWeb(
			yield* routes.fetch.pipe(
				Effect.provideService(
					HttpServerRequest.HttpServerRequest,
					HttpServerRequest.fromClientRequest(request)
				)
			)
		);

		assert.strictEqual(response.headers.get("cache-control"), "no-store");

		const answer: Answer = {
			status: response.status,
			text: yield* Effect.promise(async () => await response.text()),
			cookies: response.headers.getSetCookie(),
		};

		return answer;
	});

const read = <S extends Schema.Constraint>(answer: Answer, schema: S) =>
	Schema.decodeEffect(Schema.fromJsonString(schema))(answer.text).pipe(
		Effect.orDie
	);

const sessionOf = (answer: Answer): string =>
	answer.cookies
		.map((cookie) => cookie.split(";")[0] ?? "")
		.find((cookie) => cookie.startsWith("prosody_session="))
		?.slice("prosody_session=".length) ?? "";

const as = (token: string) => ({ cookie: `prosody_session=${token}` });

const setUp = Effect.gen(function* () {
	const answer = yield* call("POST", "/auth/setup", {
		body: { username: "Ada", password: PASSWORD, displayName: "Ada Lovelace" },
	});

	assert.strictEqual(answer.status, 201);

	return sessionOf(answer);
});

const invited = (admin: string, username: string) =>
	Effect.gen(function* () {
		const made = yield* read(
			yield* call("POST", "/auth/invites", {
				headers: as(admin),
				body: { note: `for ${username}` },
			}),
			InviteMade
		);

		const joined = yield* call("POST", "/auth/register", {
			body: { token: made.token, username, password: PASSWORD },
		});

		assert.strictEqual(joined.status, 201);

		return {
			token: sessionOf(joined),
			id: (yield* read(joined, SignedIn)).user.id,
		};
	});

fresh()("setting Prosody up", (test) => {
	test.effect(
		"asks for setup once, makes the first admin, and signs them in",
		() =>
			Effect.gen(function* () {
				const before = yield* read(yield* call("GET", "/auth/me"), Me);

				assert.deepStrictEqual(before, {
					user: null,
					session: null,
					setupRequired: true,
					localAuth: true,
					oidc: null,
				});

				const answer = yield* call("POST", "/auth/setup", {
					body: {
						username: "Ada",
						password: PASSWORD,
						displayName: "Ada Lovelace",
					},
					headers: {
						"user-agent":
							"Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
					},
				});

				const made = yield* read(answer, SignedIn);

				assert.strictEqual(answer.status, 201);
				assert.deepStrictEqual(
					[made.user.username, made.user.displayName, made.user.role],
					["ada", "Ada Lovelace", "admin"]
				);
				assert.isNull(made.token);
				assert.match(answer.cookies[0] ?? "", /HttpOnly/u);
				assert.match(answer.cookies[0] ?? "", /SameSite=Lax/u);
				assert.notMatch(answer.cookies[0] ?? "", /Secure/u);

				const asked = yield* call("GET", "/auth/me", {
					headers: as(sessionOf(answer)),
				});

				const me = yield* read(asked, Me);

				assert.strictEqual(sessionOf(asked), sessionOf(answer));

				assert.strictEqual(me.user?.username, "ada");
				assert.strictEqual(me.session?.deviceName, "Firefox on Linux");
				assert.isTrue(me.session?.current);
				assert.isFalse(me.setupRequired);

				const again = yield* call("POST", "/auth/setup", {
					body: { username: "eve", password: PASSWORD },
				});

				assert.strictEqual(again.status, 409);
			})
	);

	test.effect("refuses a username or password Prosody cannot keep", () =>
		Effect.gen(function* () {
			const badName = yield* call("POST", "/auth/setup", {
				body: { username: "-ada", password: PASSWORD },
			});

			const short = yield* call("POST", "/auth/setup", {
				body: { username: "ada", password: "short" },
			});

			const garbled = yield* call("POST", "/auth/setup", {
				body: { name: 1 },
			});

			assert.deepStrictEqual(
				[badName.status, short.status, garbled.status],
				[400, 400, 400]
			);
		})
	);
});

fresh()("signing in with a password", (test) => {
	test.effect("gives a browser a cookie and an app a bearer token", () =>
		Effect.gen(function* () {
			yield* setUp;

			const browser = yield* call("POST", "/auth/login", {
				body: { username: "ADA ", password: PASSWORD },
			});

			assert.strictEqual(browser.status, 200);
			assert.notStrictEqual(sessionOf(browser), "");

			const app = yield* call("POST", "/auth/login", {
				body: {
					username: "ada",
					password: PASSWORD,
					mode: "bearer",
					deviceName: "Prosody on iPhone",
				},
			});

			const signedIn = yield* read(app, SignedIn);

			assert.deepStrictEqual(app.cookies, []);
			assert.strictEqual(signedIn.session.deviceName, "Prosody on iPhone");

			const me = yield* read(
				yield* call("GET", "/auth/me", {
					headers: { authorization: `Bearer ${signedIn.token ?? ""}` },
				}),
				Me
			);

			assert.strictEqual(me.user?.username, "ada");
		})
	);

	test.effect("refuses a wrong password, and then a run of them", () =>
		Effect.gen(function* () {
			yield* setUp;

			const wrong = yield* call("POST", "/auth/login", {
				body: { username: "ada", password: "not the password" },
			});

			const nobody = yield* call("POST", "/auth/login", {
				body: { username: "nobody", password: PASSWORD },
			});

			assert.deepStrictEqual([wrong.status, nobody.status], [401, 401]);

			for (let attempt = 0; attempt < 9; attempt += 1) {
				yield* call("POST", "/auth/login", {
					body: { username: "ada", password: "still not it" },
				});
			}

			const blocked = yield* call("POST", "/auth/login", {
				body: { username: "ada", password: PASSWORD },
			});

			assert.strictEqual(blocked.status, 429);
		})
	);

	test.effect("weighs at most ten of a burst of wrong passwords", () =>
		Effect.gen(function* () {
			yield* setUp;

			const burst = yield* Effect.all(
				Array.from({ length: 20 }, () =>
					call("POST", "/auth/login", {
						body: { username: "ada", password: "not the password" },
					})
				),
				{ concurrency: "unbounded" }
			);

			const statuses = burst.map(({ status }) => status);

			assert.strictEqual(
				statuses.filter((status) => status === 401).length,
				ATTEMPTS_PER_USERNAME
			);
			assert.strictEqual(
				statuses.filter((status) => status === 429).length,
				20 - ATTEMPTS_PER_USERNAME
			);
		})
	);

	test.effect("forgets the wrong passwords once the right one is given", () =>
		Effect.gen(function* () {
			yield* setUp;

			for (let attempt = 0; attempt < ATTEMPTS_PER_USERNAME - 1; attempt += 1) {
				yield* call("POST", "/auth/login", {
					body: { username: "ada", password: "not the password" },
				});
			}

			const right = yield* call("POST", "/auth/login", {
				body: { username: "ada", password: PASSWORD },
			});

			const wrongAgain = yield* call("POST", "/auth/login", {
				body: { username: "ada", password: "not the password" },
			});

			assert.deepStrictEqual([right.status, wrongAgain.status], [200, 401]);
		})
	);

	test.effect(
		"refuses a name Prosody could never have given without asking the store",
		() =>
			Effect.gen(function* () {
				yield* setUp;

				const names = ["a".repeat(100_000), "ada\u0000", "-ada", ""];

				const answers = yield* Effect.forEach(
					names,
					(username) =>
						call("POST", "/auth/login", {
							body: { username, password: PASSWORD },
						}),
					{ concurrency: 1 }
				);

				const huge = yield* call("POST", "/auth/login", {
					body: { username: "ada", password: "x".repeat(2000) },
				});

				const empty = yield* call("POST", "/auth/login", {
					body: { username: "ada", password: "" },
				});

				assert.deepStrictEqual(
					[...answers, huge, empty].map(({ status }) => status),
					[401, 401, 401, 401, 401, 401]
				);

				for (let attempt = 0; attempt < ATTEMPTS_PER_USERNAME; attempt += 1) {
					yield* call("POST", "/auth/login", {
						body: { username: "ada\u0000", password: "not the password" },
					});
				}

				const ada = yield* call("POST", "/auth/login", {
					body: { username: "ada", password: PASSWORD },
				});

				assert.strictEqual(ada.status, 200);
			})
	);

	test.effect("ends the session on sign-out", () =>
		Effect.gen(function* () {
			const token = yield* setUp;
			const out = yield* call("POST", "/auth/logout", { headers: as(token) });

			assert.strictEqual(out.status, 204);
			assert.match(out.cookies[0] ?? "", /^prosody_session=;/u);

			const me = yield* read(
				yield* call("GET", "/auth/me", { headers: as(token) }),
				Me
			);

			assert.isNull(me.user);

			const sessions = yield* call("GET", "/auth/sessions", {
				headers: as(token),
			});

			assert.strictEqual(sessions.status, 401);
		})
	);
});

fresh({ PROSODY_LOCAL_AUTH: "false" })("a host without passwords", (test) => {
	test.effect("refuses setup and password sign-in", () =>
		Effect.gen(function* () {
			const setup = yield* call("POST", "/auth/setup", {
				body: { username: "ada", password: PASSWORD },
			});

			const login = yield* call("POST", "/auth/login", {
				body: { username: "ada", password: PASSWORD },
			});

			const me = yield* read(yield* call("GET", "/auth/me"), Me);

			const register = yield* call("POST", "/auth/register", {
				body: { token: "any", username: "ada", password: PASSWORD },
			});

			assert.deepStrictEqual(
				[setup.status, login.status, register.status],
				[403, 403, 403]
			);
			assert.deepStrictEqual([me.setupRequired, me.localAuth], [false, false]);
		})
	);
});

fresh()("an invite", (test) => {
	test.effect(
		"is made by an admin, read by anyone, and used once to join as a reader",
		() =>
			Effect.gen(function* () {
				const admin = yield* setUp;

				const answer = yield* call("POST", "/auth/invites", {
					headers: as(admin),
					body: { note: "for Bea" },
				});

				const made = yield* read(answer, InviteMade);

				assert.strictEqual(answer.status, 201);
				assert.strictEqual(made.path, `/invite/${made.token}`);
				assert.deepStrictEqual(
					[made.invite.role, made.invite.note],
					["reader", "for Bea"]
				);

				const listed = yield* read(
					yield* call("GET", "/auth/invites", { headers: as(admin) }),
					Invites
				);

				assert.lengthOf(listed.invites, 1);

				const checked = yield* read(
					yield* call("GET", `/auth/invites/${made.token}`),
					InviteChecked
				);

				assert.strictEqual(checked.invite.role, "reader");

				const joined = yield* call("POST", "/auth/register", {
					body: {
						token: made.token,
						username: "bea",
						password: PASSWORD,
						displayName: "Bea",
					},
				});

				const bea = yield* read(joined, SignedIn);

				assert.strictEqual(joined.status, 201);
				assert.deepStrictEqual(
					[bea.user.username, bea.user.role],
					["bea", "reader"]
				);

				const reused = yield* call("POST", "/auth/register", {
					body: { token: made.token, username: "cy", password: PASSWORD },
				});

				assert.strictEqual(reused.status, 400);
				assert.strictEqual(
					(yield* call("GET", `/auth/invites/${made.token}`)).status,
					404
				);

				const asReader = yield* call("POST", "/auth/invites", {
					headers: as(sessionOf(joined)),
					body: {},
				});

				assert.strictEqual(asReader.status, 403);
			})
	);

	test.effect("can be withdrawn by an admin before it is used", () =>
		Effect.gen(function* () {
			const admin = yield* setUp;

			const made = yield* read(
				yield* call("POST", "/auth/invites", {
					headers: as(admin),
					body: { role: "admin" },
				}),
				InviteMade
			);

			const removed = yield* call("DELETE", `/auth/invites/${made.invite.id}`, {
				headers: as(admin),
			});

			assert.strictEqual(made.invite.role, "admin");
			assert.strictEqual(removed.status, 204);
			assert.strictEqual(
				(yield* call("DELETE", `/auth/invites/${made.invite.id}`, {
					headers: as(admin),
				})).status,
				404
			);
		})
	);
});

fresh()("a reader's sessions", (test) => {
	test.effect(
		"are listed, renamed and revoked, but only the reader's own",
		() =>
			Effect.gen(function* () {
				const admin = yield* setUp;

				const other = yield* read(
					yield* call("POST", "/auth/login", {
						body: { username: "ada", password: PASSWORD, mode: "bearer" },
					}),
					SignedIn
				);

				const listed = yield* read(
					yield* call("GET", "/auth/sessions", { headers: as(admin) }),
					SessionList
				);

				assert.lengthOf(listed.sessions, 2);
				assert.lengthOf(
					listed.sessions.filter((session) => session.current),
					1
				);

				const renamed = yield* read(
					yield* call("PATCH", "/auth/session", {
						headers: as(admin),
						body: { deviceName: "  Kitchen   iPad " },
					}),
					Renamed
				);

				assert.strictEqual(renamed.session.deviceName, "Kitchen iPad");

				const bea = yield* invited(admin, "bea");

				const notHers = yield* call(
					"DELETE",
					`/auth/sessions/${other.session.id}`,
					{ headers: as(bea.token) }
				);

				assert.strictEqual(notHers.status, 404);

				const revoked = yield* call(
					"DELETE",
					`/auth/sessions/${other.session.id}`,
					{ headers: as(admin) }
				);

				assert.strictEqual(revoked.status, 204);

				const gone = yield* read(
					yield* call("GET", "/auth/me", {
						headers: { authorization: `Bearer ${other.token ?? ""}` },
					}),
					Me
				);

				assert.isNull(gone.user);
			})
	);
});

fresh()("managing readers", (test) => {
	test.effect("is for admins, and never leaves Prosody without one", () =>
		Effect.gen(function* () {
			const admin = yield* setUp;
			const bea = yield* invited(admin, "bea");

			const me = yield* read(
				yield* call("GET", "/auth/me", { headers: as(admin) }),
				Me
			);

			const adminId = me.user?.id ?? "";

			const refused = yield* Effect.all(
				[
					call("GET", "/auth/users", { headers: as(bea.token) }),
					call("PATCH", `/auth/users/${adminId}`, {
						headers: as(bea.token),
						body: { role: "reader" },
					}),
				],
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(
				refused.map(({ status }) => status),
				[403, 403]
			);

			const users = yield* read(
				yield* call("GET", "/auth/users", { headers: as(admin) }),
				UserList
			);

			assert.deepStrictEqual(
				users.users.map(({ username }) => username),
				["ada", "bea"]
			);

			const kept = yield* Effect.all(
				[
					call("PATCH", `/auth/users/${adminId}`, {
						headers: as(admin),
						body: { role: "reader" },
					}),
					call("DELETE", `/auth/users/${adminId}`, { headers: as(admin) }),
					call("DELETE", "/auth/users/u-000000000999", {
						headers: as(admin),
					}),
				],
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(
				kept.map(({ status }) => status),
				[409, 409, 404]
			);

			const promoted = yield* read(
				yield* call("PATCH", `/auth/users/${bea.id}`, {
					headers: as(admin),
					body: { role: "admin" },
				}),
				Changed
			);

			assert.strictEqual(promoted.user.role, "admin");

			const removed = yield* call("DELETE", `/auth/users/${bea.id}`, {
				headers: as(admin),
			});

			assert.strictEqual(removed.status, 204);
		})
	);
});

fresh()("a change asked by another site's page", (test) => {
	test.effect("is refused unless it carries a bearer token", () =>
		Effect.gen(function* () {
			const admin = yield* setUp;
			const evil = { origin: "https://evil.example" };

			const refused = yield* Effect.all(
				[
					call("POST", "/auth/login", {
						headers: evil,
						body: { username: "ada", password: PASSWORD },
					}),
					call("POST", "/auth/invites", {
						headers: { ...evil, ...as(admin) },
						body: {},
					}),
					call("POST", "/auth/logout", { headers: { ...evil, ...as(admin) } }),
					call("PATCH", "/auth/session", {
						headers: { "sec-fetch-site": "same-site", ...as(admin) },
						body: { deviceName: "x" },
					}),
				],
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(
				refused.map(({ status }) => status),
				[403, 403, 403, 403]
			);

			const app = yield* read(
				yield* call("POST", "/auth/login", {
					body: { username: "ada", password: PASSWORD, mode: "bearer" },
				}),
				SignedIn
			);

			const fromApp = yield* call("PATCH", "/auth/session", {
				headers: { ...evil, authorization: `Bearer ${app.token ?? ""}` },
				body: { deviceName: "Prosody on iPad" },
			});

			const sameSite = yield* call("PATCH", "/auth/session", {
				headers: { origin: `https://${HOST}`, ...as(admin) },
				body: { deviceName: "Desk" },
			});

			assert.deepStrictEqual([fromApp.status, sameSite.status], [200, 200]);
		})
	);
});

fresh()("a change sent as early data", (test) => {
	test.effect("is refused until the handshake is done", () =>
		Effect.gen(function* () {
			const admin = yield* setUp;
			const early = { "early-data": "1" };

			const refused = yield* Effect.all(
				[
					call("POST", "/auth/login", {
						headers: early,
						body: { username: "ada", password: PASSWORD },
					}),
					call("PATCH", "/auth/session", {
						headers: { ...early, ...as(admin) },
						body: { deviceName: "x" },
					}),
					call("DELETE", "/auth/sessions/s-000000000000", {
						headers: { ...early, ...as(admin) },
					}),
					call("PUT", "/auth/nowhere", { headers: early }),
				],
				{ concurrency: 1 }
			);

			assert.deepStrictEqual(
				refused.map(({ status }) => status),
				[425, 425, 425, 425]
			);

			const reading = yield* call("GET", "/auth/me", {
				headers: { ...early, ...as(admin) },
			});

			assert.strictEqual(reading.status, 200);
		})
	);
});

const secureCookieOf = (headers: Readonly<Record<string, string>>) =>
	Effect.gen(function* () {
		const answer = yield* call("POST", "/auth/setup", {
			headers,
			body: { username: "ada", password: PASSWORD },
		});

		assert.strictEqual(answer.status, 201);

		return /;\s*Secure/iu.test(answer.cookies[0] ?? "");
	});

fresh()("a session cookie over plain HTTP", (test) => {
	test.effect("is not marked Secure", () =>
		Effect.map(secureCookieOf({}), (secure) => {
			assert.isFalse(secure);
		})
	);
});

fresh()("a session cookie behind an HTTPS proxy", (test) => {
	test.effect("is marked Secure when the proxy says the scheme was HTTPS", () =>
		Effect.map(secureCookieOf({ "x-forwarded-proto": "https" }), (secure) => {
			assert.isTrue(secure);
		})
	);
});

fresh({ PROSODY_PUBLIC_URL: `https://${HOST}` })(
	"a session cookie on an HTTPS public address",
	(test) => {
		test.effect("is marked Secure", () =>
			Effect.map(secureCookieOf({}), (secure) => {
				assert.isTrue(secure);
			})
		);
	}
);

describe("the count of attempts for a username", () => {
	const empty: ReadonlyMap<string, Attempts> = new Map();

	it("admits ten attempts in a window and refuses the eleventh", () => {
		let seen = empty;

		for (let count = 0; count < ATTEMPTS_PER_USERNAME; count += 1) {
			const [admitted, next] = admit(seen, "ada", 1000);

			assert.isTrue(admitted);
			seen = next;
		}

		assert.isFalse(admit(seen, "ada", 1000)[0]);
		assert.isTrue(admit(seen, "bea", 1000)[0]);
		assert.isTrue(admit(seen, "ada", 1000 + ATTEMPT_WINDOW)[0]);
	});

	it("drops expired names and never keeps more than its limit", () => {
		const full = new Map(
			Array.from(
				{ length: MAX_ATTEMPT_KEYS },
				(_, index): readonly [string, Attempts] => [
					`reader-${index}`,
					{ count: 1, since: 1000 + index },
				]
			)
		);

		const [admitted, next] = admit(full, "newcomer", 2000);

		assert.isTrue(admitted);
		assert.strictEqual(next.size, MAX_ATTEMPT_KEYS);
		assert.isFalse(next.has("reader-0"));
		assert.isTrue(next.has("reader-1"));
		assert.isTrue(next.has("newcomer"));

		const [, later] = admit(
			next,
			"newcomer",
			1000 + MAX_ATTEMPT_KEYS + ATTEMPT_WINDOW
		);

		assert.deepStrictEqual([...later.keys()], ["newcomer"]);
	});
});

describe("a device's default name", () => {
	it("names the browser and the platform", () => {
		assert.strictEqual(
			deviceNameFromUserAgent(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
			),
			"Safari on iPhone"
		);
		assert.strictEqual(
			deviceNameFromUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
			),
			"Safari on Mac"
		);
		assert.strictEqual(
			deviceNameFromUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
			),
			"Chrome on Mac"
		);
		assert.strictEqual(
			deviceNameFromUserAgent(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0"
			),
			"Edge on Windows"
		);
		assert.strictEqual(
			deviceNameFromUserAgent(
				"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"
			),
			"Chrome on Android"
		);
		assert.strictEqual(deviceNameFromUserAgent("curl/8.9.1"), "Browser");
		assert.strictEqual(deviceNameFromUserAgent(), "Browser");
	});
});

describe("where a sign-in is sent and how its cookie is kept", () => {
	it("trusts the public address, then the forwarded scheme", () => {
		const forwarded = Headers.fromInput({
			host: HOST,
			"x-forwarded-proto": "https",
		});

		const plain = Headers.fromInput({ host: "127.0.0.1:3057" });

		assert.isTrue(isSecureRequest(plain, "https://prosody.example.com"));
		assert.isTrue(isSecureRequest(forwarded, ""));
		assert.isFalse(isSecureRequest(plain, ""));
		assert.strictEqual(originOf(forwarded, ""), `https://${HOST}`);
		assert.strictEqual(originOf(plain, ""), "http://127.0.0.1:3057");
		assert.strictEqual(
			originOf(plain, "https://prosody.example.com"),
			"https://prosody.example.com"
		);
	});

	it("comes back only to a path on Prosody itself", () => {
		assert.strictEqual(
			safeRedirect("/read/w-1c7eeddd853b"),
			"/read/w-1c7eeddd853b"
		);
		assert.strictEqual(safeRedirect("//evil.example"), "/");
		assert.strictEqual(safeRedirect("https://evil.example"), "/");
		assert.strictEqual(safeRedirect("/\\evil.example"), "/");
		assert.strictEqual(safeRedirect(null), "/");
	});
});
