import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import type { Standing } from "@prosody/domain/Reading/Nightstand.view";
import { Clock, Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message, Move } from "./Model.ts";
import type { Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
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

export const sendMove = (
	model: Model,
	work: string,
	move: Move,
	at: number
): Return => {
	const allocation = DomainFoldkit.next(model.commandIds);

	const args = {
		target: WorkId.make(work),
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

export const standingOf = (
	model: Model,
	work: string
): Option.Option<Standing> =>
	Option.flatMap(model.nightstand, ({ works }) =>
		Option.fromUndefinedOr(works[work])
	);

export const readingNow = (
	model: Model
): ReadonlyArray<readonly [string, Standing]> =>
	Option.match(model.nightstand, {
		onNone: () => [],
		onSome: ({ works }) =>
			Object.entries(works)
				.filter(([, standing]) => standing.stage === "reading")
				.toSorted(([, a], [, b]) => b.at - a.at),
	});

export const dayOf = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
