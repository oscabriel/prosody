import {
	Downloads,
	DownloadsFailed,
} from "@prosody/domain/Acquisition/Downloads.external";
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { torrentOf } from "./ProwlarrIndexer.ts";
import { signIn } from "./QBittorrent.ts";

const failed = ({ reason }: { readonly reason: string }) =>
	new DownloadsFailed({ reason });

/**
 * Downloads, played by qBittorrent. A grab's torrent
 * is fetched through Prowlarr and added under the books category, tagged with the grab's id, by
 * which the press watches it and Prosody finds it again. Nothing here ever deletes a file.
 */
export const QBittorrentDownloads = Downloads.toLayer(
	Effect.gen(function* () {
		const withClient = Effect.provideService(
			HttpClient.HttpClient,
			yield* HttpClient.HttpClient
		);

		return {
			download: Effect.fn("QBittorrent.download")(
				function* ({ grab, release }) {
					const qbittorrent = yield* signIn();
					const [torrent] = yield* qbittorrent.torrents({ tag: grab });

					if (torrent !== undefined) {
						yield* qbittorrent.send("/api/v2/torrents/start", {
							hashes: torrent.hash,
						});

						return yield* qbittorrent.send("/api/v2/torrents/reannounce", {
							hashes: torrent.hash,
						});
					}

					if (release.link === null) {
						return yield* new DownloadsFailed({
							reason: "This offer is older than grabbing: search again",
						});
					}

					return yield* qbittorrent.add(yield* torrentOf(release.link), grab);
				},
				Effect.mapError(failed),
				withClient
			),
			remove: Effect.fn("QBittorrent.remove")(
				function* ({ grab }) {
					const qbittorrent = yield* signIn();

					for (const torrent of yield* qbittorrent.torrents({ tag: grab })) {
						yield* qbittorrent.send("/api/v2/torrents/delete", {
							hashes: torrent.hash,
							deleteFiles: "false",
						});
					}
				},
				Effect.mapError(failed),
				withClient
			),
		};
	})
).pipe(Layer.provide(FetchHttpClient.layer));
