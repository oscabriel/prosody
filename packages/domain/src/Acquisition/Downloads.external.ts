import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";

/** Downloads could not do what was asked, for this reason. */
export class DownloadsFailed extends Domain.Rejection("DownloadsFailed", {
	reason: Schema.String,
}) {}

/**
 * Whatever downloads a release and seeds it, knowing each by its grab. How a download goes comes
 * back later, from the press, which watches it.
 */
export class Downloads extends Domain.ExternalSystem(
	"Downloads",
	{
		/** Start a grab's download: added if it has not begun, started again and asking for peers if it has. */
		download: {
			args: { grab: GrabId, release: Release },
			error: DownloadsFailed,
		},
		/** Stop seeding a grab's payload. Its files stay. */
		remove: { args: { grab: GrabId }, error: DownloadsFailed },
	},
	{
		description:
			"qBittorrent, which downloads each grab and seeds its payload.",
	}
) {}
