import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";

export class DownloadStarted extends Domain.Event("DownloadStarted", {
	work: WorkId,
	release: Release,
}) {}

export class StartDownload extends Domain.Command("StartDownload", {
	target: GrabId,
	input: { work: WorkId, release: Release },
	events: [DownloadStarted],
}) {}
