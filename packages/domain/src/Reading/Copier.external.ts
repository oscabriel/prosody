import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { EditionKind } from "../Library/ShelveEdition.command.ts";
import { WorkId } from "../Library/Work.id.ts";

export const CopyRequest = Schema.Struct({
	work: WorkId,
	attempt: Schema.Int,
	shelfmark: Shelfmark,
	kind: EditionKind,
	file: Schema.String,
});

export type CopyRequest = typeof CopyRequest.Type;

export class Copier extends Domain.ExternalSystem(
	"Copier",
	{ copy: { args: CopyRequest.fields } },
	{ description: "The press, which makes a reading copy of an edition alone." }
) {}
