import { assert, describe, it, layer } from "@effect/vitest";
import { Actor } from "@prosody/domain/Actor.context";
import { Session, SignedOut } from "@prosody/domain/Session.middleware";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { Headers } from "effect/http";
import { Rpc, RpcMessage } from "effect/rpc";

import { AuthStore } from "../src/AuthStore.ts";
import {
	authenticateRequest,
	isCrossSite,
	isEarlyData,
	parseCookies,
	SessionLive,
	Sessions,
	tokenFrom,
} from "../src/Session.ts";
import { FakeAuthStore } from "./FakeAuthStore.ts";

const READ = { host: "read.example.com" };

const asked = (headers: Record<string, string>) =>
	isCrossSite(Headers.fromInput({ ...READ, ...headers }));

describe("a request from another site", () => {
	it("is not one Prosody's own page makes, a link followed to it, or curl", () => {
		assert.isNotOk(
			asked({
				origin: "https://read.example.com",
				"sec-fetch-site": "same-origin",
			})
		);
		assert.isNotOk(
			isCrossSite(
				Headers.fromInput({
					host: "prosody.example.com",
					origin: "https://prosody.example.com",
				})
			)
		);
		assert.isNotOk(
			asked({
				"sec-fetch-site": "cross-site",
				"sec-fetch-mode": "navigate",
				"sec-fetch-dest": "document",
			})
		);
		assert.isNotOk(asked({}));
	});

	it("is a WebSocket or POST from another page, a frame, or a sister site's fetch", () => {
		assert.isOk(asked({ origin: "https://evil.example" }));
		assert.isOk(asked({ origin: "https://other.example.com" }));
		assert.isOk(asked({ origin: "null" }));
		assert.isOk(
			asked({
				"sec-fetch-site": "cross-site",
				"sec-fetch-mode": "navigate",
				"sec-fetch-dest": "iframe",
			})
		);
		assert.isOk(
			asked({
				"sec-fetch-site": "same-site",
				"sec-fetch-mode": "no-cors",
				"sec-fetch-dest": "audio",
			})
		);
	});
});

describe("a request sent as early data", () => {
	const early = Headers.fromInput({ "early-data": "1" });

	it("is refused when it would change something", () => {
		assert.isTrue(isEarlyData("POST", early));
		assert.isTrue(isEarlyData("PUT", early));
		assert.isTrue(isEarlyData("PATCH", early));
		assert.isTrue(isEarlyData("DELETE", early));
		assert.isTrue(isEarlyData("OPTIONS", early));
	});

	it("is let through when it only reads, or when it is not early", () => {
		assert.isFalse(isEarlyData("GET", early));
		assert.isFalse(isEarlyData("HEAD", early));
		assert.isFalse(isEarlyData("POST", Headers.fromInput({})));
		assert.isFalse(
			isEarlyData("POST", Headers.fromInput({ "early-data": "0" }))
		);
	});
});

describe("a session token", () => {
	it("is read from the cookie header, the first of a name winning", () => {
		const cookies = parseCookies(
			'theme=dark; prosody_session=abc; prosody_session=later; quoted="x%20y"'
		);

		assert.strictEqual(cookies.get("prosody_session"), "abc");
		assert.strictEqual(cookies.get("theme"), "dark");
		assert.strictEqual(cookies.get("quoted"), "x y");
		assert.strictEqual(parseCookies(undefined).size, 0);
		assert.strictEqual(parseCookies("no-value; =x").size, 0);
	});

	it("comes from a bearer header before a cookie", () => {
		assert.deepStrictEqual(
			tokenFrom(
				Headers.fromInput({
					authorization: "Bearer from-app",
					cookie: "prosody_session=from-browser",
				})
			),
			Option.some({ token: "from-app", source: "bearer" })
		);
		assert.deepStrictEqual(
			tokenFrom(Headers.fromInput({ cookie: "prosody_session=from-browser" })),
			Option.some({ token: "from-browser", source: "cookie" })
		);
		assert.deepStrictEqual(
			tokenFrom(Headers.fromInput({ authorization: "Basic abc" })),
			Option.none()
		);
		assert.deepStrictEqual(tokenFrom(Headers.fromInput({})), Option.none());
	});
});

const Signed = SessionLive.pipe(
	Layer.provideMerge(Sessions.layer),
	Layer.provideMerge(FakeAuthStore)
);

const signedInReader = Effect.gen(function* () {
	const store = yield* AuthStore;

	const admin = yield* store.createFirstAdmin({
		username: "ada",
		displayName: "Ada",
		passwordHash: "x",
	});

	const { rawToken } = yield* store.createSession({
		userId: admin.id,
		deviceName: "Safari on iPhone",
	});

	return { admin, rawToken };
});

layer(Signed, { buildPerTest: true })("a signed-in request", (test) => {
	test.effect(
		"is known by its cookie on the page's own site, or by its bearer token anywhere",
		() =>
			Effect.gen(function* () {
				const { admin, rawToken } = yield* signedInReader;
				const cookie = `prosody_session=${rawToken}`;

				const same = yield* authenticateRequest(
					Headers.fromInput({
						...READ,
						origin: "https://read.example.com",
						cookie,
					})
				);

				assert.deepStrictEqual(
					Option.map(same, ({ user }) => user.id),
					Option.some(admin.id)
				);

				const elsewhere = yield* authenticateRequest(
					Headers.fromInput({ ...READ, origin: "https://evil.example", cookie })
				);

				assert.deepStrictEqual(elsewhere, Option.none());

				const app = yield* authenticateRequest(
					Headers.fromInput({
						...READ,
						origin: "https://evil.example",
						authorization: `Bearer ${rawToken}`,
					})
				);

				assert.isOk(Option.isSome(app));
			})
	);

	test.effect(
		"gives the model its reader, role and device, or is signed out",
		() =>
			Effect.gen(function* () {
				const { admin, rawToken } = yield* signedInReader;
				const middleware = yield* Session;

				const run = (headers: Record<string, string>) =>
					Effect.scoped(
						middleware(
							Effect.gen(function* () {
								return yield* Effect.die(yield* Actor);
							}),
							{
								client: new Rpc.ServerClient(1),
								requestId: RpcMessage.RequestId(1),
								rpc: Rpc.make("Probe"),
								payload: undefined,
								headers: Headers.fromInput(headers),
							}
						)
					).pipe(Effect.exit);

				const signedIn = yield* run({ authorization: `Bearer ${rawToken}` });

				assert.deepStrictEqual(
					Exit.isFailure(signedIn) && Cause.squash(signedIn.cause),
					{
						reader: admin.id,
						role: "admin",
						device: "Safari on iPhone",
					}
				);

				const signedOut = yield* run({ cookie: "prosody_session=stale" });

				assert.instanceOf(
					Exit.isFailure(signedOut) && Cause.squash(signedOut.cause),
					SignedOut
				);
			})
	);
});
