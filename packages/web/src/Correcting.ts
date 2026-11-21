import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Option } from "effect";
import { Command } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { modifyFields } from "foldkit/struct";

import { Message } from "./Model.ts";
import type { Correction, Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Return } from "./Steps.ts";
import { changeDesk } from "./Wants.ts";

export const correctionView = (
	correction: Correction,
	h: HtmlBuilder<Message>
): Html =>
	h.form(
		[h.Class("want-form"), h.OnSubmit(Message.SubmittedCorrection())],
		[
			h.label(
				[h.Class("field")],
				[
					h.span([h.Class("label")], ["Title"]),
					h.input([
						h.Name("title"),
						h.Value(correction.title),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedCorrectTitle({ value })),
					]),
				]
			),
			h.label(
				[h.Class("field")],
				[
					h.span([h.Class("label")], ["Author"]),
					h.input([
						h.Name("author"),
						h.Value(correction.author),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedCorrectAuthor({ value })),
					]),
				]
			),
			h.button([h.Type("submit")], ["Save"]),
			h.button(
				[
					h.Type("button"),
					h.Class("quiet"),
					h.OnClick(Message.ClickedCancelCorrection()),
				],
				["Cancel"]
			),
		]
	);

export const correctView = (
	work: string,
	isFixed: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	isFixed
		? []
		: [
				h.button(
					[h.Type("button"), h.OnClick(Message.ClickedCorrect({ work }))],
					["Correct the title"]
				),
			];

export const startCorrecting = (model: Model, work: string): Return => {
	const named = Option.flatMap(model.wanted, ({ wants, catalogue }) =>
		Option.fromUndefinedOr(catalogue[work] ?? wants[work])
	);

	return {
		model: changeDesk(model, (desk) => ({
			...desk,
			correcting: Option.map(named, ({ title, author }) => ({
				work,
				title,
				author,
			})),
		})),
	};
};

const notSent = (model: Model, problem: string): Return => ({
	model: changeDesk(model, (desk) => ({
		...desk,
		problem: Option.some(problem),
	})),
});

export const submitCorrection = (model: Model): Return =>
	Option.match(model.desk.correcting, {
		onNone: () => ({ model }),
		onSome: ({ work, title, author }) => {
			if (title.trim() === "" || author.trim() === "") {
				return notSent(model, "Give both a title and an author.");
			}

			if (!model.isOnline) {
				return notSent(
					model,
					"Can't reach the desk. Your correction is still in the form."
				);
			}

			const allocation = DomainFoldkit.next(model.commandIds);

			return {
				model: modifyFields(model, {
					commandIds: () => allocation.commandIds,
					desk: (desk) => ({
						...desk,
						correcting: Option.none(),
						problem: Option.none(),
					}),
				}),
				commands: [
					Command.mapMessage(
						Prosody.CorrectTitle({
							target: WorkId.make(work),
							input: { title: title.trim(), author: author.trim() },
							commandId: allocation.commandId,
						}),
						(result) => Message.ReceivedResult({ result })
					),
				],
			};
		},
	});
