import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

/**
 * Which of your devices is asking: its machine name in the tailnet, such as `iphone`. The Session
 * provides it to everything a reader sends, and a kept place records it.
 */
export class Device extends Domain.RequestContext<Device>()(
	"Prosody/Device",
	Schema.String
) {}
