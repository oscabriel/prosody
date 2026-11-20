import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { Shelfmark } from "../Library/Shelfmark.ts";
import { EditionKind } from "../Library/ShelveEdition.command.ts";
import { WorkId } from "../Library/Work.id.ts";
import { CopyEdition, CopyStarted } from "./CopyEdition.command.ts";
import { CopyMade, RecordCopy } from "./RecordCopy.command.ts";
import { CopyFailed, RecordCopyFailed } from "./RecordCopyFailed.command.ts";
import { NothingToCopy, RemakeCopy } from "./RemakeCopy.command.ts";

const State = Schema.Struct({
	edition: Schema.NullOr(
		Schema.Struct({
			shelfmark: Shelfmark,
			kind: EditionKind,
			file: Schema.String,
			bytes: Schema.Int,
		})
	),
	status: Schema.Literals(["none", "copying", "made", "failed"]),
	attempt: Schema.Int,
}).annotate({ identifier: "CopyState" });

/** Whether an answer is about the try that is running now. */
const isRunning = (copy: typeof State.Type, attempt: number): boolean =>
	copy.status === "copying" && copy.attempt === attempt;

/**
 * The reading copy of a work with no pair, made from one edition: its text, else its pages, else
 * its audio. A pair's copy is its Narration's. It holds one try at a time, and takes the first
 * answer to it.
 */
export class Copy extends Domain.Aggregate("Copy", {
	id: WorkId,
	state: State,
	initial: { edition: null, status: "none", attempt: 0 },
	commands: [CopyEdition, RecordCopy, RecordCopyFailed, RemakeCopy],
	decide: {
		CopyEdition: (copy, cmd) =>
			copy.edition?.kind === cmd.kind &&
			copy.edition.file === cmd.file &&
			copy.edition.bytes === cmd.bytes
				? []
				: [
						new CopyStarted({
							shelfmark: cmd.shelfmark,
							kind: cmd.kind,
							file: cmd.file,
							bytes: cmd.bytes,
							attempt: copy.attempt + 1,
						}),
					],
		RecordCopy: (copy, cmd) =>
			isRunning(copy, cmd.attempt)
				? [new CopyMade({ chapters: cmd.chapters })]
				: [],
		RecordCopyFailed: (copy, cmd) =>
			isRunning(copy, cmd.attempt)
				? [new CopyFailed({ reason: cmd.reason })]
				: [],
		RemakeCopy: (copy) =>
			copy.edition === null
				? new NothingToCopy()
				: [new CopyStarted({ ...copy.edition, attempt: copy.attempt + 1 })],
	},
	evolve: {
		CopyStarted: (copy, e) => ({
			edition: {
				shelfmark: e.shelfmark,
				kind: e.kind,
				file: e.file,
				bytes: e.bytes,
			},
			status: "copying" as const,
			attempt: e.attempt,
		}),
		CopyMade: (copy) => ({ ...copy, status: "made" as const }),
		CopyFailed: (copy) => ({ ...copy, status: "failed" as const }),
	},
}) {}
