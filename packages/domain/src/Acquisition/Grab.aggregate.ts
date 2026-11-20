import * as Domain from "@alchemy.run/domain";
import { Effect, Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import {
	AbandonGrab,
	GrabAbandoned,
	NotDownloading,
} from "./AbandonGrab.command.ts";
import { GrabId, GrabStatus } from "./Grab.id.ts";
import {
	PayloadNotShelved,
	RecordNotShelved,
} from "./RecordNotShelved.command.ts";
import {
	PayloadArrived,
	RecordPayloadArrived,
} from "./RecordPayloadArrived.command.ts";
import {
	DownloadProgressed,
	RecordProgress,
} from "./RecordProgress.command.ts";
import { PayloadSeeded, RecordSeeding } from "./RecordSeeding.command.ts";
import { PayloadShelved, RecordShelved } from "./RecordShelved.command.ts";
import { GrabStalled, RecordStall } from "./RecordStall.command.ts";
import { Release } from "./Release.ts";
import {
	OBLIGATION,
	PayloadReleased,
	ReleasePayload,
	StillObligated,
} from "./ReleasePayload.command.ts";
import { GrabResumed, ResumeGrab } from "./ResumeGrab.command.ts";
import { DownloadStarted, StartDownload } from "./StartDownload.command.ts";

const State = Schema.Struct({
	work: Schema.NullOr(WorkId),
	release: Schema.NullOr(Release),
	status: GrabStatus,
	percent: Schema.Int,
	/** The payload's file or folder in the downloads, once it has come. */
	payload: Schema.NullOr(Schema.String),
	/** Whole hours seeded. */
	seeded: Schema.Int,
	// A grab kept before shelving was not shelved, and has no note.
	isShelved: Schema.Boolean.pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(false))
	),
	/** Why its edition is not shelved yet, as the press last said. */
	note: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed(""))),
}).annotate({ identifier: "GrabState" });

type State = typeof State.Type;

/** Whether its payload is still on its way. */
const isDownloading = (grab: State): boolean =>
	grab.status === "downloading" || grab.status === "stalled";

/** Whether its payload has come and its edition is waiting to be shelved. */
const isWaiting = (grab: State): boolean =>
	grab.payload !== null && !grab.isShelved;

/**
 * One release you grabbed, from the download to the end of its seeding. The press reports how the
 * download goes; you resume it, abandon it, or release its payload once it owes nothing.
 */
export class Grab extends Domain.Aggregate("Grab", {
	id: GrabId,
	state: State,
	initial: {
		work: null,
		release: null,
		status: "none",
		percent: 0,
		payload: null,
		seeded: 0,
		isShelved: false,
		note: "",
	},
	commands: [
		StartDownload,
		RecordProgress,
		RecordStall,
		ResumeGrab,
		AbandonGrab,
		RecordPayloadArrived,
		RecordSeeding,
		RecordShelved,
		RecordNotShelved,
		ReleasePayload,
	],
	decide: {
		StartDownload: (grab, cmd) =>
			grab.status === "none"
				? [new DownloadStarted({ work: cmd.work, release: cmd.release })]
				: [],
		RecordProgress: (grab, cmd) =>
			isDownloading(grab) && cmd.percent > grab.percent
				? [new DownloadProgressed({ percent: cmd.percent })]
				: [],
		RecordStall: (grab, cmd) =>
			grab.status === "downloading"
				? [new GrabStalled({ reason: cmd.reason })]
				: [],
		ResumeGrab: (grab) =>
			isDownloading(grab)
				? [new GrabResumed()]
				: new NotDownloading({ status: grab.status }),
		AbandonGrab: (grab) =>
			isDownloading(grab)
				? [new GrabAbandoned()]
				: new NotDownloading({ status: grab.status }),
		RecordPayloadArrived: (grab, cmd) =>
			isDownloading(grab) ? [new PayloadArrived({ payload: cmd.payload })] : [],
		RecordSeeding: (grab, cmd) =>
			grab.status === "arrived" && cmd.hours > grab.seeded
				? [new PayloadSeeded({ hours: cmd.hours })]
				: [],
		RecordShelved: (grab, cmd) =>
			isWaiting(grab)
				? [new PayloadShelved({ work: cmd.work, shelfmark: cmd.shelfmark })]
				: [],
		RecordNotShelved: (grab, cmd) =>
			isWaiting(grab) && grab.note !== cmd.reason
				? [new PayloadNotShelved({ reason: cmd.reason })]
				: [],
		ReleasePayload: (grab) => {
			if (grab.status === "released") {
				return [];
			}

			if (grab.status === "none" || grab.status === "abandoned") {
				return new NotDownloading({ status: grab.status });
			}

			const owed =
				grab.status === "arrived"
					? OBLIGATION.hours - grab.seeded
					: OBLIGATION.hours;

			return owed > 0
				? new StillObligated({ hours: owed })
				: [new PayloadReleased()];
		},
	},
	evolve: {
		DownloadStarted: (grab, e) => ({
			...grab,
			work: e.work,
			release: e.release,
			status: "downloading" as const,
		}),
		DownloadProgressed: (grab, e) => ({
			...grab,
			status: "downloading" as const,
			percent: e.percent,
		}),
		GrabStalled: (grab) => ({ ...grab, status: "stalled" as const }),
		GrabResumed: (grab) => ({ ...grab, status: "downloading" as const }),
		GrabAbandoned: (grab) => ({ ...grab, status: "abandoned" as const }),
		PayloadArrived: (grab, e) => ({
			...grab,
			status: "arrived" as const,
			percent: 100,
			payload: e.payload,
		}),
		PayloadSeeded: (grab, e) => ({ ...grab, seeded: e.hours }),
		PayloadShelved: (grab) => ({ ...grab, isShelved: true, note: "" }),
		PayloadNotShelved: (grab, e) => ({ ...grab, note: e.reason }),
		PayloadReleased: (grab) => ({ ...grab, status: "released" as const }),
	},
}) {}
