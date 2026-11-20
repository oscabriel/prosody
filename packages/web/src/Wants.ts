import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { SearchAgain } from "@prosody/domain/Acquisition/SearchAgain.command";
import type { WantBook } from "@prosody/domain/Acquisition/WantBook.command";
import type { WithdrawWant } from "@prosody/domain/Acquisition/WithdrawWant.command";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { lostConnection } from "./Connection.ts";
import { Message } from "./Model.ts";
import type { Desk, Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Return } from "./Steps.ts";

// The desk's steps: wanting a book, searching for it again, and withdrawing it.

/** Make the work id of a book you want: `w-` and twelve hex digits, as the press names works. */
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

/** The desk's form, changed. */
export const changeDesk = (model: Model, change: (desk: Desk) => Desk): Model =>
	modifyFields(model, { desk: change });

/**
 * Want the book the form names, once it names both a title and an author. Offline, it stays in the
 * form, to want once the desk can be reached.
 */
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
		model: changeDesk(model, () => ({
			title: "",
			author: "",
			problem: Option.none(),
		})),
		commands: [MintWork({ title, author })],
	};
};

/** Send a want under its new work id. */
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

/** Search for a wanted book again, or withdraw it, putting by what went wrong before. */
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

/** A want, a search or a withdrawal, as the model may refuse it or the connection lose it. */
type DeskFailure = DomainFoldkit.Failure<
	typeof WantBook | typeof SearchAgain | typeof WithdrawWant
>;

/** The desk, saying the last thing asked of it was not sent. */
const notSent = (model: Model): Model =>
	changeDesk(model, (desk) => ({
		...desk,
		problem: Option.some("Not sent: the model could not be reached."),
	}));

/**
 * A want, search or withdrawal not done. Refused, it changed nothing the desk shows. Lost, it is not
 * sent again: the desk says so, and you ask again once the model can be reached.
 */
export const deskFailed = (model: Model, failure: DeskFailure): Return =>
	Match.value(failure).pipe(
		Match.tagsExhaustive({
			Rejected: () => ({ model }),
			Denied: () => ({ model: notSent(model) }),
			Unknown: () => lostConnection(notSent(model)),
		})
	);
