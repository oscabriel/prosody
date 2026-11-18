import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Aligner } from "./Aligner.external.ts";
import { ExpireAlignment } from "./ExpireAlignment.command.ts";
import { ALIGNMENT_WINDOW, Narration } from "./Narration.aggregate.ts";
import { AlignmentStarted } from "./PairEditions.command.ts";

/**
 * Whenever a try starts, give it a deadline and ask the press to do it. The Narration decides the
 * race: the press's answer and the deadline are commands on the same work, so the first one wins.
 */
export class Alignment extends Domain.Policy(
	"Alignment",
	{ from: Narration, on: [AlignmentStarted] },
	{ description: "Sends each pair to the press, with a deadline." }
) {}

export const AlignmentLive = Alignment.toLayer(
	Effect.gen(function* () {
		const aligner = yield* Aligner;
		const narrations = yield* Narration;

		return Effect.fn("Alignment")(function* ({ source, event }) {
			const { pair } = yield* narrations.get(source);

			if (pair === null) {
				return;
			}

			// The deadline first, so a press that never answers is caught even when the ask fails.
			yield* narrations.schedule(
				source,
				new ExpireAlignment({ attempt: event.attempt }),
				{
					after: ALIGNMENT_WINDOW,
					commandId: `expire:${source.id}:${event.attempt}`,
				}
			);

			yield* aligner.align({
				work: source.id,
				attempt: event.attempt,
				...pair,
			});
		});
	})
);
