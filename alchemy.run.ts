import * as Docker from "@alchemy.run/docker";
import * as Cluster from "@alchemy.run/effect-cluster";
import Press from "@prosody/press/Press";
import Api from "@prosody/server/Api";
import { API_ALIAS, Front } from "@prosody/server/Front";
import { relayOnHost } from "@prosody/server/Host";
import * as Alchemy from "alchemy";
import { Effect, Layer } from "effect";

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

		const address = yield* relayOnHost;

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
			ports: [{ external: address, internal: 3000 }],
			restart: "unless-stopped",
			start: true,
		});

		return { api: api.name, press: press.name, relay: relay.name };
	})
);
