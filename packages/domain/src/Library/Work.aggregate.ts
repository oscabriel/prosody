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

const Name = Schema.String.pipe(
	Schema.withDecodingDefaultKey(Effect.succeed(""))
);

const State = Schema.Struct({
	catalogued: Schema.Boolean,
	title: Name,
	author: Name,
	shelfmark: Schema.NullOr(Shelfmark).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	text: Schema.NullOr(Schema.String),
	audio: Schema.NullOr(Schema.String),
	pages: Schema.NullOr(Schema.String).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
});

type State = typeof State.Type;

const isShelved = (work: State): boolean =>
	work.shelfmark !== null ||
	work.text !== null ||
	work.audio !== null ||
	work.pages !== null;

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
		pages: null,
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
