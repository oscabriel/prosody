import * as Domain from "@alchemy.run/domain";
import { Effect } from "effect";

import { Want } from "../Acquisition/Want.aggregate.ts";
import { BookWanted } from "../Acquisition/WantBook.command.ts";
import { CatalogueWork } from "./CatalogueWork.command.ts";
import { Metadata } from "./Metadata.external.ts";
import { Work } from "./Work.aggregate.ts";

/**
 * Whenever you want a book, catalogue its work as the catalogues outside know it. They are asked
 * this once; a work is never looked up again. Asking them dies when they can't be reached in time,
 * and the platform runs the policy again.
 */
export class Cataloguing extends Domain.Policy(
	"Cataloguing",
	{ from: Want, on: [BookWanted] },
	{ description: "Catalogues each wanted book, as Open Library knows it." }
) {}

export const CataloguingLive = Cataloguing.toLayer(
	Effect.gen(function* () {
		const metadata = yield* Metadata;
		const works = yield* Work;

		return Effect.fn("Cataloguing")(function* ({ source, event }) {
			const { title, author, description } = yield* metadata.describe({
				title: event.title,
				author: event.author,
			});

			yield* works.send(
				source.id,
				new CatalogueWork({ title, author, shelfmark: null, description })
			);
		});
	})
);
