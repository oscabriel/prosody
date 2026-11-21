import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { AbandonGrab } from "@prosody/domain/Acquisition/AbandonGrab.command";
import type { GrabRelease } from "@prosody/domain/Acquisition/GrabRelease.command";
import type { ReleasePayload } from "@prosody/domain/Acquisition/ReleasePayload.command";
import type { ResumeGrab } from "@prosody/domain/Acquisition/ResumeGrab.command";
import type { SearchAgain } from "@prosody/domain/Acquisition/SearchAgain.command";
import type { WantBook } from "@prosody/domain/Acquisition/WantBook.command";
import type { WithdrawWant } from "@prosody/domain/Acquisition/WithdrawWant.command";
import type { CorrectTitle } from "@prosody/domain/Library/CorrectTitle.command";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { lostConnection } from "./Connection.ts";
import { Message } from "./Model.ts";
import type { Desk, Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Return } from "./Steps.ts";

const MintWork = Command.define("MintWork", {
	args: { title: Schema.String, author: Schema.String },
	messages: [Message.MintedWork],
	execute: ({ title, author }) =>
		Effect.sync(() => {
			const digits = Array.from(
				crypto.getRandomValues(new Uint8Array(6)),
				(byte) => byte.toString(16).padStart(2, "0")
			).join("");

			return Message.MintedWork({ work: `w-${digits}`, title, author });
		}),
});

const toMessage = (result: typeof Prosody.Message.Type) =>
	Message.ReceivedResult({ result });

export const changeDesk = (model: Model, change: (desk: Desk) => Desk): Model =>
	modifyFields(model, { desk: change });

export const submitWant = (model: Model): Return => {
	const title = model.desk.title.trim();
	const author = model.desk.author.trim();

	if (title === "" || author === "") {
		return {
			model: changeDesk(model, (desk) => ({
				...desk,
				problem: Option.some("Give both a title and an author."),
			})),
		};
	}

	if (!model.isOnline) {
		return {
			model: changeDesk(model, (desk) => ({
				...desk,
				problem: Option.some(
					"Can't reach the desk. Your book is still in the form."
				),
			})),
		};
	}

	return {
		model: changeDesk(model, (desk) => ({
			...desk,
			title: "",
			author: "",
			problem: Option.none(),
		})),
		commands: [MintWork({ title, author })],
	};
};

export const sendWant = (
	model: Model,
	work: string,
	title: string,
	author: string
): Return => {
	const allocation = DomainFoldkit.next(model.commandIds);

	return {
		model: modifyFields(model, { commandIds: () => allocation.commandIds }),
		commands: [
			Command.mapMessage(
				Prosody.WantBook({
					target: WorkId.make(work),
					input: { title, author },
					commandId: allocation.commandId,
				}),
				toMessage
			),
		],
	};
};

export const sendAbout = (
	model: Model,
	work: string,
	move: "searchAgain" | "withdraw"
): Return => {
	const allocation = DomainFoldkit.next(model.commandIds);

	const args = {
		target: WorkId.make(work),
		input: {},
		commandId: allocation.commandId,
	};

	return {
		model: modifyFields(model, {
			commandIds: () => allocation.commandIds,
			desk: (desk) => ({ ...desk, problem: Option.none() }),
		}),
		commands: [
			move === "searchAgain"
				? Command.mapMessage(Prosody.SearchAgain(args), toMessage)
				: Command.mapMessage(Prosody.WithdrawWant(args), toMessage),
		],
	};
};

type DeskFailure = DomainFoldkit.Failure<
	| typeof WantBook
	| typeof SearchAgain
	| typeof WithdrawWant
	| typeof CorrectTitle
	| typeof GrabRelease
	| typeof ResumeGrab
	| typeof AbandonGrab
	| typeof ReleasePayload
>;

type Refusal = Extract<
	DeskFailure,
	{ readonly rejection: unknown }
>["rejection"];

const refusalOf = (rejection: Refusal): Option.Option<string> =>
	Match.value(rejection).pipe(
		Match.tag("ReleaseNotOffered", () =>
			Option.some(
				"That offer is gone. Search again, and grab one of the new offers."
			)
		),
		Match.tag("StillObligated", ({ hours }) =>
			Option.some(`Not released: it owes ${hours} more hours of seeding.`)
		),
		Match.tag("OnTheShelf", () =>
			Option.some("It is on the shelf, so its title stays.")
		),
		Match.orElse(() => Option.none())
	);

const notSent = (model: Model): Model =>
	changeDesk(model, (desk) => ({
		...desk,
		problem: Option.some("Not sent: the model could not be reached."),
	}));

export const deskFailed = (model: Model, failure: DeskFailure): Return =>
	Match.value(failure).pipe(
		Match.tagsExhaustive({
			Rejected: ({ rejection }) => ({
				model: changeDesk(model, (desk) => ({
					...desk,
					problem: refusalOf(rejection),
				})),
			}),
			Denied: () => ({ model: notSent(model) }),
			Unknown: () => lostConnection(notSent(model)),
		})
	);
