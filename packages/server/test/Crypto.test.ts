import { createHash } from "node:crypto";

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { SecureRandom } from "effect/crypto";

import {
	constantTimeEqual,
	dummyVerifyPassword,
	hashPassword,
	randomHex,
	randomToken,
	sha256Base64Url,
	sha256Hex,
	verifyPassword,
} from "../src/Crypto.ts";

const withRandom = Effect.provide(SecureRandom.layerWebCrypto);

describe("a password", () => {
	it.effect("is kept as a salted scrypt hash that only it matches", () =>
		Effect.gen(function* () {
			const stored = yield* hashPassword("correct horse battery");

			assert.match(
				stored,
				/^scrypt\$16384\$8\$5\$[0-9a-f]{32}\$[0-9a-f]{128}$/u
			);
			assert.isOk(yield* verifyPassword("correct horse battery", stored));
			assert.isNotOk(yield* verifyPassword("correct horse batterY", stored));
			assert.isNotOk(yield* verifyPassword("", stored));
		}).pipe(withRandom)
	);

	it.effect("is salted afresh each time it is kept", () =>
		Effect.gen(function* () {
			const first = yield* hashPassword("the same words");
			const second = yield* hashPassword("the same words");

			assert.notStrictEqual(first, second);
			assert.isOk(yield* verifyPassword("the same words", second));
		}).pipe(withRandom)
	);

	it.effect("never matches a stored value Prosody did not write", () =>
		Effect.gen(function* () {
			assert.isNotOk(yield* verifyPassword("x", "plain text"));
			assert.isNotOk(yield* verifyPassword("x", "scrypt$1$8$1$00$00"));
			assert.isNotOk(yield* verifyPassword("x", "scrypt$99999999$8$1$00$00"));
			assert.isNotOk(yield* dummyVerifyPassword("anything"));
		})
	);
});

describe("the token helpers", () => {
	it("hash with SHA-256 as hex and as base64url", () => {
		assert.strictEqual(
			sha256Hex("abc"),
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
		assert.strictEqual(
			sha256Base64Url("abc"),
			createHash("sha256").update("abc").digest("base64url")
		);
	});

	it("compare strings without stopping at the first difference", () => {
		assert.isOk(constantTimeEqual("same", "same"));
		assert.isNotOk(constantTimeEqual("same", "sane"));
		assert.isNotOk(constantTimeEqual("same", "same-but-longer"));
	});

	it.effect("make random tokens of the size asked for", () =>
		Effect.gen(function* () {
			assert.match(yield* randomToken(32), /^[\w-]{43}$/u);
			assert.match(yield* randomHex(6), /^[0-9a-f]{12}$/u);
			assert.notStrictEqual(yield* randomToken(32), yield* randomToken(32));
		}).pipe(withRandom)
	);
});
