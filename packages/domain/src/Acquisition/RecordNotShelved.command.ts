import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { GrabId } from "./Grab.id.ts";

/** The payload's edition is not on the shelf yet, for this reason. */
export class PayloadNotShelved extends Domain.Event("PayloadNotShelved", {
	reason: Schema.String,
}) {}

/**
 * The press reports it could not shelve the payload: the library did not answer, and it will try
 * again, or the payload holds no edition it can shelve. The same reason twice records nothing.
 */
export class RecordNotShelved extends Domain.Command("RecordNotShelved", {
	target: GrabId,
	input: { reason: Schema.String },
	events: [PayloadNotShelved],
}) {}
