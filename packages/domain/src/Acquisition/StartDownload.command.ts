import * as Domain from "@alchemy.run/domain";

import { WorkId } from "../Library/Work.id.ts";
import { GrabId } from "./Grab.id.ts";
import { Release } from "./Release.ts";

/** The release is to be downloaded, for this work. */
export class DownloadStarted extends Domain.Event("DownloadStarted", {
	work: WorkId,
	release: Release,
}) {}

/**
 * Open the grab of a release you grabbed, and start downloading it. The Grabbing policy sends it;
 * sending it again changes nothing.
 */
export class StartDownload extends Domain.Command("StartDownload", {
	target: GrabId,
	input: { work: WorkId, release: Release },
	events: [DownloadStarted],
}) {}
