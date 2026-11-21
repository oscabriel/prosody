import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "../Acquisition/Grab.id.ts";
import { Release } from "../Acquisition/Release.ts";
import { Shelfmark } from "./Shelfmark.ts";
import { WorkId } from "./Work.id.ts";

export const ShelveRequest = Schema.Struct({
	grab: GrabId,
	work: WorkId,
	kind: Release.fields.kind,
	payload: Schema.String,
	shelfmark: Shelfmark,
});

export type ShelveRequest = typeof ShelveRequest.Type;

export class Stacks extends Domain.ExternalSystem(
	"Stacks",
	{ shelve: { args: ShelveRequest.fields } },
	{
		description:
			"The press, which copies a payload's edition into the library.",
	}
) {}
