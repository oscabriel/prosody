import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";

/** A work's text and audio, joined. The files are named as the work's editions name them. */
export class EditionsPaired extends Domain.Event("EditionsPaired", {
	shelfmark: Shelfmark,
	text: Schema.String,
	audio: Schema.String,
}) {}

/** The press is to align the pair. Each try has its own number, so a late answer to an old try is ignored. */
export class AlignmentStarted extends Domain.Event("AlignmentStarted", {
	attempt: Schema.Int,
}) {}

/**
 * Join a work's text and audio, and start aligning them. The press sends it when a walk finds both
 * editions in one folder. Pairing again changes nothing.
 */
export class PairEditions extends Domain.Command("PairEditions", {
	target: WorkId,
	input: {
		shelfmark: Shelfmark,
		text: Schema.String,
		audio: Schema.String,
	},
	events: [EditionsPaired, AlignmentStarted],
}) {}
