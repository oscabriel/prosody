import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";

/** One try at aligning a pair, as the press receives it. */
export const AlignRequest = Schema.Struct({
	work: WorkId,
	attempt: Schema.Int,
	shelfmark: Shelfmark,
	text: Schema.String,
	audio: Schema.String,
});

export type AlignRequest = typeof AlignRequest.Type;

/**
 * Whatever aligns a book's text with its audio. Asking queues the work and returns; the answer comes
 * back later as `RecordAlignment` or `RecordAlignmentFailed`.
 */
export class Aligner extends Domain.ExternalSystem(
	"Aligner",
	{ align: { args: AlignRequest.fields } },
	{ description: "The press, which aligns a pair and makes its reading copy." }
) {}
