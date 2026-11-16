import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "./Work.id.ts";

/** A work has at most one edition of each kind: its text and its audio. */
export const EditionKind = Schema.Literals(["text", "audio"]);

export type EditionKind = typeof EditionKind.Type;

export class EditionShelved extends Domain.Event("EditionShelved", {
	kind: EditionKind,
	file: Schema.String,
	bytes: Schema.Int,
}) {}

/** The work has not been catalogued, so there is nowhere to shelve an edition. */
export class NotCatalogued extends Domain.Rejection(
	"NotCatalogued",
	{},
	{ httpApiStatus: 404 }
) {}

/** Another file already holds this kind of edition. `file` is the evidence. */
export class AlreadyShelved extends Domain.Rejection(
	"AlreadyShelved",
	{ kind: EditionKind, file: Schema.String },
	{ httpApiStatus: 409 }
) {}

/** Record a file in the library as a work's text or audio. */
export class ShelveEdition extends Domain.Command("ShelveEdition", {
	target: WorkId,
	input: { kind: EditionKind, file: Schema.String, bytes: Schema.Int },
	events: [EditionShelved],
	rejects: [NotCatalogued, AlreadyShelved],
}) {}
