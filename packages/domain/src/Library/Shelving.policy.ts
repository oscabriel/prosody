import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Grab } from "../Acquisition/Grab.aggregate.ts";
import { PayloadArrived } from "../Acquisition/RecordPayloadArrived.command.ts";
import { Want } from "../Acquisition/Want.aggregate.ts";
import { ClaimShelfmark } from "./ClaimShelfmark.command.ts";
import { Metadata } from "./Metadata.external.ts";
import { shelfmarkOf } from "./Shelfmark.ts";
import { ShelfmarkClaim } from "./ShelfmarkClaim.aggregate.ts";
import { Stacks } from "./Stacks.external.ts";
import { Work } from "./Work.aggregate.ts";
import type { WorkId } from "./Work.id.ts";

/**
 * Whenever a payload arrives, claim its work's folder and have Stacks copy the edition into it. A
 * folder another work already holds takes the edition for that work, so a book wanted twice is one
 * work on the shelf, and an audiobook grabbed for an ebook already there pairs with it.
 */
export class Shelving extends Domain.Policy(
	"Shelving",
	{ from: Grab, on: [PayloadArrived] },
	{ description: "Shelves each payload that arrives, in its work's folder." }
) {}

export const ShelvingLive = Shelving.toLayer(
	Effect.gen(function* () {
		const stacks = yield* Stacks;
		const metadata = yield* Metadata;
		const grabs = yield* Grab;
		const works = yield* Work;
		const wants = yield* Want;
		const claims = yield* ShelfmarkClaim;

		/**
		 * The work's folder, or the one it will have, named for it as it was catalogued. A work wanted
		 * before works kept their names has none, so the catalogues outside are asked again, for the
		 * names you gave, and name it as they did then.
		 */
		const shelfmarkFor = Effect.fn(function* (work: WorkId) {
			const named = yield* works.get(work);

			if (named.shelfmark !== null) {
				return named.shelfmark;
			}

			if (named.title !== "") {
				return shelfmarkOf(named.author, named.title);
			}

			const { title, author } = yield* wants.get(work);
			const described = yield* metadata.describe({ title, author });

			return shelfmarkOf(described.author, described.title);
		});

		return Effect.fn("Shelving")(function* ({ source, event }) {
			const { work, release } = yield* grabs.get(source);

			if (work === null || release === null) {
				return;
			}

			const shelfmark = yield* shelfmarkFor(work);

			const owner = yield* claims
				.send(shelfmark, new ClaimShelfmark({ work }))
				.pipe(
					Effect.as(work),
					Effect.catchTag("ShelfmarkTaken", (taken) =>
						Effect.succeed(taken.work)
					)
				);

			yield* stacks.shelve({
				grab: source.id,
				work: owner,
				kind: release.kind,
				payload: event.payload,
				shelfmark,
			});
		});
	})
);
