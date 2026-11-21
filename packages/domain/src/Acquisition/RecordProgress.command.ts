import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

export class DownloadProgressed extends Domain.Event("DownloadProgressed", {
	percent: Schema.Int,
}) {}

export class RecordProgress extends Domain.Command("RecordProgress", {
	target: GrabId,
	input: { percent: Schema.Int },
	events: [DownloadProgressed],
}) {}
