import * as DomainCluster from "@alchemy.run/domain/EffectCluster";
import * as ClusterDocker from "@alchemy.run/effect-cluster/Docker";
import { Prosody, ProsodyHandlers } from "@prosody/domain/Prosody.model";
import { Effect, Layer } from "effect";

import { OpenLibraryMetadata } from "./OpenLibraryMetadata.ts";
import { PressAligner } from "./PressAligner.ts";
import { PressCopier } from "./PressCopier.ts";
import { PressStacks } from "./PressStacks.ts";
import { ProwlarrIndexer, ProwlarrSettings } from "./ProwlarrIndexer.ts";
import { QBittorrentSettings } from "./QBittorrent.ts";
import { QBittorrentDownloads } from "./QBittorrentDownloads.ts";

/** Postgres on the host's swarm: where the cluster keeps every event and every view. */
export const Database = ClusterDocker.Database("Cluster");

/**
 * One runner: the container that hosts the model. Its policies search Prowlarr and download with
 * qBittorrent, so it reads their settings as it is declared, and the deploy gives them to the
 * runner.
 */
export const Runners = ClusterDocker.SwarmPool("Runners", { replicas: 1 }).pipe(
	Layer.provide(Database),
	Layer.tap(() =>
		Effect.orDie(
			Effect.all([ProwlarrSettings, QBittorrentSettings], {
				concurrency: "unbounded",
			})
		)
	)
);

/**
 * The model on Effect Cluster. The runner loads this module's default export to host the model;
 * anything else that provides it, like the Api, reaches the model through the runner. Its policies
 * run on the runner: they search Prowlarr through the ProwlarrIndexer, download with qBittorrent
 * through the QBittorrentDownloads, look a wanted book up through the OpenLibraryMetadata, and reach
 * the press through the PressStacks, the PressAligner and the PressCopier.
 */
export default Prosody.layer(ProsodyHandlers).pipe(
	Layer.provide(
		Layer.mergeAll(
			ProwlarrIndexer,
			QBittorrentDownloads,
			OpenLibraryMetadata,
			PressStacks,
			PressAligner,
			PressCopier
		)
	),
	Layer.provide(
		DomainCluster.layerEntities({
			name: "Prosody",
			main: import.meta.url,
			pool: Runners,
		})
	)
);
