import { createHash, scrypt, timingSafeEqual } from "node:crypto";

import { Effect, Predicate, Schema } from "effect";
import { SecureRandom } from "effect/crypto";

export class CryptoFailed extends Schema.TaggedError<CryptoFailed>()(
	"CryptoFailed",
	{ reason: Schema.String }
) {}

const COST = 16_384;

const BLOCK_SIZE = 8;

const PARALLELISM = 5;

const KEY_LENGTH = 64;

const SALT_LENGTH = 16;

const MAX_COST = 1_048_576;

const STORED =
	/^scrypt\$(?<cost>\d+)\$(?<blockSize>\d+)\$(?<parallelism>\d+)\$(?<salt>[0-9a-f]+)\$(?<key>[0-9a-f]+)$/u;

const DUMMY = `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${"0".repeat(SALT_LENGTH * 2)}$${"0".repeat(KEY_LENGTH * 2)}`;

interface ScryptParams {
	readonly cost: number;
	readonly blockSize: number;
	readonly parallelism: number;
}

const derive = (
	password: string,
	salt: Uint8Array,
	length: number,
	params: ScryptParams
) =>
	Effect.callback<Buffer, CryptoFailed>((resume) => {
		scrypt(
			password.normalize("NFKC"),
			salt,
			length,
			{
				N: params.cost,
				r: params.blockSize,
				p: params.parallelism,
				maxmem: 256 * params.cost * params.blockSize,
			},
			(failure, key) => {
				resume(
					Predicate.isNullish(failure)
						? Effect.succeed(key)
						: Effect.fail(
								new CryptoFailed({
									reason: `scrypt failed: ${failure.message}`,
								})
							)
				);
			}
		);
	});

export const hexOf = (bytes: Uint8Array): string =>
	Buffer.from(bytes).toString("hex");

export const base64UrlOf = (bytes: Uint8Array): string =>
	Buffer.from(bytes).toString("base64url");

export const hashPassword = Effect.fn("Crypto.hashPassword")(function* (
	password: string
) {
	const random = yield* SecureRandom.SecureRandom;
	const salt = yield* random.randomBytes(SALT_LENGTH);

	const key = yield* derive(password, salt, KEY_LENGTH, {
		cost: COST,
		blockSize: BLOCK_SIZE,
		parallelism: PARALLELISM,
	});

	return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${hexOf(salt)}$${hexOf(key)}`;
});

export const verifyPassword = Effect.fn("Crypto.verifyPassword")(function* (
	password: string,
	stored: string
) {
	const parts = STORED.exec(stored)?.groups;

	if (parts === undefined) {
		return false;
	}

	const { cost, blockSize, parallelism, salt, key } = parts;

	const params = {
		cost: Number(cost),
		blockSize: Number(blockSize),
		parallelism: Number(parallelism),
	};

	if (
		params.cost < 2 ||
		params.cost > MAX_COST ||
		params.blockSize < 1 ||
		params.parallelism < 1 ||
		salt === undefined ||
		key === undefined ||
		key.length % 2 !== 0
	) {
		return false;
	}

	const expected = Buffer.from(key, "hex");

	const derived = yield* derive(
		password,
		Buffer.from(salt, "hex"),
		expected.length,
		params
	);

	return (
		derived.length === expected.length && timingSafeEqual(derived, expected)
	);
});

export const dummyVerifyPassword = Effect.fn("Crypto.dummyVerifyPassword")(
	function* (password: string) {
		yield* verifyPassword(password, DUMMY);

		return false;
	}
);

export const sha256Hex = (value: string): string =>
	createHash("sha256").update(value, "utf-8").digest("hex");

export const sha256Base64Url = (value: string): string =>
	createHash("sha256").update(value, "utf-8").digest("base64url");

export const randomToken = Effect.fn("Crypto.randomToken")(function* (
	bytes: number
) {
	const random = yield* SecureRandom.SecureRandom;

	return base64UrlOf(yield* random.randomBytes(bytes));
});

export const randomHex = Effect.fn("Crypto.randomHex")(function* (
	bytes: number
) {
	const random = yield* SecureRandom.SecureRandom;

	return hexOf(yield* random.randomBytes(bytes));
});

export const constantTimeEqual = (a: string, b: string): boolean => {
	const left = Buffer.from(a, "utf-8");
	const right = Buffer.from(b, "utf-8");

	return left.length === right.length && timingSafeEqual(left, right);
};
