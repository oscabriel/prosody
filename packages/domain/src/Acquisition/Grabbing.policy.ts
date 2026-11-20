import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Grab } from "./Grab.aggregate.ts";
import { ReleaseGrabbed } from "./GrabRelease.command.ts";
import { StartDownload } from "./StartDownload.command.ts";
import { Want } from "./Want.aggregate.ts";

/** Whenever you grab a release, open its grab, which downloads it. */
export class Grabbing extends Domain.Policy(
	"Grabbing",
	{ from: Want, on: [ReleaseGrabbed] },
	{ description: "Opens a grab for each release you grab." }
) {}

export const GrabbingLive = Grabbing.toLayer(
	Effect.gen(function* () {
		const grabs = yield* Grab;

		return Effect.fn("Grabbing")(function* ({ source, event }) {
			yield* grabs.send(
				event.grab,
				new StartDownload({ work: source.id, release: event.release })
			);
		});
	})
);
