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
 * Make a reading copy of a work that has only its text or only its audio. The press sends it when a
 * walk finds one edition in a work's folder. Sending it again for the same file changes nothing; a
 * file of another size, as when a broken file is replaced under the same name, is copied again.
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
