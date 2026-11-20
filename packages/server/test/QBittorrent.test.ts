import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import type { Torrent } from "../src/QBittorrent.ts";
import { grabOf, progressOf } from "../src/QBittorrent.ts";

/** Half past twelve, in seconds, on the day the torrent was added at noon. */
const NOW = 1_800_000_000;

/** A torrent as qBittorrent lists it, added half an hour ago. */
const torrent = (change: Partial<Torrent>): Torrent => ({
	hash: "c0ffee",
	state: "downloading",
	progress: 0.427,
	tags: "w-c0ffee000001.1",
	save_path: "/data/torrents/books",
	content_path: "/data/torrents/books/Project Hail Mary [M4B]",
	seeding_time: 0,
	last_activity: NOW - 60,
	added_on: NOW - 1800,
	...change,
});

describe("a torrent", () => {
	it("belongs to the grab its tag names", () => {
		expect(grabOf(torrent({ tags: "keep, w-c0ffee000001.2" }))).toStrictEqual(
			Option.some("w-c0ffee000001.2")
		);
		expect(grabOf(torrent({ tags: "w-c0ffee000001" }))).toStrictEqual(
			Option.none()
		);
	});

	it("still coming says how much has come", () => {
		expect(progressOf(torrent({}), NOW)).toStrictEqual({
			percent: 42,
			stall: Option.none(),
			payload: Option.none(),
			hours: 0,
		});
	});

	it("is stalled once nothing has come for half an hour, or when qBittorrent stopped it", () => {
		const quiet = torrent({ state: "stalledDL", last_activity: NOW - 1800 });
		const waiting = torrent({ state: "stalledDL", last_activity: NOW - 1799 });

		expect(progressOf(quiet, NOW).stall).toStrictEqual(
			Option.some("Nothing has come for half an hour")
		);
		expect(progressOf(waiting, NOW).stall).toStrictEqual(Option.none());
		expect(
			progressOf(torrent({ state: "stoppedDL" }), NOW).stall
		).toStrictEqual(Option.some("It was stopped in qBittorrent"));
	});

	it("all come names its payload inside the downloads, and the hours it seeded", () => {
		const come = torrent({
			state: "stalledUP",
			progress: 1,
			seeding_time: 26 * 3600 + 59,
		});

		expect(progressOf(come, NOW)).toStrictEqual({
			percent: 100,
			stall: Option.none(),
			payload: Option.some("Project Hail Mary [M4B]"),
			hours: 26,
		});
		expect(
			progressOf({ ...come, content_path: "/data/elsewhere/x.m4b" }, NOW)
				.payload
		).toStrictEqual(Option.some(""));
	});
});
