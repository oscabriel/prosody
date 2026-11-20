import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Downloads } from "./Downloads.external.ts";
import { Grab } from "./Grab.aggregate.ts";
import { RecordStall } from "./RecordStall.command.ts";
import { GrabResumed } from "./ResumeGrab.command.ts";
import { DownloadStarted } from "./StartDownload.command.ts";

/**
 * Whenever a grab starts or is resumed, have Downloads download it. A download that can't be
 * started is a stall, with the reason, which waits for you to resume it.
 */
export class Downloading extends Domain.Policy(
	"Downloading",
	{ from: Grab, on: [DownloadStarted, GrabResumed] },
	{ description: "Hands each grab to Downloads." }
) {}

export const DownloadingLive = Downloading.toLayer(
	Effect.gen(function* () {
		const downloads = yield* Downloads;
		const grabs = yield* Grab;

		return Effect.fn("Downloading")(function* ({ source }) {
			const { release } = yield* grabs.get(source);

			if (release === null) {
				return;
			}

			yield* downloads
				.download({ grab: source.id, release })
				.pipe(
					Effect.catchTag("DownloadsFailed", ({ reason }) =>
						grabs.send(source, new RecordStall({ reason }))
					)
				);
		});
	})
);
