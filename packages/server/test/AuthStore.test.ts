import { assert, describe, it, layer } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option } from "effect";
import { SecureRandom } from "effect/crypto";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";

import {
	AuthDatabase,
	AuthStore,
	isValidUsername,
	roleFromGroups,
	sanitizeUsername,
	SESSION_LIFETIME,
	shouldSlide,
	SLIDE_AFTER,
	usernameCandidate,
} from "../src/AuthStore.ts";
import { FakeAuthStore } from "./FakeAuthStore.ts";

const DATABASE = process.env.PROSODY_TEST_DATABASE_URL ?? "";

const Store = AuthStore.layer.pipe(
	Layer.provideMerge(AuthDatabase.layer),
	Layer.provide(SecureRandom.layerWebCrypto),
	Layer.provide(
		ConfigProvider.layer(
			ConfigProvider.fromUnknown({ PROSODY_DATABASE_URL: DATABASE })
		)
	)
);

const DAY = 86_400_000;

const START = 1_000_000;

const visitTwiceADay = Effect.gen(function* () {
	const store = yield* AuthStore;

	yield* TestClock.setTime(START);

	const admin = yield* store.createFirstAdmin({
		username: "ada",
		displayName: "Ada",
		passwordHash: "x",
	});

	const { rawToken } = yield* store.createSession({
		userId: admin.id,
		deviceName: "Safari on iPhone",
	});

	const left: Array<number> = [];

	for (let visit = 1; visit <= 8; visit += 1) {
		yield* TestClock.adjust("12 hours");

		const seen = yield* store.authenticateSession(rawToken);

		assert.isOk(Option.isSome(seen));

		const expiresAt = Option.match(seen, {
			onNone: () => 0,
			onSome: ({ session }) => session.expiresAt,
		});

		const again = yield* store.authenticateSession(rawToken);

		assert.deepStrictEqual(
			Option.map(again, ({ session }) => session.expiresAt),
			Option.some(expiresAt)
		);

		left.push(expiresAt - (START + visit * 12 * 3_600_000));
	}

	assert.deepStrictEqual(
		left.map((remaining) => remaining / 3_600_000),
		[2148, 2136, 2160, 2148, 2136, 2160, 2148, 2136]
	);
});

const clean = Effect.gen(function* () {
	const database = yield* AuthDatabase;
	const sql: SqlClient.SqlClient = yield* database.sql;

	yield* sql`TRUNCATE prosody_oidc_states, prosody_invites, prosody_sessions, prosody_users`;
});

describe("a username Prosody picks from a sign-in name", () => {
	it("keeps lowercase letters, digits, dots, dashes and underscores", () => {
		assert.strictEqual(sanitizeUsername("Ada.Lovelace"), "ada.lovelace");
		assert.strictEqual(sanitizeUsername("Zoë Martín"), "zoe-martin");
		assert.strictEqual(sanitizeUsername("  --x__"), "x");
		assert.strictEqual(sanitizeUsername("@@@"), "reader");
		assert.isOk(isValidUsername(sanitizeUsername("a".repeat(80))));
	});

	it("takes a number when the name is already used", () => {
		assert.strictEqual(usernameCandidate("ada", 1), "ada");
		assert.strictEqual(usernameCandidate("ada", 2), "ada-2");
		assert.strictEqual(
			usernameCandidate("a".repeat(32), 3),
			`${"a".repeat(30)}-3`
		);
	});

	it("is an admin's when the groups name the admin group", () => {
		assert.strictEqual(
			roleFromGroups(["readers", "admins"], "admins"),
			"admin"
		);
		assert.strictEqual(roleFromGroups(["readers"], "admins"), "reader");
	});
});

describe("a session's expiry", () => {
	it("slides once more than a day of its lifetime has passed", () => {
		assert.isFalse(shouldSlide(SESSION_LIFETIME, 0));
		assert.isFalse(shouldSlide(SESSION_LIFETIME, SLIDE_AFTER));
		assert.isTrue(shouldSlide(SESSION_LIFETIME, SLIDE_AFTER + 1));
		assert.isTrue(shouldSlide(SESSION_LIFETIME, 30 * DAY));
	});
});

layer(FakeAuthStore)("the stand-in sign-in store", (test) => {
	test.effect(
		"slides a session for a reader who visits twice a day",
		() => visitTwiceADay
	);
});

describe.skipIf(DATABASE === "")("the sign-in store in Postgres", () => {
	layer(Store)((test) => {
		test.effect("slides a session for a reader who visits twice a day", () =>
			Effect.andThen(clean, visitTwiceADay)
		);

		test.effect("keeps an asserted name to sixty-four characters", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					const reader = yield* store.upsertOidcUser({
						issuer: "https://id.example.com",
						subject: "ada-1",
						usernameHint: "ada",
						displayName: `  ${"A".repeat(500)}  `,
						groups: Option.none(),
						adminGroup: "admins",
					});

					assert.strictEqual(reader.displayName, "A".repeat(64));
				})
			)
		);

		test.effect("sets up one first admin and refuses a second setup", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					assert.strictEqual(yield* store.userCount, 0);

					const admin = yield* store.createFirstAdmin({
						username: "ada",
						displayName: "Ada",
						passwordHash: "scrypt$hash",
					});

					assert.strictEqual(admin.role, "admin");
					assert.match(admin.id, /^u-[0-9a-f]{12}$/u);
					assert.strictEqual(yield* store.userCount, 1);

					const again = yield* store
						.createFirstAdmin({
							username: "eve",
							displayName: "Eve",
							passwordHash: "x",
						})
						.pipe(Effect.flip);

					assert.strictEqual(again._tag, "SetupAlreadyDone");

					const found = yield* store.findUserByUsername("ada");

					assert.deepStrictEqual(
						Option.map(found, (user) => user.passwordHash),
						Option.some(Option.some("scrypt$hash"))
					);
				})
			)
		);

		test.effect("keeps sessions by token, slides them, and forgets them", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					yield* TestClock.setTime(1_000_000);

					const admin = yield* store.createFirstAdmin({
						username: "ada",
						displayName: "Ada",
						passwordHash: "x",
					});

					const { session, rawToken } = yield* store.createSession({
						userId: admin.id,
						deviceName: "Safari on iPhone",
					});

					assert.match(session.id, /^s-[0-9a-f]{12}$/u);

					const known = yield* store.authenticateSession(rawToken);

					assert.deepStrictEqual(
						Option.map(known, ({ user }) => user.id),
						Option.some(admin.id)
					);
					assert.isOk(Option.isNone(yield* store.authenticateSession("wrong")));

					yield* TestClock.adjust("2 days");

					const later = yield* store.authenticateSession(rawToken);

					assert.deepStrictEqual(
						Option.map(later, ({ session: kept }) => kept.expiresAt),
						Option.some(1_000_000 + 2 * 86_400_000 + 90 * 86_400_000)
					);

					assert.isOk(
						yield* store.renameSession(admin.id, session.id, "Kitchen iPad")
					);

					const listed = yield* store.listSessions(admin.id);

					assert.deepStrictEqual(
						listed.map(({ device }) => device),
						["Kitchen iPad"]
					);

					yield* store.deleteSessionByToken(rawToken);

					assert.isOk(
						Option.isNone(yield* store.authenticateSession(rawToken))
					);
				})
			)
		);

		test.effect("lets an invite be used once, for its role", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					const admin = yield* store.createFirstAdmin({
						username: "ada",
						displayName: "Ada",
						passwordHash: "x",
					});

					const { invite, rawToken } = yield* store.createInvite({
						createdBy: admin.id,
						role: "reader",
						note: "for Bea",
					});

					assert.match(invite.id, /^inv-[0-9a-f]{12}$/u);
					assert.deepStrictEqual(
						(yield* store.listInvites).map(({ id }) => id),
						[invite.id]
					);
					assert.isOk(Option.isSome(yield* store.findValidInvite(rawToken)));

					const taken = yield* store
						.registerWithInvite({
							inviteToken: rawToken,
							username: "ada",
							displayName: "Other Ada",
							passwordHash: "y",
						})
						.pipe(Effect.flip);

					assert.strictEqual(taken._tag, "UsernameTaken");

					const bea = yield* store.registerWithInvite({
						inviteToken: rawToken,
						username: "bea",
						displayName: "Bea",
						passwordHash: "y",
					});

					assert.strictEqual(bea.role, "reader");

					const reused = yield* store
						.registerWithInvite({
							inviteToken: rawToken,
							username: "cy",
							displayName: "Cy",
							passwordHash: "z",
						})
						.pipe(Effect.flip);

					assert.strictEqual(reused._tag, "InvalidInvite");
					assert.deepStrictEqual(yield* store.listInvites, []);
				})
			)
		);

		test.effect("never leaves Prosody without an admin", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					const admin = yield* store.createFirstAdmin({
						username: "ada",
						displayName: "Ada",
						passwordHash: "x",
					});

					const demoted = yield* store
						.updateUserRole(admin.id, "reader")
						.pipe(Effect.flip);

					assert.strictEqual(demoted._tag, "LastAdmin");

					const removed = yield* store.deleteUser(admin.id).pipe(Effect.flip);

					assert.strictEqual(removed._tag, "LastAdmin");

					const reader = yield* store.upsertOidcUser({
						issuer: "https://id.example.com",
						subject: "bea-1",
						usernameHint: "Ada",
						displayName: "Bea",
						groups: Option.some(["readers"]),
						adminGroup: "admins",
					});

					assert.strictEqual(reader.role, "reader");
					assert.strictEqual(reader.username, "ada-2");

					const promoted = yield* store.updateUserRole(reader.id, "admin");

					assert.strictEqual(promoted.role, "admin");

					yield* store.deleteUser(admin.id);

					assert.deepStrictEqual(
						(yield* store.listUsers).map(({ id }) => id),
						[reader.id]
					);
				})
			)
		);

		test.effect(
			"makes the first single sign-on reader an admin and follows the admin group",
			() =>
				Effect.andThen(
					clean,
					Effect.gen(function* () {
						const store = yield* AuthStore;

						const signIn = (groups: Option.Option<ReadonlyArray<string>>) =>
							store.upsertOidcUser({
								issuer: "https://id.example.com",
								subject: "ada-1",
								usernameHint: "ada@example.com",
								displayName: "Ada",
								groups,
								adminGroup: "admins",
							});

						const first = yield* signIn(Option.some(["readers"]));

						assert.strictEqual(first.role, "admin");

						const second = yield* store.upsertOidcUser({
							issuer: "https://id.example.com",
							subject: "bea-1",
							usernameHint: "bea",
							displayName: "Bea",
							groups: Option.some(["admins"]),
							adminGroup: "admins",
						});

						assert.strictEqual(second.role, "admin");
						assert.strictEqual(
							(yield* signIn(Option.some(["readers"]))).role,
							"reader"
						);
						assert.strictEqual((yield* signIn(Option.none())).role, "reader");

						const lastAdmin = yield* store.upsertOidcUser({
							issuer: "https://id.example.com",
							subject: "bea-1",
							usernameHint: "bea",
							displayName: "Bea Renamed",
							groups: Option.some([]),
							adminGroup: "admins",
						});

						assert.strictEqual(lastAdmin.role, "admin");
						assert.strictEqual(lastAdmin.displayName, "Bea Renamed");
					})
				)
		);

		test.effect("hands back a sign-in's state once", () =>
			Effect.andThen(
				clean,
				Effect.gen(function* () {
					const store = yield* AuthStore;

					yield* TestClock.setTime(5000);

					yield* store.saveOidcState({
						state: "state-1",
						codeVerifier: "verifier",
						nonce: "nonce",
						redirectTo: "/desk",
						expiresAt: 10_000,
					});

					const first = yield* store.consumeOidcState("state-1");

					assert.deepStrictEqual(
						Option.map(first, ({ redirectTo }) => redirectTo),
						Option.some("/desk")
					);
					assert.isOk(Option.isNone(yield* store.consumeOidcState("state-1")));
				})
			)
		);
	});
});
