import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import Press from "@prosody/press/Press";
import Api from "@prosody/server/Api";
import { API_ALIAS, Front } from "@prosody/server/Front";
import * as Alchemy from "alchemy";
import { Effect, Layer } from "effect";

/**
 * Loopback only. Caddy sends prosody.example.com here, after asking `/auth` whether the request is
 * from one of your devices; the dev server calls it the same way.
 */
const RELAY = "127.0.0.1:3023";

/**
 * Prosody on the host's swarm: a Postgres, one runner hosting the model, the Api and a relay.
 * The swarm itself was made by hand (`docker swarm init`) and is not this Stack's to destroy.
 */
export default Alchemy.Stack(
	"Prosody",
	{
		providers: Layer.mergeAll(Docker.providers(), Cluster.providers()),
		state: Alchemy.localState(),
	},
	Effect.gen(function* () {
		const front = yield* Front;
		const api = yield* Api;
		const press = yield* Press;

		// Caddy cannot join a swarm network, and a swarm service's published port listens on every
		// interface. This plain container is the one door: it joins the Front network and listens on
		// the loopback address alone.
		const relay = yield* Docker.Container("Relay", {
			image: "caddy:2-alpine",
			command: [
				"caddy",
				"reverse-proxy",
				"--from",
				":3000",
				"--to",
				`http://${API_ALIAS}:3000`,
			],
			networks: [{ name: front.name }],
			ports: [{ external: RELAY, internal: 3000 }],
			restart: "unless-stopped",
			start: true,
		});

		return { api: api.name, press: press.name, relay: relay.name };
	})
);
