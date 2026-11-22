import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Option } from "effect";
import { Command } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { modifyFields } from "foldkit/struct";

import { FocusOnDesk } from "./DeskUpdate.ts";
import { Message } from "./Model.ts";
import type { Correction, Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Return } from "./Steps.ts";
import { showToast } from "./Ui.ts";
import { changeDesk } from "./Wants.ts";

const titleFieldOf = (work: string): string => `correct-title-${work}`;

const authorFieldOf = (work: string): string => `correct-author-${work}`;

const correctButtonOf = (work: string): string => `correct-${work}`;

export const correctionView = (
	correction: Correction,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.form(
		[
			h.Class("inline-edit"),
			h.Novalidate(true),
			h.AriaLabel("Correct the title"),
			h.OnSubmit(Message.SubmittedCorrection()),
		],
		[
			h.div(
				[h.Class("field-group")],
				[
					h.label(
						[h.Class("field-label"), h.For(titleFieldOf(correction.work))],
						["Title"]
					),
					h.input([
						h.Id(titleFieldOf(correction.work)),
						h.Class("input input-compact"),
						h.Name("title"),
						h.Value(correction.title),
						h.Required(true),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedCorrectTitle({ value })),
					]),
				]
			),
			h.div(
				[h.Class("field-group")],
				[
					h.label(
						[h.Class("field-label"), h.For(authorFieldOf(correction.work))],
						["Author"]
					),
					h.input([
						h.Id(authorFieldOf(correction.work)),
						h.Class("input input-compact"),
						h.Name("author"),
						h.Value(correction.author),
						h.Required(true),
						h.Autocomplete("off"),
						h.OnInput((value) => Message.ChangedCorrectAuthor({ value })),
					]),
				]
			),
			h.button(
				[
					h.Type("submit"),
					h.Class("btn btn-primary btn-sm"),
					h.Disabled(!isOnline),
				],
				["Save"]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("btn btn-ghost btn-sm"),
					h.OnClick(Message.ClickedCancelCorrection()),
				],
				["Cancel"]
			),
		]
	);

export const correctView = (
	work: string,
	isFixed: boolean,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	isFixed
		? []
		: [
				h.button(
					[
						h.Type("button"),
						h.Id(correctButtonOf(work)),
						h.Class("btn btn-ghost btn-sm"),
						h.Disabled(!isOnline),
						h.OnClick(Message.ClickedCorrect({ work })),
					],
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
		commands: [FocusOnDesk({ id: titleFieldOf(work) })],
	};
};

export const cancelCorrecting = (model: Model): Return => ({
	model: changeDesk(model, (desk) => ({
		...desk,
		correcting: Option.none(),
	})),
	commands: Option.match(model.desk.correcting, {
		onNone: () => [],
		onSome: ({ work }) => [FocusOnDesk({ id: correctButtonOf(work) })],
	}),
});

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

			const sent = modifyFields(model, {
				commandIds: () => allocation.commandIds,
				desk: (desk) => ({
					...desk,
					correcting: Option.none(),
					problem: Option.none(),
				}),
			});

			return {
				model: showToast(sent, "Title updated"),
				commands: [
					Command.mapMessage(
						Prosody.CorrectTitle({
							target: WorkId.make(work),
							input: { title: title.trim(), author: author.trim() },
							commandId: allocation.commandId,
						}),
						(result) => Message.ReceivedResult({ result })
					),
					FocusOnDesk({ id: correctButtonOf(work) }),
				],
			};
		},
	});
