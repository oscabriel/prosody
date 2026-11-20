import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Downloads } from "./Downloads.external.ts";
import { Grab } from "./Grab.aggregate.ts";
import { PayloadReleased } from "./ReleasePayload.command.ts";

/**
 * Whenever a payload is released, have Downloads stop seeding it. If Downloads can't be reached, the
 * torrent stays in its list, seeding on, to remove there.
 */
export class Releasing extends Domain.Policy(
	"Releasing",
	{ from: Grab, on: [PayloadReleased] },
	{ description: "Has Downloads stop seeding each payload you release." }
) {}

export const ReleasingLive = Releasing.toLayer(
	Effect.gen(function* () {
		const downloads = yield* Downloads;

		return Effect.fn("Releasing")(function* ({ source }) {
			yield* downloads
				.remove({ grab: source.id })
				.pipe(Effect.catchTag("DownloadsFailed", Effect.logWarning));
		});
	})
);
