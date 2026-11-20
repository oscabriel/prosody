import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { EditionKind } from "../Library/ShelveEdition.command.ts";
import { WorkId } from "../Library/Work.id.ts";

/**
 * The press is to make a reading copy of the work's one edition. Each try has its own number, so a
 * late answer to an old try is ignored.
 */
export class CopyStarted extends Domain.Event("CopyStarted", {
	shelfmark: Shelfmark,
	kind: EditionKind,
	file: Schema.String,
	bytes: Schema.Int,
	attempt: Schema.Int,
}) {}

/**
 * The edition a work's reading copy is made from when the work has no pair: its text if it has one,
 * since a text is marked sentence by sentence, else its pages, else its audio. A pair has none: the
 * Narration makes its copy.
 */
export const editionToCopy = (
	has: (kind: EditionKind) => boolean
): EditionKind | undefined =>
	has("text") && has("audio")
		? undefined
		: (["text", "pages", "audio"] as const).find(has);

/**
 * Make a reading copy of a work's one edition: its text alone, its pages, or its audio alone. The
 * press sends it on every walk for the edition `editionToCopy` picks. Sending it again for the same
 * file changes nothing; a file of another size, as when a broken file is replaced under the same
 * name, is copied again.
 */
export class CopyEdition extends Domain.Command("CopyEdition", {
	target: WorkId,
	input: {
		shelfmark: Shelfmark,
		kind: EditionKind,
		file: Schema.String,
		bytes: Schema.Int,
	},
	events: [CopyStarted],
}) {}
