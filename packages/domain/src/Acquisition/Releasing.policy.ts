import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Downloads } from "./Downloads.external.ts";
import { Grab } from "./Grab.aggregate.ts";
import { PayloadReleased } from "./ReleasePayload.command.ts";

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
