import * as Domain from "@alchemy.run/domain";

import { Session } from "../Session.middleware.ts";
import { GrabId, GrabStatus } from "./Grab.id.ts";

export class GrabAbandoned extends Domain.Event("GrabAbandoned", {}) {}

/** The grab is not downloading. `status` is where it stands instead. */
export class NotDownloading extends Domain.Rejection(
	"NotDownloading",
	{ status: GrabStatus },
	{ httpApiStatus: 409 }
) {}

/**
 * Give up on a grab that has not finished. Prosody stops watching it; the torrent and what came of
 * it stay in qBittorrent, which owes the tracker whatever it owes.
 */
export class AbandonGrab extends Domain.Command("AbandonGrab", {
	target: GrabId,
	middleware: [Session],
	events: [GrabAbandoned],
	rejects: [NotDownloading],
}) {}
