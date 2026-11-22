import type { webcrypto } from "node:crypto";

import {
	Cache,
	Clock,
	Context,
	Effect,
	Exit,
	Layer,
	Option,
	Predicate,
	Redacted,
	Schema,
} from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { AuthSettings, withoutTrailingSlash } from "./AuthSettings.ts";
import { constantTimeEqual } from "./Crypto.ts";

export class OidcFailed extends Schema.TaggedError<OidcFailed>()("OidcFailed", {
	reason: Schema.String,
}) {}

const failed = (reason: string) => new OidcFailed({ reason });

const KEEP_FOR = "1 hour";

const SKEW_SECONDS = 60;

const ANSWER_TIME = "15 seconds";

const Discovery = Schema.Struct({
	issuer: Schema.String,
	authorization_endpoint: Schema.String,
	token_endpoint: Schema.String,
	jwks_uri: Schema.String,
	userinfo_endpoint: Schema.optionalKey(Schema.String),
	token_endpoint_auth_methods_supported: Schema.optionalKey(
		Schema.Array(Schema.String)
	),
});

type Discovery = typeof Discovery.Type;

const Jwk = Schema.Struct({
	kty: Schema.String,
	kid: Schema.optionalKey(Schema.String),
	use: Schema.optionalKey(Schema.String),
	alg: Schema.optionalKey(Schema.String),
	n: Schema.optionalKey(Schema.String),
	e: Schema.optionalKey(Schema.String),
	crv: Schema.optionalKey(Schema.String),
	x: Schema.optionalKey(Schema.String),
	y: Schema.optionalKey(Schema.String),
});

type Jwk = typeof Jwk.Type;

const Jwks = Schema.Struct({ keys: Schema.Array(Jwk) });

const TokenAnswer = Schema.Struct({
	id_token: Schema.String,
	access_token: Schema.optionalKey(Schema.String),
});

const TokenRefusal = Schema.Struct({
	error: Schema.optionalKey(Schema.String),
	error_description: Schema.optionalKey(Schema.String),
});

const Header = Schema.fromJsonString(
	Schema.Struct({
		alg: Schema.String,
		kid: Schema.optionalKey(Schema.String),
	})
);

const Groups = Schema.Union([Schema.Array(Schema.String), Schema.String]);

const Profile = {
	name: Schema.optionalKey(Schema.String),
	preferred_username: Schema.optionalKey(Schema.String),
	email: Schema.optionalKey(Schema.String),
	groups: Schema.optionalKey(Groups),
};

const Claims = Schema.fromJsonString(
	Schema.Struct({
		iss: Schema.String,
		sub: Schema.String,
		aud: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
		exp: Schema.Finite,
		nbf: Schema.optionalKey(Schema.Finite),
		nonce: Schema.optionalKey(Schema.String),
		azp: Schema.optionalKey(Schema.String),
		...Profile,
	})
);

type Claims = typeof Claims.Type;

const UserInfo = Schema.Struct({ sub: Schema.String, ...Profile });

type UserInfo = typeof UserInfo.Type;

interface Verifier {
	readonly kty: "RSA" | "EC";
	readonly crv?: string;
	readonly importParams:
		| webcrypto.RsaHashedImportParams
		| webcrypto.EcKeyImportParams;
	readonly verifyParams:
		| webcrypto.AlgorithmIdentifier
		| webcrypto.RsaPssParams
		| webcrypto.EcdsaParams;
}

const VERIFIERS: ReadonlyMap<string, Verifier> = new Map<string, Verifier>([
	[
		"RS256",
		{
			kty: "RSA",
			importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
			verifyParams: { name: "RSASSA-PKCS1-v1_5" },
		},
	],
	[
		"PS256",
		{
			kty: "RSA",
			importParams: { name: "RSA-PSS", hash: "SHA-256" },
			verifyParams: { name: "RSA-PSS", saltLength: 32 },
		},
	],
	[
		"ES256",
		{
			kty: "EC",
			crv: "P-256",
			importParams: { name: "ECDSA", namedCurve: "P-256" },
			verifyParams: { name: "ECDSA", hash: "SHA-256" },
		},
	],
	[
		"ES384",
		{
			kty: "EC",
			crv: "P-384",
			importParams: { name: "ECDSA", namedCurve: "P-384" },
			verifyParams: { name: "ECDSA", hash: "SHA-384" },
		},
	],
]);

export interface AuthorizationRequest {
	readonly redirectUri: string;
	readonly state: string;
	readonly nonce: string;
	readonly codeChallenge: string;
}

export interface CodeExchange {
	readonly code: string;
	readonly redirectUri: string;
	readonly codeVerifier: string;
	readonly nonce: string;
}

export interface OidcIdentity {
	readonly issuer: string;
	readonly subject: string;
	readonly displayName: string;
	readonly usernameHint: string;
	readonly groups: Option.Option<ReadonlyArray<string>>;
}

const textOf = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const bytesOfBase64Url = (value: string): Uint8Array<ArrayBuffer> =>
	new Uint8Array(Buffer.from(value, "base64url"));

const groupsOf = (
	value: ReadonlyArray<string> | string | undefined
): Option.Option<ReadonlyArray<string>> => {
	if (value === undefined) {
		return Option.none();
	}

	return Option.some(Predicate.isString(value) ? [value] : value);
};

const present = (value: string | undefined): Option.Option<string> =>
	value === undefined || value.trim() === ""
		? Option.none()
		: Option.some(value.trim());

const localPart = (email: string | undefined): Option.Option<string> =>
	Option.flatMap(present(email), (address) => present(address.split("@")[0]));

export const identityOf = (
	issuer: string,
	claims: Claims,
	info: Option.Option<UserInfo>
): OidcIdentity => {
	const fromInfo = <A>(pick: (info: UserInfo) => A | undefined) =>
		Option.getOrUndefined(Option.flatMapNullishOr(info, pick));

	const name = claims.name ?? fromInfo((found) => found.name);

	const preferred =
		claims.preferred_username ?? fromInfo((found) => found.preferred_username);

	const email = claims.email ?? fromInfo((found) => found.email);

	const displayName = present(name).pipe(
		Option.orElse(() => present(preferred)),
		Option.orElse(() => present(email)),
		Option.getOrElse(() => "Reader")
	);

	const usernameHint = present(preferred).pipe(
		Option.orElse(() => localPart(email)),
		Option.orElse(() => present(name)),
		Option.getOrElse(() => claims.sub)
	);

	return {
		issuer,
		subject: claims.sub,
		displayName,
		usernameHint,
		groups: groupsOf(claims.groups ?? fromInfo((found) => found.groups)),
	};
};

export const backchannelOf =
	(issuer: string, internalUrl: string) =>
	(url: string): string => {
		if (
			internalUrl === "" ||
			!URL.canParse(url) ||
			!URL.canParse(issuer) ||
			!URL.canParse(internalUrl)
		) {
			return url;
		}

		const target = new URL(url);

		if (target.origin !== new URL(issuer).origin) {
			return url;
		}

		const internal = new URL(internalUrl);

		return `${internal.origin}${target.pathname}${target.search}`;
	};

export const checkClaims = (
	claims: Claims,
	expected: {
		readonly issuer: string;
		readonly clientId: string;
		readonly nonce: string;
		readonly now: number;
	}
): Option.Option<string> => {
	const audiences = Predicate.isString(claims.aud) ? [claims.aud] : claims.aud;

	if (withoutTrailingSlash(claims.iss) !== expected.issuer) {
		return Option.some("The identity token names another issuer");
	}

	if (!audiences.includes(expected.clientId)) {
		return Option.some("The identity token is for another client");
	}

	const authorizedParty =
		claims.azp === undefined
			? audiences.length === 1
			: claims.azp === expected.clientId;

	if (!authorizedParty) {
		return Option.some("The identity token was issued to another party");
	}

	if (claims.exp + SKEW_SECONDS <= expected.now) {
		return Option.some("The identity token has expired");
	}

	if (claims.nbf !== undefined && claims.nbf - SKEW_SECONDS > expected.now) {
		return Option.some("The identity token is not valid yet");
	}

	if (
		claims.nonce === undefined ||
		!constantTimeEqual(claims.nonce, expected.nonce)
	) {
		return Option.some(
			"The identity token does not carry this sign-in's nonce"
		);
	}

	if (claims.sub.trim() === "") {
		return Option.some("The identity token names no subject");
	}

	return Option.none();
};

const jsonWebKeyOf = (jwk: Jwk): Option.Option<webcrypto.JsonWebKey> => {
	if (jwk.kty === "RSA" && jwk.n !== undefined && jwk.e !== undefined) {
		return Option.some({ kty: "RSA", n: jwk.n, e: jwk.e });
	}

	if (
		jwk.kty === "EC" &&
		jwk.crv !== undefined &&
		jwk.x !== undefined &&
		jwk.y !== undefined
	) {
		return Option.some({ kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y });
	}

	return Option.none();
};

const candidatesFor = (
	keys: ReadonlyArray<Jwk>,
	alg: string,
	verifier: Verifier,
	kid: string | undefined
): ReadonlyArray<Jwk> =>
	keys.filter(
		(key) =>
			key.kty === verifier.kty &&
			(verifier.crv === undefined || key.crv === verifier.crv) &&
			(key.use === undefined || key.use === "sig") &&
			(key.alg === undefined || key.alg === alg) &&
			(kid === undefined || key.kid === kid)
	);

const importKey = Effect.fnUntraced(function* (jwk: Jwk, verifier: Verifier) {
	const key = jsonWebKeyOf(jwk);

	if (Option.isNone(key)) {
		return yield* failed("The identity provider's key is incomplete");
	}

	return yield* Effect.tryPromise({
		try: async () =>
			await crypto.subtle.importKey(
				"jwk",
				key.value,
				verifier.importParams,
				false,
				["verify"]
			),
		catch: () => failed("The identity provider's key could not be read"),
	});
});

export class OidcClient extends Context.Service<
	OidcClient,
	{
		readonly enabled: boolean;
		readonly authorizationUrl: (
			request: AuthorizationRequest
		) => Effect.Effect<string, OidcFailed>;
		readonly exchange: (
			exchange: CodeExchange
		) => Effect.Effect<OidcIdentity, OidcFailed>;
	}
>()("@prosody/server/OidcClient", {
	make: Effect.gen(function* () {
		const settings = yield* AuthSettings;
		const client = yield* HttpClient.HttpClient;
		const backchannel = backchannelOf(settings.issuer, settings.internalUrl);

		const getJson = <S extends Schema.Constraint>(
			url: string,
			schema: S,
			what: string
		) =>
			client.get(backchannel(url), { acceptJson: true }).pipe(
				Effect.timeout(ANSWER_TIME),
				Effect.mapError(() =>
					failed(`The identity provider's ${what} did not answer`)
				),
				Effect.flatMap((response) =>
					response.status === 200
						? HttpClientResponse.schemaBodyJson(schema)(response).pipe(
								Effect.mapError(() =>
									failed(`The identity provider's ${what} could not be read`)
								)
							)
						: Effect.fail(
								failed(
									`The identity provider's ${what} answered ${response.status}`
								)
							)
				)
			);

		const discover = Effect.fn("OidcClient.discover")(function* (
			issuer: string
		) {
			const found = yield* getJson(
				`${issuer}/.well-known/openid-configuration`,
				Discovery,
				"discovery document"
			);

			if (withoutTrailingSlash(found.issuer) !== issuer) {
				return yield* failed(
					"The identity provider's discovery document names another issuer"
				);
			}

			return found;
		});

		const discoveries = yield* Cache.makeWith(discover, {
			capacity: 1,
			timeToLive: (exit) => (Exit.isSuccess(exit) ? KEEP_FOR : 0),
		});

		const keySets = yield* Cache.makeWith(
			(url: string) =>
				getJson(url, Jwks, "key set").pipe(
					Effect.map((set) => set.keys),
					Effect.withSpan("OidcClient.keys")
				),
			{
				capacity: 4,
				timeToLive: (exit) => (Exit.isSuccess(exit) ? KEEP_FOR : 0),
			}
		);

		const discovery = Effect.suspend(() => {
			if (!settings.oidcEnabled) {
				return Effect.fail(failed("Single sign-on is not set up on this host"));
			}

			return Cache.get(discoveries, settings.issuer);
		});

		const verifyToken = Effect.fn("OidcClient.verifyToken")(function* (
			found: Discovery,
			token: string
		) {
			const parts = token.split(".");
			const [encodedHeader, encodedPayload, encodedSignature] = parts;

			if (
				parts.length !== 3 ||
				encodedHeader === undefined ||
				encodedPayload === undefined ||
				encodedSignature === undefined
			) {
				return yield* failed("The identity token is not a signed token");
			}

			const header = yield* Schema.decodeEffect(Header)(
				textOf(bytesOfBase64Url(encodedHeader))
			).pipe(
				Effect.mapError(() =>
					failed("The identity token's header could not be read")
				)
			);

			const verifier = VERIFIERS.get(header.alg);

			if (verifier === undefined) {
				return yield* failed(
					`The identity token is signed with ${header.alg}, which Prosody does not accept`
				);
			}

			const pick = (keys: ReadonlyArray<Jwk>) => {
				const candidates = candidatesFor(
					keys,
					header.alg,
					verifier,
					header.kid
				);

				return header.kid === undefined && candidates.length !== 1
					? undefined
					: candidates[0];
			};

			const known = pick(yield* Cache.get(keySets, found.jwks_uri));

			const jwk =
				known ??
				pick(
					yield* Cache.invalidate(keySets, found.jwks_uri).pipe(
						Effect.andThen(Cache.get(keySets, found.jwks_uri))
					)
				);

			if (jwk === undefined) {
				return yield* failed(
					"The identity token is signed with a key the provider does not publish"
				);
			}

			const key = yield* importKey(jwk, verifier);

			const signed = yield* Effect.tryPromise({
				try: async () =>
					await crypto.subtle.verify(
						verifier.verifyParams,
						key,
						bytesOfBase64Url(encodedSignature),
						new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
					),
				catch: () =>
					failed("The identity token's signature could not be checked"),
			});

			if (!signed) {
				return yield* failed("The identity token's signature is wrong");
			}

			return yield* Schema.decodeEffect(Claims)(
				textOf(bytesOfBase64Url(encodedPayload))
			).pipe(
				Effect.mapError(() =>
					failed("The identity token's claims could not be read")
				)
			);
		});

		const userInfo = Effect.fn("OidcClient.userInfo")(function* (
			found: Discovery,
			accessToken: string | undefined,
			subject: string
		) {
			if (found.userinfo_endpoint === undefined || accessToken === undefined) {
				return Option.none<UserInfo>();
			}

			const response = yield* client
				.execute(
					HttpClientRequest.get(backchannel(found.userinfo_endpoint)).pipe(
						HttpClientRequest.bearerToken(accessToken),
						HttpClientRequest.acceptJson
					)
				)
				.pipe(Effect.timeout(ANSWER_TIME), Effect.option);

			if (Option.isNone(response) || response.value.status !== 200) {
				yield* Effect.logWarning(
					"the identity provider's user info did not answer"
				);

				return Option.none<UserInfo>();
			}

			const info = yield* HttpClientResponse.schemaBodyJson(UserInfo)(
				response.value
			).pipe(Effect.option);

			return Option.filter(info, (read) => read.sub === subject);
		});

		const authorizationUrl = Effect.fn("OidcClient.authorizationUrl")(
			function* (request: AuthorizationRequest) {
				const found = yield* discovery;

				if (!URL.canParse(found.authorization_endpoint)) {
					return yield* failed(
						"The identity provider's sign-in page has no usable address"
					);
				}

				const url = new URL(found.authorization_endpoint);

				for (const [name, value] of [
					["response_type", "code"],
					["client_id", settings.clientId],
					["redirect_uri", request.redirectUri],
					["scope", settings.scopes],
					["state", request.state],
					["nonce", request.nonce],
					["code_challenge", request.codeChallenge],
					["code_challenge_method", "S256"],
				] as const) {
					url.searchParams.set(name, value);
				}

				return url.toString();
			}
		);

		const exchange = Effect.fn("OidcClient.exchange")(function* (
			grant: CodeExchange
		) {
			const found = yield* discovery;
			const secret = Redacted.value(settings.clientSecret);

			const methods = found.token_endpoint_auth_methods_supported ?? [
				"client_secret_basic",
			];

			const byPost =
				secret !== "" &&
				!methods.includes("client_secret_basic") &&
				methods.includes("client_secret_post");

			const body: Array<readonly [string, string]> = [
				["grant_type", "authorization_code"],
				["code", grant.code],
				["redirect_uri", grant.redirectUri],
				["code_verifier", grant.codeVerifier],
				["client_id", settings.clientId],
			];

			if (byPost) {
				body.push(["client_secret", secret]);
			}

			const basic = Buffer.from(
				`${encodeURIComponent(settings.clientId)}:${encodeURIComponent(secret)}`
			).toString("base64");

			const request = HttpClientRequest.post(
				backchannel(found.token_endpoint)
			).pipe(
				HttpClientRequest.bodyUrlParams(body),
				HttpClientRequest.acceptJson,
				secret === "" || byPost
					? (unchanged) => unchanged
					: HttpClientRequest.setHeader("authorization", `Basic ${basic}`)
			);

			const response = yield* client.execute(request).pipe(
				Effect.timeout(ANSWER_TIME),
				Effect.mapError(() => failed("The identity provider did not answer"))
			);

			if (response.status !== 200) {
				const refusal = yield* HttpClientResponse.schemaBodyJson(TokenRefusal)(
					response
				).pipe(Effect.option);

				const reason = Option.flatMapNullishOr(refusal, (read) => read.error);

				return yield* failed(
					`The identity provider refused the sign-in (${response.status}${Option.match(reason, { onNone: () => "", onSome: (code) => `, ${code}` })})`
				);
			}

			const tokens = yield* HttpClientResponse.schemaBodyJson(TokenAnswer)(
				response
			).pipe(
				Effect.mapError(() =>
					failed("The identity provider's answer could not be read")
				)
			);

			const claims = yield* verifyToken(found, tokens.id_token);
			const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);

			const problem = checkClaims(claims, {
				issuer: settings.issuer,
				clientId: settings.clientId,
				nonce: grant.nonce,
				now,
			});

			if (Option.isSome(problem)) {
				return yield* failed(problem.value);
			}

			const info =
				claims.groups === undefined
					? yield* userInfo(found, tokens.access_token, claims.sub)
					: Option.none<UserInfo>();

			return identityOf(settings.issuer, claims, info);
		});

		return {
			enabled: settings.oidcEnabled,
			authorizationUrl,
			exchange,
		};
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}
