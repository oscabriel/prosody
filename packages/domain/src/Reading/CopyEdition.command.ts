import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { EditionKind } from "../Library/ShelveEdition.command.ts";
import { WorkId } from "../Library/Work.id.ts";

export class CopyStarted extends Domain.Event("CopyStarted", {
	shelfmark: Shelfmark,
	kind: EditionKind,
	file: Schema.String,
	bytes: Schema.Int,
	attempt: Schema.Int,
}) {}

export const editionToCopy = (
	has: (kind: EditionKind) => boolean
): EditionKind | undefined =>
	has("text") && has("audio")
		? undefined
		: (["text", "pages", "audio"] as const).find(has);

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
