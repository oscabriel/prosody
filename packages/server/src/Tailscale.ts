import { BunHttpClient } from "@effect/platform-bun";
import {
	Cache,
	Context,
	Effect,
	Exit,
	Layer,
	Option,
	Result,
	Schema,
} from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

/**
 * tailscaled's folder on the host, mounted into the Api at the same path for the socket in it.
 * systemd removes the folder when tailscaled stops and makes a new one when it starts, so the Api
 * checks the socket is still there (its healthcheck).
 */
export const TAILSCALE = "/var/run/tailscale";

/** tailscaled's own Api, on its socket. The host name is the one it expects. */
const LOCAL_API = "http://local-tailscaled.sock/localapi/v0";

/** The part of tailscaled's status Prosody reads: who owns this machine. */
const Status = Schema.Struct({
	Self: Schema.Struct({ UserID: Schema.Int }),
});

/** The part of tailscaled's answer to "who is at this address" that Prosody reads. */
export const Peer = Schema.Struct({
	Node: Schema.Struct({
		/** The machine's name in the tailnet, such as `iphone`. */
		ComputedName: Schema.String,
		User: Schema.Int,
		Tags: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
	}),
});

export type Peer = typeof Peer.Type;

/**
 * Who is let in: a machine of the person who owns the host. A tagged machine belongs to no one,
 * so it never is. The answer is the machine's name, or why it was refused.
 */
export const admission = (
	owner: number,
	peer: Option.Option<Peer>
): Result.Result<string, string> => {
	if (Option.isNone(peer)) {
		return Result.fail("not a machine in the tailnet");
	}

	const { ComputedName, User, Tags } = peer.value.Node;

	if ((Tags ?? []).length > 0) {
		return Result.fail(`${ComputedName} is a tagged machine`);
	}

	return User === owner
		? Result.succeed(ComputedName)
		: Result.fail(`${ComputedName} belongs to someone else`);
};

/** A peer that is not let in, and why. The reason goes to the log, never to the peer. */
export class Refused extends Schema.TaggedError<Refused>()("Refused", {
	reason: Schema.String,
}) {}

/** How long an answer for an address is kept: a page loads many files, and each is asked about. */
const KEEP_FOR = "30 seconds";

/**
 * Says who is at a tailnet address, by asking tailscaled. This is the whole of signing in: the
 * tailnet already knows each of your machines, so there is nothing to sign in with.
 */
export class Tailscale extends Context.Service<
	Tailscale,
	{
		/** The name of your machine at `address`, or Refused. */
		readonly admit: (address: string) => Effect.Effect<string, Refused>;
	}
>()("@prosody/server/Tailscale", {
	make: Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;

		const ask = Effect.fn("Tailscale.ask")(function* (address: string) {
			const status = yield* client
				.get(`${LOCAL_API}/status?peers=false`)
				.pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Status)));

			const answer = yield* client.get(`${LOCAL_API}/whois`, {
				urlParams: { addr: address },
			});

			// Anything tailscaled does not know, it answers 404, or 400 when it is not an address.
			const peer =
				answer.status === 200
					? Option.some(yield* HttpClientResponse.schemaBodyJson(Peer)(answer))
					: Option.none();

			return admission(status.Self.UserID, peer);
		});

		// A refusal is kept like an admission; tailscaled not answering is not kept at all.
		const answers = yield* Cache.makeWith(ask, {
			capacity: 256,
			timeToLive: (exit) => (Exit.isSuccess(exit) ? KEEP_FOR : 0),
		});

		const admit = Effect.fn("Tailscale.admit")(function* (address: string) {
			const answer = yield* Cache.get(answers, address).pipe(
				Effect.mapError(
					(error) =>
						new Refused({
							reason: `tailscaled did not answer: ${error.message}`,
						})
				)
			);

			return yield* Result.match(answer, {
				onSuccess: Effect.succeed,
				onFailure: (reason) => Effect.fail(new Refused({ reason })),
			});
		});

		return { admit };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(
			BunHttpClient.layerOptions({ unix: `${TAILSCALE}/tailscaled.sock` })
		)
	);
}
