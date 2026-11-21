import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Work } from "../Library/Work.aggregate.ts";
import { Copier } from "./Copier.external.ts";
import { Copy } from "./Copy.aggregate.ts";
import { CopyStarted, editionToCopy } from "./CopyEdition.command.ts";

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

			if (editionToCopy((kind) => work[kind] !== null) !== event.kind) {
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
