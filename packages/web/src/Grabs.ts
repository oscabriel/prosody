import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { GrabId } from "@prosody/domain/Acquisition/Grab.id";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Match, Option } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message } from "./Model.ts";
import type { GrabMove, Model } from "./Model.ts";
import { Prosody } from "./Prosody.ts";
import type { Return } from "./Steps.ts";
import { showToast } from "./Ui.ts";
import { wantTitleOf } from "./Wants.ts";

const toMessage = (result: typeof Prosody.Message.Type) =>
	Message.ReceivedResult({ result });

const allocate = (model: Model) => {
	const allocation = DomainFoldkit.next(model.commandIds);

	return {
		commandId: allocation.commandId,
		model: modifyFields(model, {
			commandIds: () => allocation.commandIds,
			desk: (desk) => ({ ...desk, problem: Option.none() }),
		}),
	};
};

const grabTitleOf = (model: Model, grab: string): string =>
	Option.match(model.wanted, {
		onNone: () => "the grab",
		onSome: ({ grabs }) => grabs[grab]?.title ?? "the grab",
	});

export const sendGrab = (
	model: Model,
	work: string,
	release: string
): Return => {
	const { commandId, model: next } = allocate(model);

	return {
		model: showToast(next, `Grabbed ${wantTitleOf(model, work)}`),
		commands: [
			Command.mapMessage(
				Prosody.GrabRelease({
					target: WorkId.make(work),
					input: { release },
					commandId,
				}),
				toMessage
			),
		],
	};
};

export const sendGrabMove = (
	model: Model,
	grab: string,
	move: GrabMove
): Return => {
	const { commandId, model: next } = allocate(model);
	const args = { target: GrabId.make(grab), input: {}, commandId };

	const command = Match.value(move).pipe(
		Match.when("resume", () =>
			Command.mapMessage(Prosody.ResumeGrab(args), toMessage)
		),
		Match.when("abandon", () =>
			Command.mapMessage(Prosody.AbandonGrab(args), toMessage)
		),
		Match.when("release", () =>
			Command.mapMessage(Prosody.ReleasePayload(args), toMessage)
		),
		Match.exhaustive
	);

	return {
		model:
			move === "resume"
				? showToast(next, `Resumed ${grabTitleOf(model, grab)}`)
				: next,
		commands: [command],
	};
};
