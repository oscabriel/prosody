import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

/** More of the payload has come: this much of it, in whole percent. */
export class DownloadProgressed extends Domain.Event("DownloadProgressed", {
	percent: Schema.Int,
}) {}

/**
 * The press reports how much of a payload has come. It records only more than before, and a grab
 * that was stalled and moves again is downloading.
 */
export class RecordProgress extends Domain.Command("RecordProgress", {
	target: GrabId,
	input: { percent: Schema.Int },
	events: [DownloadProgressed],
}) {}
