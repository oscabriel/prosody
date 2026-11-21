import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";

/** The reading copy is made. `chapters` is how many the reading room lists: sections of text, or chapters of audio. */
export class CopyMade extends Domain.Event("CopyMade", {
	chapters: Schema.Int,
}) {}

/**
 * The press reports a finished copy. It reports a fact, so it never rejects; an answer to a try that
 * is no longer running records nothing.
 */
export class RecordCopy extends Domain.Command("RecordCopy", {
	target: WorkId,
	input: { attempt: Schema.Int, chapters: Schema.Int },
	events: [CopyMade],
}) {}
