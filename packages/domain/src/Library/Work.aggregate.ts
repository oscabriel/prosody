import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { CatalogueWork, WorkCatalogued } from "./CatalogueWork.command.ts";
import {
	CorrectTitle,
	OnTheShelf,
	TitleCorrected,
} from "./CorrectTitle.command.ts";
import { Shelfmark } from "./Shelfmark.ts";
import {
	AlreadyShelved,
	EditionShelved,
	NotCatalogued,
	ShelveEdition,
} from "./ShelveEdition.command.ts";
import { WorkId } from "./Work.id.ts";

/** A name kept with the work. A work stored before names were kept has none. */
const Name = Schema.String.pipe(
	Schema.withDecodingDefaultKey(Effect.succeed(""))
);

/**
 * Only what the rules below need: whether the work exists, its name and folder, and each edition's
 * file.
 */
const State = Schema.Struct({
	catalogued: Schema.Boolean,
	title: Name,
	author: Name,
	/** Its folder. A work stored before folders were kept has none, though it has its editions. */
	shelfmark: Schema.NullOr(Shelfmark).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	text: Schema.NullOr(Schema.String),
	audio: Schema.NullOr(Schema.String),
});

type State = typeof State.Type;

/** Whether it is on the shelf: in a folder, or, kept before folders were, with an edition. */
const isShelved = (work: State): boolean =>
	work.shelfmark !== null || work.text !== null || work.audio !== null;

/**
 * One book, whatever its editions. It refuses a second file for an edition it already has. A work
 * you wanted is catalogued again, at its shelfmark, when the press first finds it in the library.
 */
export class Work extends Domain.Aggregate("Work", {
	id: WorkId,
	state: State,
	initial: {
		catalogued: false,
		title: "",
		author: "",
		shelfmark: null,
		text: null,
		audio: null,
	},
	commands: [CatalogueWork, ShelveEdition, CorrectTitle],
	decide: {
		CatalogueWork: (work, cmd) => {
			const isFirst = !work.catalogued;
			const isFound = cmd.shelfmark !== null && !isShelved(work);

			return isFirst || isFound
				? [
						new WorkCatalogued({
							title: cmd.title,
							author: cmd.author,
							shelfmark: cmd.shelfmark,
							description: cmd.description,
						}),
					]
				: [];
		},
		ShelveEdition: (work, cmd) => {
			if (!work.catalogued) {
				return new NotCatalogued();
			}

			const shelved = work[cmd.kind];

			if (shelved === cmd.file) {
				return [];
			}

			if (shelved !== null) {
				return new AlreadyShelved({ kind: cmd.kind, file: shelved });
			}

			return [
				new EditionShelved({
					kind: cmd.kind,
					file: cmd.file,
					bytes: cmd.bytes,
				}),
			];
		},
		CorrectTitle: (work, cmd) => {
			if (!work.catalogued) {
				return new NotCatalogued();
			}

			return isShelved(work)
				? new OnTheShelf()
				: [new TitleCorrected({ title: cmd.title, author: cmd.author })];
		},
	},
	evolve: {
		WorkCatalogued: (work, e) => ({
			...work,
			catalogued: true,
			title: e.title,
			author: e.author,
			shelfmark: e.shelfmark,
		}),
		EditionShelved: (work, e) => ({ ...work, [e.kind]: e.file }),
		TitleCorrected: (work, e) => ({
			...work,
			title: e.title,
			author: e.author,
		}),
	},
}) {}
