import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { ReaderId, Role } from "./Reader.id.ts";

export const ActorInfo = Schema.Struct({
	reader: ReaderId,
	role: Role,
	device: Schema.String,
});

export type ActorInfo = typeof ActorInfo.Type;

export class Actor extends Domain.RequestContext<Actor>()(
	"Prosody/Actor",
	ActorInfo
) {}
