import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Work } from "../Library/Work.aggregate.ts";
import { Copier } from "./Copier.external.ts";
import { Copy } from "./Copy.aggregate.ts";
import { CopyStarted } from "./CopyEdition.command.ts";

/**
 * Whenever a try starts, ask the press to make the copy, unless the work has both its editions by
 * now: then it has a pair, and the Narration makes its copy. A share that drops a folder from one
 * walk can make a pair look like one edition, and that must not replace a synced copy.
 */
export class ReadingCopy extends Domain.Policy(
	"ReadingCopy",
	{ from: Copy, on: [CopyStarted] },
	{
		description:
			"Sends each edition alone to the press, to make its reading copy.",
	}
) {}

export const ReadingCopyLive = ReadingCopy.toLayer(
	Effect.gen(function* () {
		const copier = yield* Copier;
		const works = yield* Work;

		return Effect.fn("ReadingCopy")(function* ({ source, event }) {
			const work = yield* works.get(source.id);

			if (work.text !== null && work.audio !== null) {
				return;
			}

			yield* copier.copy({
				work: source.id,
				attempt: event.attempt,
				shelfmark: event.shelfmark,
				kind: event.kind,
				file: event.file,
			});
		});
	})
);
