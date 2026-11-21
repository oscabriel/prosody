import type { PressApi } from "@prosody/domain/PressApi.api";
import { grabOf, progressOf, signIn } from "@prosody/server/QBittorrent";
import { DateTime, Effect, Option } from "effect";

/** The model's door for the press. */
type Model = Effect.Success<ReturnType<typeof PressApi.clientHttp>>;

/**
 * Ask qBittorrent how each grab's download goes, and tell the model: how much has come and whether
 * it stalled, or that it has all come and how long it has seeded. The model records only what is
 * new, so the same news every minute changes nothing.
 */
export const watchDownloads = Effect.fn("Press.watch")(function* (
	press: Model
) {
	const qbittorrent = yield* signIn();
	const now = DateTime.toEpochMillis(yield* DateTime.now) / 1000;

	const { category } = qbittorrent;

	for (const torrent of yield* qbittorrent.torrents({ category })) {
		const grab = grabOf(torrent);
		const { percent, stall, payload, hours } = progressOf(torrent, now);

		if (Option.isSome(grab) && Option.isSome(payload)) {
			yield* press.RecordPayloadArrived(grab.value, { payload: payload.value });
			yield* press.RecordSeeding(grab.value, { hours });
		} else if (Option.isSome(grab)) {
			yield* press.RecordProgress(grab.value, { percent });

			if (Option.isSome(stall)) {
				yield* press.RecordStall(grab.value, { reason: stall.value });
			}
		}
	}
});
