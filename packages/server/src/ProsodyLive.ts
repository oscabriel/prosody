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

export const Database = ClusterDocker.Database("Cluster");

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
