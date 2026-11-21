import { Schema } from "effect";
import { RpcMiddleware } from "effect/rpc";

import type { Device } from "./Device.context.ts";

export class SignedOut extends Schema.TaggedError<SignedOut>()(
	"SignedOut",
	{},
	{ httpApiStatus: 401 }
) {}

export class Session extends RpcMiddleware.Service<
	Session,
	{ provides: Device }
>()("Prosody/Session", { error: SignedOut }) {}
