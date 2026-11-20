import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { EditionKind } from "../Library/ShelveEdition.command.ts";
import { WorkId } from "../Library/Work.id.ts";

/** One try at copying a work's one edition, as the press receives it. */
export const CopyRequest = Schema.Struct({
	work: WorkId,
	attempt: Schema.Int,
	shelfmark: Shelfmark,
	kind: EditionKind,
	file: Schema.String,
});

export type CopyRequest = typeof CopyRequest.Type;

/**
 * Whatever makes a reading copy of a work with only its text or only its audio. Asking queues the
 * work and returns; the answer comes back later as `RecordCopy` or `RecordCopyFailed`.
 */
export class Copier extends Domain.ExternalSystem(
	"Copier",
	{ copy: { args: CopyRequest.fields } },
	{ description: "The press, which makes a reading copy of an edition alone." }
) {}
