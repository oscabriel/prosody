import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import type { ReaderId } from "@prosody/domain/Reader.id";
import type { Standing } from "@prosody/domain/Reading/Nightstand.view";
import { readingOf } from "@prosody/domain/Reading/Reading.id";
import { Clock, Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message, Move } from "./Model.ts";
import type { Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import { readerIn } from "./Readers.ts";
import type { Return } from "./Steps.ts";

export const Stamp = Command.define("Stamp", {
	args: { work: Schema.String, move: Move },
	messages: [Message.Stamped],
	execute: ({ work, move }) =>
		Effect.map(Clock.currentTimeMillis, (at) =>
			Message.Stamped({ work, move, at })
		),
});

const toMessage = (result: typeof Prosody.Message.Type) =>
	Message.ReceivedResult({ result });

const sendMoveAs = (
	model: Model,
	reader: ReaderId,
	work: string,
	move: Move,
	at: number
): Return => {
	const allocation = DomainFoldkit.next(model.commandIds);

	const args = {
		target: readingOf(reader, WorkId.make(work)),
		input: { at },
		commandId: allocation.commandId,
	};

	const command = Match.value(move).pipe(
		Match.when("open", () =>
			Command.mapMessage(Prosody.OpenBook(args), toMessage)
		),
		Match.when("finish", () =>
			Command.mapMessage(Prosody.FinishBook(args), toMessage)
		),
		Match.when("setAside", () =>
			Command.mapMessage(Prosody.SetAside(args), toMessage)
		),
		Match.exhaustive
	);

	return {
		model: modifyFields(model, { commandIds: () => allocation.commandIds }),
		commands: [command],
	};
};

export const sendMove = (
	model: Model,
	work: string,
	move: Move,
	at: number
): Return =>
	Option.match(readerIn(model), {
		onNone: () => ({ model }),
		onSome: (reader) => sendMoveAs(model, reader, work, move, at),
	});

export const standingOf = (
	model: Model,
	work: string
): Option.Option<Standing> =>
	Option.flatMap(model.nightstand, ({ works }) =>
		Option.fromUndefinedOr(works[work])
	);

export const dayOf = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

const shortDayOf = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export const lastReadOf = (device: string, at: number): string =>
	device === "" ? shortDayOf(at) : `${device} · ${shortDayOf(at)}`;
