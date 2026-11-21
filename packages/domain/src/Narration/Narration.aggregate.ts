import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { WorkId } from "../Library/Work.id.ts";
import { ExpireAlignment } from "./ExpireAlignment.command.ts";
import {
	AlignmentStarted,
	EditionsPaired,
	PairEditions,
} from "./PairEditions.command.ts";
import {
	AlreadyAligning,
	NotPaired,
	RealignNarration,
} from "./RealignNarration.command.ts";
import {
	NarrationAligned,
	RecordAlignment,
} from "./RecordAlignment.command.ts";
import {
	AlignmentFailed,
	RecordAlignmentFailed,
} from "./RecordAlignmentFailed.command.ts";

export const ALIGNMENT_WINDOW = "6 hours";

const State = Schema.Struct({
	pair: Schema.NullOr(
		Schema.Struct({
			shelfmark: Shelfmark,
			text: Schema.String,
			audio: Schema.String,
		})
	),
	status: Schema.Literals(["unpaired", "aligning", "aligned", "failed"]),
	attempt: Schema.Int,
}).annotate({ identifier: "NarrationState" });

const isRunning = (narration: typeof State.Type, attempt: number): boolean =>
	narration.status === "aligning" && narration.attempt === attempt;

export class Narration extends Domain.Aggregate("Narration", {
	id: WorkId,
	state: State,
	initial: { pair: null, status: "unpaired", attempt: 0 },
	commands: [
		PairEditions,
		RecordAlignment,
		RecordAlignmentFailed,
		ExpireAlignment,
		RealignNarration,
	],
	decide: {
		PairEditions: (narration, cmd) =>
			narration.pair === null
				? [
						new EditionsPaired({
							shelfmark: cmd.shelfmark,
							text: cmd.text,
							audio: cmd.audio,
						}),
						new AlignmentStarted({ attempt: 1 }),
					]
				: [],
		RecordAlignment: (narration, cmd) =>
			isRunning(narration, cmd.attempt)
				? [
						new NarrationAligned({
							sentences: cmd.sentences,
							matched: cmd.matched,
							checked: cmd.checked,
							heard: cmd.heard,
						}),
					]
				: [],
		RecordAlignmentFailed: (narration, cmd) =>
			isRunning(narration, cmd.attempt)
				? [new AlignmentFailed({ reason: cmd.reason })]
				: [],
		ExpireAlignment: (narration, cmd) =>
			isRunning(narration, cmd.attempt)
				? [
						new AlignmentFailed({
							reason: `the press did not answer within ${ALIGNMENT_WINDOW}`,
						}),
					]
				: [],
		RealignNarration: (narration) => {
			if (narration.pair === null) {
				return new NotPaired();
			}

			if (narration.status === "aligning") {
				return new AlreadyAligning();
			}

			return [new AlignmentStarted({ attempt: narration.attempt + 1 })];
		},
	},
	evolve: {
		EditionsPaired: (narration, e) => ({
			...narration,
			pair: { shelfmark: e.shelfmark, text: e.text, audio: e.audio },
		}),
		AlignmentStarted: (narration, e) => ({
			...narration,
			status: "aligning" as const,
			attempt: e.attempt,
		}),
		NarrationAligned: (narration) => ({
			...narration,
			status: "aligned" as const,
		}),
		AlignmentFailed: (narration) => ({
			...narration,
			status: "failed" as const,
		}),
	},
}) {}
