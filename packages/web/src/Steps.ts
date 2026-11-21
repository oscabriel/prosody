import type { Contents } from "@prosody/domain/Reading/Copy";
import type {
	KeptPlace,
	PlaceAt,
	Sentence,
} from "@prosody/domain/Reading/Sentence";
import { Option } from "effect";
import type { HttpClient } from "effect/http";
import type { Command, Update } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { FetchSection, kindOf } from "./Copy.ts";
import { Book, Room, Section } from "./Model.ts";
import type { Message, Model } from "./Model.ts";
import { Seek } from "./Player.ts";
import type { Reader } from "./Prosody.ts";
import { Show } from "./Text.ts";
import {
	chapterAt,
	firstOn,
	heardOf,
	indexOf,
	sectionOf,
	sentenceAt,
	spanOf,
	startOf,
} from "./Timeline.ts";

export type Resources = Reader | HttpClient.HttpClient;

export type Return = Update.Return<Model, Message, Resources>;

export type Commands = ReadonlyArray<
	Command.Command<Message, never, Resources>
>;

export type Step = readonly [Room, Commands];

export type Spot = Pick<PlaceAt, "sentence" | "time" | "page">;

export const roomOf = (work: string, isKeptHere: boolean): Room =>
	Room.make({
		work,
		book: Book.Opening(),
		sections: {},
		shown: 0,
		sentence: Option.none(),
		knowsPlace: false,
		knownPlace: Option.none(),
		hasOpened: false,
		time: 0,
		isPlaying: false,
		rate: 1,
		kept: Option.none(),
		isKeptHere,
		elsewhere: Option.none(),
	});

export const andThen = (
	first: Return,
	then: (model: Model) => Return
): Return => {
	const second = then(first.model);
	const before = first.commands ?? [];
	const after = second.commands ?? [];

	return { model: second.model, commands: [...before, ...after] };
};

export const withRoom = (
	model: Model,
	work: string,
	change: (room: Room) => Step
): Return =>
	Option.match(
		Option.filter(model.room, (room) => room.work === work),
		{
			onNone: () => ({ model }),
			onSome: (room) => {
				const [next, commands] = change(room);

				return {
					model: modifyFields(model, { room: () => Option.some(next) }),
					commands,
				};
			},
		}
	);

export const inRoom = (model: Model, change: (room: Room) => Step): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => withRoom(model, room.work, change),
	});

export const fetchIfNeeded = (room: Room, path: string): Step =>
	path === "" || room.sections[path] !== undefined
		? [room, []]
		: [
				{
					...room,
					sections: { ...room.sections, [path]: Section.Fetching() },
				},
				[FetchSection({ work: room.work, path })],
			];

export const turnTo = (room: Room, index: number): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents }) => {
			const path = contents.sections[index]?.path ?? "";
			const next = contents.sections[index + 1]?.path ?? "";
			const [fetched, first] = fetchIfNeeded({ ...room, shown: index }, path);
			const [ahead, second] = fetchIfNeeded(fetched, next);

			return [ahead, [...first, ...second]];
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

export const goTo = (room: Room, sentence: Sentence): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) => {
			const index = indexOf(contents, sectionOf(sentence));
			const [turned, fetches] = turnTo(room, Math.max(0, index));
			const start = startOf(timeline, sentence);

			const seek =
				start === undefined
					? []
					: [Seek({ time: start, play: room.isPlaying })];

			return [
				{
					...turned,
					sentence: Option.some(sentence),
					time: start ?? room.time,
				},
				[...fetches, ...seek, Show({ id: spanOf(sentence) })],
			];
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

export const listenFrom = (room: Room, time: number): Step => [
	{ ...room, time },
	[Seek({ time, play: room.isPlaying })],
];

export const goToPlace = (room: Room, place: PlaceAt): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) => {
			if (kindOf(contents) === "audio") {
				return place.time === null ? [room, []] : listenFrom(room, place.time);
			}

			if (kindOf(contents) === "pages") {
				return place.page === null
					? [room, []]
					: turnTo(room, Math.min(place.page, contents.pictures.length) - 1);
			}

			const sentence =
				place.sentence ??
				(place.time === null
					? undefined
					: sentenceAt(heardOf(timeline), place.time));

			return sentence === undefined ? [room, []] : goTo(room, sentence);
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

export const settle = (room: Room): Step => {
	if (!room.knowsPlace || Option.isSome(room.sentence)) {
		return [room, []];
	}

	return Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) =>
			Option.match(room.knownPlace, {
				onSome: (place) =>
					goToPlace({ ...room, kept: Option.some(place) }, place),
				onNone: () => {
					const first = firstOn(timeline, contents.sections[0]?.path ?? "");

					return first === undefined ? turnTo(room, 0) : goTo(room, first);
				},
			}),
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});
};

export const isElsewhere = (room: Room, place: KeptPlace): boolean =>
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => place.at > kept.at,
	}) &&
	!Option.exists(
		spotOf(room),
		(spot) =>
			spot.sentence === place.sentence &&
			spot.time === place.time &&
			spot.page === place.page
	);

export const entryOf = (
	model: Model,
	work: string
): Option.Option<{ readonly title: string; readonly author: string }> =>
	Option.orElse(
		Option.flatMap(model.shelf, ({ works }) =>
			Option.fromUndefinedOr(works[work])
		),
		() => Option.fromUndefinedOr(model.copies[work])
	);

export const spotOf = (room: Room): Option.Option<Spot> =>
	Book.match(room.book, {
		Open: ({ contents }) => {
			if (kindOf(contents) === "audio") {
				return Option.some({ sentence: null, time: room.time, page: null });
			}

			if (kindOf(contents) === "pages") {
				return Option.some({
					sentence: null,
					time: null,
					page: room.shown + 1,
				});
			}

			return Option.map(room.sentence, (sentence) => ({
				sentence,
				time: null,
				page: null,
			}));
		},
		Opening: () => Option.none(),
		Unmade: () => Option.none(),
		Failed: () => Option.none(),
	});

export const chaptersIn = (
	contents: Contents
): ReadonlyArray<{ readonly title: string }> => {
	if (kindOf(contents) === "audio") {
		return contents.chapters;
	}

	return kindOf(contents) === "pages" ? contents.headings : contents.sections;
};

export const chapterOf = (room: Room, contents: Contents): number => {
	if (kindOf(contents) === "audio") {
		return chapterAt(contents.chapters, room.time);
	}

	if (kindOf(contents) === "pages") {
		return Math.max(
			0,
			contents.headings.findLastIndex(({ page }) => page <= room.shown + 1)
		);
	}

	return Option.match(room.sentence, {
		onNone: () => room.shown,
		onSome: (sentence) => indexOf(contents, sectionOf(sentence)),
	});
};

export const titleOf = (contents: Contents, index: number): string => {
	const title = chaptersIn(contents)[index]?.title ?? "";

	if (title !== "") {
		return title;
	}

	return kindOf(contents) === "audio"
		? `Chapter ${index + 1}`
		: `Section ${index + 1}`;
};
