import * as DomainCluster from "@alchemy.run/domain/EffectCluster";
import * as ClusterDocker from "@alchemy.run/effect-cluster/Docker";
import { Prosody, ProsodyHandlers } from "@prosody/domain/Prosody.model";
import { Layer } from "effect";

import { PressAligner } from "./PressAligner.ts";

/** Postgres on the host's swarm: where the cluster keeps every event and every view. */
export const Database = ClusterDocker.Database("Cluster");

/** One runner: the container that hosts the model. */
export const Runners = ClusterDocker.SwarmPool("Runners", { replicas: 1 }).pipe(
	Layer.provide(Database)
);

/**
 * The model on Effect Cluster. The runner loads this module's default export to host the model;
 * anything else that provides it, like the Api, reaches the model through the runner. Its policies
 * run on the runner, and reach the press through the PressAligner.
 */
export default Prosody.layer(ProsodyHandlers).pipe(
	Layer.provide(PressAligner),
	Layer.provide(
		DomainCluster.layerEntities({
			name: "Prosody",
			main: import.meta.url,
			pool: Runners,
		})
	)
);
