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

export const TAILSCALE = "/var/run/tailscale";

const LOCAL_API = "http://local-tailscaled.sock/localapi/v0";

const Status = Schema.Struct({
	Self: Schema.Struct({ UserID: Schema.Int }),
});

export const Peer = Schema.Struct({
	Node: Schema.Struct({
		ComputedName: Schema.String,
		User: Schema.Int,
		Tags: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
	}),
});

export type Peer = typeof Peer.Type;

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

export class Refused extends Schema.TaggedError<Refused>()("Refused", {
	reason: Schema.String,
}) {}

const KEEP_FOR = "30 seconds";

export class Tailscale extends Context.Service<
	Tailscale,
	{
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

			const peer =
				answer.status === 200
					? Option.some(yield* HttpClientResponse.schemaBodyJson(Peer)(answer))
					: Option.none();

			return admission(status.Self.UserID, peer);
		});

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
