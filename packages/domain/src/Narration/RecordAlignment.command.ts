import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

/**
 * The text and audio are aligned, and the reading copy is made. `matched` of the book's `sentences`
 * were found in the audio. The spot check listened to `checked` of them and heard the right words in
 * `heard`.
 */
export class NarrationAligned extends Domain.Event("NarrationAligned", {
	sentences: Schema.Int,
	matched: Schema.Int,
	checked: Schema.Int,
	heard: Schema.Int,
}) {}

/**
 * The press reports a finished alignment. It reports a fact, so it never rejects; an answer to a try
 * that is no longer running records nothing.
 */
export class RecordAlignment extends Domain.Command("RecordAlignment", {
	target: WorkId,
	input: {
		attempt: Schema.Int,
		sentences: Schema.Int,
		matched: Schema.Int,
		checked: Schema.Int,
		heard: Schema.Int,
	},
	events: [NarrationAligned],
}) {}
