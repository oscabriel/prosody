import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

export class Device extends Domain.RequestContext<Device>()(
	"Prosody/Device",
	Schema.String
) {}
