import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";

export class DownloadsFailed extends Domain.Rejection("DownloadsFailed", {
	reason: Schema.String,
}) {}

export class Downloads extends Domain.ExternalSystem(
	"Downloads",
	{
		download: {
			args: { grab: GrabId, release: Release },
			error: DownloadsFailed,
		},
		remove: { args: { grab: GrabId }, error: DownloadsFailed },
	},
	{
		description:
			"qBittorrent, which downloads each grab and seeds its payload.",
	}
) {}
