import * as DomainCluster from "@alchemy.run/domain/EffectCluster";
import * as ClusterDocker from "@alchemy.run/effect-cluster/Docker";
import { Prosody, ProsodyHandlers } from "@prosody/domain/Prosody.model";
import { Effect, Layer } from "effect";

import { PressAligner } from "./PressAligner.ts";
import { PressCopier } from "./PressCopier.ts";
import { ProwlarrIndexer, ProwlarrSettings } from "./ProwlarrIndexer.ts";

/** Postgres on the host's swarm: where the cluster keeps every event and every view. */
export const Database = ClusterDocker.Database("Cluster");

/**
 * One runner: the container that hosts the model. Its policies search Prowlarr, so it reads
 * Prowlarr's settings as it is declared, and the deploy gives them to the runner.
 */
export const Runners = ClusterDocker.SwarmPool("Runners", { replicas: 1 }).pipe(
	Layer.provide(Database),
	Layer.tap(() => Effect.orDie(ProwlarrSettings))
);

/**
 * The model on Effect Cluster. The runner loads this module's default export to host the model;
 * anything else that provides it, like the Api, reaches the model through the runner. Its policies
 * run on the runner: they search Prowlarr through the ProwlarrIndexer, and reach the press through
 * the PressAligner and the PressCopier.
 */
export default Prosody.layer(ProsodyHandlers).pipe(
	Layer.provide(Layer.mergeAll(ProwlarrIndexer, PressAligner, PressCopier)),
	Layer.provide(
		DomainCluster.layerEntities({
			name: "Prosody",
			main: import.meta.url,
			pool: Runners,
		})
	)
);
