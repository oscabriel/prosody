import type { webcrypto } from "node:crypto";

import { assert, describe, it, layer } from "@effect/vitest";
import { ConfigProvider, Context, Effect, Layer, Option, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
	HttpServerRequest,
	HttpServerResponse,
} from "effect/http";
import { TestClock } from "effect/testing";

import { AuthRoutes } from "../src/AuthRoutes.ts";
import { AuthSettings } from "../src/AuthSettings.ts";
import { sha256Base64Url } from "../src/Crypto.ts";
import {
	backchannelOf,
	checkClaims,
	identityOf,
	OidcClient,
} from "../src/Oidc.ts";
import { Sessions } from "../src/Session.ts";
import { FakeAuthStore } from "./FakeAuthStore.ts";

const ISSUER = "https://id.example.com";

const PROSODY = "https://prosody.example.com";

const INTERNAL = "http://idp.internal:9000";

interface Signer {
	readonly alg: string;
	readonly kid: string;
	readonly privateKey: webcrypto.CryptoKey;
	readonly publicJwk: webcrypto.JsonWebKey;
	readonly params: webcrypto.AlgorithmIdentifier | webcrypto.EcdsaParams;
}

interface TestClaims {
	readonly iss?: string;
	readonly sub?: string;
	readonly aud?: string | ReadonlyArray<string>;
	readonly exp?: number;
	readonly nbf?: number;
	readonly iat?: number;
	readonly nonce?: string;
	readonly azp?: string;
	readonly name?: string;
	readonly preferred_username?: string;
	readonly email?: string;
	readonly groups?: ReadonlyArray<string>;
}

interface JwtHeader {
	readonly alg: string;
	readonly kid?: string;
	readonly typ?: string;
}

interface PublishedKey extends webcrypto.JsonWebKey {
	readonly kid: string;
}

interface UserInfoReply {
	readonly sub: string;
	readonly name?: string;
	readonly groups?: ReadonlyArray<string>;
}

type ReplyBody =
	| Schema.Json
	| UserInfoReply
	| { readonly keys: ReadonlyArray<PublishedKey> };

const rsaSigner = async (kid: string): Promise<Signer> => {
	const pair = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"]
	);

	return {
		alg: "RS256",
		kid,
		privateKey: pair.privateKey,
		publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
		params: { name: "RSASSA-PKCS1-v1_5" },
	};
};

const ecSigner = async (kid: string): Promise<Signer> => {
	const pair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"]
	);

	return {
		alg: "ES256",
		kid,
		privateKey: pair.privateKey,
		publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
		params: { name: "ECDSA", hash: "SHA-256" },
	};
};

const part = (value: TestClaims | JwtHeader) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

const sign = async (signer: Signer, claims: TestClaims, alg = signer.alg) => {
	const input = `${part({ alg, kid: signer.kid, typ: "JWT" })}.${part(claims)}`;

	const signature = await crypto.subtle.sign(
		signer.params,
		signer.privateKey,
		new TextEncoder().encode(input)
	);

	return `${input}.${Buffer.from(signature).toString("base64url")}`;
};

const claimsFor = (change: TestClaims = {}) => ({
	iss: ISSUER,
	sub: "ada-1",
	aud: "prosody",
	exp: 600,
	iat: 0,
	nonce: "nonce-1",
	name: "Ada Lovelace",
	preferred_username: "ada",
	email: "ada@example.com",
	groups: ["readers"],
	...change,
});

const publish = (signer: Signer): PublishedKey => ({
	...signer.publicJwk,
	kid: signer.kid,
	alg: signer.alg,
	use: "sig",
});

interface IdpState {
	readonly rsa: Signer;
	readonly ec: Signer;
	keys: ReadonlyArray<PublishedKey>;
	idToken: string;
	userInfo: Option.Option<UserInfoReply>;
	challenge: Option.Option<string>;
	readonly seen: Array<string>;
	readonly tokenAsks: Array<{
		readonly authorization: string | undefined;
		readonly body: URLSearchParams;
	}>;
}

class Idp extends Context.Service<Idp, IdpState>()("test/Idp") {}

const IdpLive = Layer.effect(
	Idp,
	Effect.promise(async () => {
		const rsa = await rsaSigner("rsa-1");
		const ec = await ecSigner("ec-1");

		return {
			rsa,
			ec,
			keys: [publish(rsa), publish(ec)],
			idToken: "",
			userInfo: Option.none(),
			challenge: Option.none(),
			seen: [],
			tokenAsks: [],
		};
	})
);

const reply = (
	request: HttpClientRequest.HttpClientRequest,
	status: number,
	body: ReplyBody
) => HttpClientResponse.fromWeb(request, Response.json(body, { status }));

const answerToken = (
	idp: IdpState,
	request: HttpClientRequest.HttpClientRequest
) =>
	Effect.gen(function* () {
		const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie);
		const text = yield* Effect.promise(async () => await web.text());
		const body = new URLSearchParams(text);

		idp.tokenAsks.push({ authorization: request.headers.authorization, body });

		const pkce = Option.match(idp.challenge, {
			onNone: () => true,
			onSome: (challenge) =>
				sha256Base64Url(body.get("code_verifier") ?? "") === challenge,
		});

		return pkce
			? reply(request, 200, {
					id_token: idp.idToken,
					access_token: "access-1",
					token_type: "Bearer",
				})
			: reply(request, 400, { error: "invalid_grant" });
	});

const answerUserInfo = (
	idp: IdpState,
	request: HttpClientRequest.HttpClientRequest
) =>
	request.headers.authorization === "Bearer access-1"
		? Option.match(idp.userInfo, {
				onNone: () => reply(request, 404, {}),
				onSome: (info) => reply(request, 200, info),
			})
		: reply(request, 401, {});

const IdpClient = Layer.effect(
	HttpClient.HttpClient,
	Effect.gen(function* () {
		const idp = yield* Idp;

		return HttpClient.make((request, url) => {
			idp.seen.push(url.href);

			if (url.pathname === "/.well-known/openid-configuration") {
				return Effect.succeed(
					reply(request, 200, {
						issuer: ISSUER,
						authorization_endpoint: `${ISSUER}/authorize`,
						token_endpoint: `${ISSUER}/token`,
						jwks_uri: `${ISSUER}/jwks`,
						userinfo_endpoint: `${ISSUER}/userinfo`,
					})
				);
			}

			if (url.pathname === "/jwks") {
				return Effect.succeed(reply(request, 200, { keys: idp.keys }));
			}

			if (url.pathname === "/token") {
				return answerToken(idp, request);
			}

			return Effect.succeed(
				url.pathname === "/userinfo"
					? answerUserInfo(idp, request)
					: reply(request, 404, {})
			);
		});
	})
);

const settingsWith = (extra: Readonly<Record<string, string>>) =>
	AuthSettings.layer.pipe(
		Layer.provide(
			ConfigProvider.layer(
				ConfigProvider.fromUnknown({
					PROSODY_PUBLIC_URL: PROSODY,
					OIDC_ISSUER_URL: `${ISSUER}/`,
					OIDC_CLIENT_ID: "prosody",
					OIDC_CLIENT_SECRET: "s3cret",
					...extra,
				})
			)
		)
	);

const oidcWith = (extra: Readonly<Record<string, string>> = {}) =>
	OidcClient.layer.pipe(
		Layer.provideMerge(settingsWith(extra)),
		Layer.provideMerge(IdpClient),
		Layer.provideMerge(IdpLive)
	);

const exchange = Effect.gen(function* () {
	const oidc = yield* OidcClient;

	return yield* oidc.exchange({
		code: "code-1",
		redirectUri: `${PROSODY}/auth/oidc/callback`,
		codeVerifier: "verifier",
		nonce: "nonce-1",
	});
});

const refusal = Effect.map(Effect.flip(exchange), ({ reason }) => reason);

const issue = (signer: Signer, change: TestClaims = {}, alg = signer.alg) =>
	Effect.gen(function* () {
		const idp = yield* Idp;

		idp.idToken = yield* Effect.promise(
			async () => await sign(signer, claimsFor(change), alg)
		);
	});

describe("an identity token's claims", () => {
	const expected = {
		issuer: ISSUER,
		clientId: "prosody",
		nonce: "nonce-1",
		now: 100,
	};

	const refused = (change: TestClaims) =>
		Option.isSome(checkClaims(claimsFor(change), expected));

	it("are accepted from this issuer, for this client, in time, with this nonce", () => {
		assert.isFalse(refused({}));
		assert.isFalse(refused({ iss: `${ISSUER}/`, aud: ["prosody"] }));
		assert.isFalse(refused({ exp: 50 }));
		assert.isFalse(refused({ nbf: 150 }));
	});

	it("are refused from another issuer, for another client, or for another party", () => {
		assert.isTrue(refused({ iss: "https://evil.example" }));
		assert.isTrue(refused({ aud: "someone-else" }));
		assert.isTrue(refused({ aud: ["prosody", "other"], azp: "other" }));
		assert.isTrue(refused({ aud: ["prosody", "other"] }));
		assert.isTrue(refused({ azp: "other" }));
	});

	it("are accepted when the authorized party is this client", () => {
		assert.isFalse(refused({ azp: "prosody" }));
		assert.isFalse(refused({ aud: ["prosody", "other"], azp: "prosody" }));
	});

	it("are refused once expired or before they are valid, allowing a minute's skew", () => {
		assert.isTrue(refused({ exp: 30 }));
		assert.isTrue(refused({ nbf: 200 }));
	});

	it("are refused without this sign-in's nonce or a subject", () => {
		const { nonce: _, ...noNonce } = claimsFor();

		assert.isTrue(refused({ nonce: "other" }));
		assert.isTrue(Option.isSome(checkClaims(noNonce, expected)));
		assert.isTrue(refused({ sub: " " }));
	});
});

describe("a reader known by single sign-on", () => {
	it("is named by name, preferred username or email, in that order", () => {
		const { name: _, preferred_username: __, ...bare } = claimsFor();
		const { email: ___, groups: ____, ...nothing } = bare;

		assert.deepStrictEqual(identityOf(ISSUER, claimsFor(), Option.none()), {
			issuer: ISSUER,
			subject: "ada-1",
			displayName: "Ada Lovelace",
			usernameHint: "ada",
			groups: Option.some(["readers"]),
		});

		const fromEmail = identityOf(ISSUER, bare, Option.none());

		assert.deepStrictEqual(
			[fromEmail.displayName, fromEmail.usernameHint],
			["ada@example.com", "ada"]
		);

		const fromNothing = identityOf(ISSUER, nothing, Option.none());

		assert.deepStrictEqual(
			[fromNothing.displayName, fromNothing.usernameHint, fromNothing.groups],
			["Reader", "ada-1", Option.none()]
		);
	});
});

describe("calls to the identity provider", () => {
	it("go to the internal address when one is set, and nowhere else", () => {
		const backchannel = backchannelOf(ISSUER, INTERNAL);

		assert.strictEqual(
			backchannel(`${ISSUER}/token?x=1`),
			`${INTERNAL}/token?x=1`
		);
		assert.strictEqual(
			backchannel("https://cdn.example.com/jwks"),
			"https://cdn.example.com/jwks"
		);
		assert.strictEqual(
			backchannelOf(ISSUER, "")(`${ISSUER}/token`),
			`${ISSUER}/token`
		);
	});
});

layer(oidcWith(), { buildPerTest: true })(
	"signing in through the identity provider",
	(test) => {
		test.effect(
			"accepts an RS256 token and an ES256 token signed by its published keys",
			() =>
				Effect.gen(function* () {
					const idp = yield* Idp;

					yield* issue(idp.rsa);

					assert.deepStrictEqual(yield* exchange, {
						issuer: ISSUER,
						subject: "ada-1",
						displayName: "Ada Lovelace",
						usernameHint: "ada",
						groups: Option.some(["readers"]),
					});

					yield* issue(idp.ec, { sub: "bea-1" });

					assert.strictEqual((yield* exchange).subject, "bea-1");

					const [asked] = idp.tokenAsks;

					assert.strictEqual(
						asked?.authorization,
						`Basic ${Buffer.from("prosody:s3cret").toString("base64")}`
					);
					assert.strictEqual(
						asked?.body.get("grant_type"),
						"authorization_code"
					);
					assert.strictEqual(asked?.body.get("code_verifier"), "verifier");
				})
		);

		test.effect(
			"refuses a token that is tampered with, unsigned, or signed with a shared secret",
			() =>
				Effect.gen(function* () {
					const idp = yield* Idp;

					yield* issue(idp.rsa);

					const [header, , signature] = idp.idToken.split(".");

					idp.idToken = `${header}.${part(claimsFor({ sub: "eve" }))}.${signature}`;

					assert.strictEqual(
						yield* refusal,
						"The identity token's signature is wrong"
					);

					idp.idToken = `${part({ alg: "none" })}.${part(claimsFor())}.`;

					assert.include(yield* refusal, "none");

					yield* issue(idp.rsa, {}, "HS256");

					assert.include(yield* refusal, "HS256");
				})
		);

		test.effect(
			"refuses a token for another nonce, another client, or out of time",
			() =>
				Effect.gen(function* () {
					const idp = yield* Idp;

					yield* issue(idp.rsa, { nonce: "replayed" });

					assert.include(yield* refusal, "nonce");

					yield* issue(idp.rsa, { aud: "another-app" });

					assert.include(yield* refusal, "another client");

					yield* issue(idp.rsa, { iss: "https://evil.example" });

					assert.include(yield* refusal, "another issuer");

					yield* issue(idp.rsa);
					yield* TestClock.adjust("20 minutes");

					assert.include(yield* refusal, "expired");
				})
		);

		test.effect(
			"fetches the keys again once when a token names a key it has not seen",
			() =>
				Effect.gen(function* () {
					const idp = yield* Idp;

					const fresh = yield* Effect.promise(
						async () => await rsaSigner("new")
					);

					const stranger = yield* Effect.promise(
						async () => await rsaSigner("stranger")
					);

					const keyFetches = () =>
						idp.seen.filter((url) => url.endsWith("/jwks")).length;

					yield* issue(idp.rsa);
					yield* exchange;

					assert.strictEqual(keyFetches(), 1);

					idp.keys = [publish(idp.rsa), publish(fresh)];

					yield* issue(fresh);
					yield* exchange;
					yield* exchange;

					assert.strictEqual(keyFetches(), 2);

					yield* issue(stranger);

					assert.include(yield* refusal, "does not publish");
					assert.strictEqual(keyFetches(), 3);
				})
		);

		test.effect("asks for user info when the token carries no groups", () =>
			Effect.gen(function* () {
				const idp = yield* Idp;
				const { groups: _, name: __, ...thin } = claimsFor();

				idp.userInfo = Option.some({
					sub: "ada-1",
					name: "Ada from user info",
					groups: ["admins", "readers"],
				});
				idp.idToken = yield* Effect.promise(
					async () => await sign(idp.rsa, thin)
				);

				const identity = yield* exchange;

				assert.deepStrictEqual(
					identity.groups,
					Option.some(["admins", "readers"])
				);
				assert.strictEqual(identity.displayName, "Ada from user info");

				idp.userInfo = Option.some({ sub: "someone-else", groups: ["admins"] });

				assert.deepStrictEqual((yield* exchange).groups, Option.none());
			})
		);
	}
);

layer(oidcWith({ OIDC_INTERNAL_URL: INTERNAL }), { buildPerTest: true })(
	"an identity provider behind an internal address",
	(test) => {
		test.effect(
			"is called there while the browser goes to its public address",
			() =>
				Effect.gen(function* () {
					const idp = yield* Idp;
					const oidc = yield* OidcClient;

					yield* issue(idp.rsa);

					const location = yield* oidc.authorizationUrl({
						redirectUri: `${PROSODY}/auth/oidc/callback`,
						state: "state-1",
						nonce: "nonce-1",
						codeChallenge: "challenge",
					});

					yield* exchange;

					assert.strictEqual(new URL(location).origin, ISSUER);
					assert.isAbove(idp.seen.length, 0);
					assert.isTrue(
						idp.seen.every((url) => url.startsWith(`${INTERNAL}/`))
					);
				})
		);
	}
);

const Routes = AuthRoutes.layer.pipe(
	Layer.provideMerge(Sessions.layer),
	Layer.provideMerge(FakeAuthStore),
	Layer.provideMerge(oidcWith()),
	Layer.provideMerge(SecureRandom.layerWebCrypto)
);

const ask = (path: string, headers: Readonly<Record<string, string>> = {}) =>
	Effect.gen(function* () {
		const routes = yield* AuthRoutes;

		const request = HttpServerRequest.fromClientRequest(
			HttpClientRequest.get(`${PROSODY}${path}`).pipe(
				HttpClientRequest.setHeaders({
					host: "prosody.example.com",
					...headers,
				})
			)
		);

		return HttpServerResponse.toWeb(
			yield* routes.fetch.pipe(
				Effect.provideService(HttpServerRequest.HttpServerRequest, request)
			)
		);
	});

const cookieOf = (response: Response, name: string) =>
	response.headers
		.getSetCookie()
		.map((cookie) => cookie.split(";")[0] ?? "")
		.find((cookie) => cookie.startsWith(`${name}=`))
		?.slice(name.length + 1);

const finishSignIn = (state: string) =>
	ask(`/auth/oidc/callback?code=code-1&state=${state}`, {
		cookie: `prosody_oidc_state=${state}`,
		"user-agent":
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
	});

const startSignIn = (change: TestClaims = {}) =>
	Effect.gen(function* () {
		const idp = yield* Idp;
		const start = yield* ask("/auth/oidc/start?redirect=/desk");
		const location = new URL(start.headers.get("location") ?? "");
		const state = location.searchParams.get("state") ?? "";

		assert.strictEqual(start.status, 302);
		assert.strictEqual(
			location.origin + location.pathname,
			`${ISSUER}/authorize`
		);
		assert.strictEqual(
			location.searchParams.get("code_challenge_method"),
			"S256"
		);
		assert.strictEqual(
			location.searchParams.get("redirect_uri"),
			`${PROSODY}/auth/oidc/callback`
		);
		assert.strictEqual(cookieOf(start, "prosody_oidc_state"), state);

		idp.challenge = Option.some(
			location.searchParams.get("code_challenge") ?? ""
		);

		yield* issue(idp.rsa, {
			nonce: location.searchParams.get("nonce") ?? "",
			...change,
		});

		return state;
	});

const signInAs = (change: TestClaims = {}) =>
	Effect.flatMap(startSignIn(change), finishSignIn);

const MeRole = Schema.fromJsonString(
	Schema.Struct({
		user: Schema.NullOr(Schema.Struct({ role: Schema.String })),
	})
);

const DeviceNames = Schema.fromJsonString(
	Schema.Struct({
		sessions: Schema.Array(Schema.Struct({ deviceName: Schema.String })),
	})
);

const textOf = (response: Response) =>
	Effect.promise(async () => await response.text());

const roleOf = (response: Response) =>
	Effect.gen(function* () {
		const me = yield* ask("/auth/me", {
			cookie: `prosody_session=${cookieOf(response, "prosody_session") ?? ""}`,
		});

		const read = yield* Schema.decodeEffect(MeRole)(yield* textOf(me)).pipe(
			Effect.orDie
		);

		return read.user?.role;
	});

layer(Routes, { buildPerTest: true })("the single sign-on routes", (test) => {
	test.effect(
		"take a reader from the start, through the provider, to a session",
		() =>
			Effect.gen(function* () {
				const callback = yield* signInAs();
				const token = cookieOf(callback, "prosody_session") ?? "";

				assert.strictEqual(callback.status, 302);
				assert.strictEqual(callback.headers.get("location"), "/desk");
				assert.include(callback.headers.getSetCookie().join("\n"), "Secure");
				assert.strictEqual(yield* roleOf(callback), "admin");

				const expired = callback.headers
					.getSetCookie()
					.find((cookie) => cookie.startsWith("prosody_oidc_state="));

				assert.match(expired ?? "", /Path=\/auth\/oidc/u);
				assert.match(expired ?? "", /HttpOnly/u);
				assert.match(expired ?? "", /SameSite=Lax/u);
				assert.match(expired ?? "", /Secure/u);

				const sessions = yield* ask("/auth/sessions", {
					cookie: `prosody_session=${token}`,
				});

				const listed = yield* Schema.decodeEffect(DeviceNames)(
					yield* textOf(sessions)
				).pipe(Effect.orDie);

				assert.deepStrictEqual(
					listed.sessions.map(({ deviceName }) => deviceName),
					["Safari on iPhone"]
				);
			})
	);

	test.effect(
		"makes later readers admins only while the provider puts them in the admin group",
		() =>
			Effect.gen(function* () {
				yield* signInAs();

				const bea = { sub: "bea-1", preferred_username: "bea" };

				assert.strictEqual(
					yield* roleOf(yield* signInAs({ ...bea, groups: ["readers"] })),
					"reader"
				);
				assert.strictEqual(
					yield* roleOf(
						yield* signInAs({ ...bea, groups: ["readers", "admins"] })
					),
					"admin"
				);
				assert.strictEqual(
					yield* roleOf(yield* signInAs({ ...bea, groups: [] })),
					"reader"
				);
			})
	);

	test.effect(
		"send the reader back to sign in when the state or the token is wrong",
		() =>
			Effect.gen(function* () {
				const idp = yield* Idp;
				const start = yield* ask("/auth/oidc/start");
				const location = new URL(start.headers.get("location") ?? "");
				const state = location.searchParams.get("state") ?? "";

				const forged = yield* ask(`/auth/oidc/callback?code=c&state=${state}`, {
					cookie: "prosody_oidc_state=someone-elses",
				});

				assert.strictEqual(forged.status, 302);
				assert.strictEqual(forged.headers.get("location"), "/login?error=sso");

				yield* issue(idp.rsa, { nonce: "not-this-sign-in" });

				const replayed = yield* ask(
					`/auth/oidc/callback?code=c&state=${state}`,
					{ cookie: `prosody_oidc_state=${state}` }
				);

				assert.strictEqual(
					replayed.headers.get("location"),
					"/login?error=sso"
				);
				assert.isUndefined(cookieOf(replayed, "prosody_session"));
			})
	);

	test.effect(
		"send the reader back to sign in when a state is used twice",
		() =>
			Effect.gen(function* () {
				const state = yield* startSignIn();
				const first = yield* finishSignIn(state);

				assert.strictEqual(first.headers.get("location"), "/desk");

				const again = yield* finishSignIn(state);

				assert.strictEqual(again.status, 302);
				assert.strictEqual(again.headers.get("location"), "/login?error=sso");
				assert.isUndefined(cookieOf(again, "prosody_session"));
			})
	);
});
