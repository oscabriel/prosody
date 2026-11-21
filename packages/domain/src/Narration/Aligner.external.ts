import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";

export const AlignRequest = Schema.Struct({
	work: WorkId,
	attempt: Schema.Int,
	shelfmark: Shelfmark,
	text: Schema.String,
	audio: Schema.String,
});

export type AlignRequest = typeof AlignRequest.Type;

export class Aligner extends Domain.ExternalSystem(
	"Aligner",
	{ align: { args: AlignRequest.fields } },
	{ description: "The press, which aligns a pair and makes its reading copy." }
) {}
