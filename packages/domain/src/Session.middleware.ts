import { Schema } from "effect";
import { RpcMiddleware } from "effect/rpc";

import type { Device } from "./Device.context.ts";

/** The request did not come through Caddy, so no one has said who sent it. */
export class SignedOut extends Schema.TaggedError<SignedOut>()(
	"SignedOut",
	{},
	{ httpApiStatus: 401 }
) {}

/**
 * Admits what a reader sends and provides which device sent it. Caddy asks Tailscale about every
 * request before it lets one through, and names the device on it; a request without that name is
 * SignedOut.
 */
export class Session extends RpcMiddleware.Service<
	Session,
	{ provides: Device }
>()("Prosody/Session", { error: SignedOut }) {}
