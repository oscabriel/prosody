import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "../Acquisition/Grab.id.ts";
import { Shelfmark } from "./Shelfmark.ts";
import { EditionKind } from "./ShelveEdition.command.ts";
import { WorkId } from "./Work.id.ts";

/** One payload to shelve, as the press receives it. */
export const ShelveRequest = Schema.Struct({
	grab: GrabId,
	/** The work whose folder it goes in. */
	work: WorkId,
	kind: EditionKind,
	/** Its file or folder in the downloads. */
	payload: Schema.String,
	shelfmark: Shelfmark,
});

export type ShelveRequest = typeof ShelveRequest.Type;

/**
 * The library, and the one thing that writes to it. Asking queues the payload and returns; the
 * edition is copied into the work's folder, never moved, once the library answers, and the answer
 * comes back later as `RecordShelved` or `RecordNotShelved`.
 */
export class Stacks extends Domain.ExternalSystem(
	"Stacks",
	{ shelve: { args: ShelveRequest.fields } },
	{
		description:
			"The press, which copies a payload's edition into the library.",
	}
) {}
