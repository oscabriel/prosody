import { Option } from "effect";
import { modifyFields } from "foldkit/struct";

import { Book } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { Pause } from "./Player.ts";
import { chapterOf } from "./Steps.ts";
import type { Return } from "./Steps.ts";
import { showToast } from "./Ui.ts";

const MINUTE = 60_000;

const NATURAL = 5;

export const SLEEP_CHOICES: ReadonlyArray<number> = [15, 30, 45, 60];

export const awake = (room: Room): Room => ({
	...room,
	sleepEndsAt: Option.none(),
	sleepEndOfChapter: false,
	sleepMinutes: Option.none(),
	sleepLeft: Option.none(),
});

const isSleepSet = (room: Room): boolean =>
	room.sleepEndOfChapter || Option.isSome(room.sleepMinutes);

const minutesLeft = (endsAt: number, now: number): number =>
	Math.max(1, Math.ceil((endsAt - now) / MINUTE));

export const sleepAfter = (room: Room, minutes: number): Room => ({
	...awake(room),
	sleepMinutes: Option.some(minutes),
	sleepLeft: Option.some(minutes),
});

export const sleepAtChapterEnd = (room: Room): Room => ({
	...awake(room),
	sleepEndOfChapter: true,
});

export const sleepTag = (room: Room): string => {
	if (room.sleepEndOfChapter) {
		return " · ☾ Ch.";
	}

	return Option.match(room.sleepLeft, {
		onNone: () => "",
		onSome: (left) => ` · ☾ ${left}m`,
	});
};

export const sleepLabel = (room: Room): string => {
	if (room.sleepEndOfChapter) {
		return "End ch.";
	}

	return Option.match(room.sleepLeft, {
		onNone: () => "Sleep",
		onSome: (left) => `${left}m`,
	});
};

export const fallAsleep = (model: Model): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => {
			if (!isSleepSet(room)) {
				return { model };
			}

			const rested = modifyFields(model, {
				room: () => Option.some(awake(room)),
			});

			return room.isPlaying
				? {
						model: showToast(rested, "Paused by the sleep timer"),
						commands: [Pause()],
					}
				: { model: rested };
		},
	});

export const sleepClocked = (model: Model, now: number): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) =>
			Option.match(room.sleepMinutes, {
				onNone: () => ({ model }),
				onSome: (minutes) => {
					const endsAt = Option.getOrElse(
						room.sleepEndsAt,
						() => now + minutes * MINUTE
					);

					return now >= endsAt
						? fallAsleep(model)
						: {
								model: modifyFields(model, {
									room: () =>
										Option.some({
											...room,
											sleepEndsAt: Option.some(endsAt),
											sleepLeft: Option.some(minutesLeft(endsAt, now)),
										}),
								}),
							};
				},
			}),
	});

const chapterIn = (room: Room): number =>
	Book.match(room.book, {
		Open: ({ contents }) => chapterOf(room, contents),
		Opening: () => -1,
		Unmade: () => -1,
		Failed: () => -1,
	});

const playedOn = (before: Room, after: Room): boolean => {
	const advance = after.time - before.time;

	return (
		advance > 0 &&
		advance < NATURAL &&
		chapterIn(after) > chapterIn(before) &&
		chapterIn(before) >= 0
	);
};

export const sleptThrough = (
	model: Model,
	before: Option.Option<Room>,
	at: number
): Return =>
	Option.match(Option.product(before, model.room), {
		onNone: () => ({ model }),
		onSome: ([was, room]) => {
			const isOver = Option.exists(room.sleepEndsAt, (endsAt) => at >= endsAt);

			const isChapterOver =
				room.sleepEndOfChapter && was.isPlaying && playedOn(was, room);

			return isOver || isChapterOver ? fallAsleep(model) : { model };
		},
	});
