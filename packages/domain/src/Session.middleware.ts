import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";
import { RpcMiddleware } from "effect/rpc";

import { Actor } from "./Actor.context.ts";
import type { ReaderId } from "./Reader.id.ts";

export class SignedOut extends Schema.TaggedError<SignedOut>()(
	"SignedOut",
	{},
	{ httpApiStatus: 401 }
) {}

export class Forbidden extends Domain.Rejection(
	"Forbidden",
	{},
	{ httpApiStatus: 403 }
) {}

export class Session extends RpcMiddleware.Service<
	Session,
	{ provides: Actor }
>()("Prosody/Session", { error: SignedOut }) {}

export const asAdmin = Effect.gen(function* () {
	const actor = yield* Actor;

	if (actor.role !== "admin") {
		return yield* new Forbidden();
	}

	return actor;
});

export const asReader = Effect.fn(function* (reader: ReaderId) {
	const actor = yield* Actor;

	if (actor.reader !== reader) {
		return yield* new Forbidden();
	}

	return actor;
});
