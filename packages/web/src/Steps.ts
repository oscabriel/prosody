import type { Contents } from "@prosody/domain/Reading/Copy";
import type { Bookmark, Sentence } from "@prosody/domain/Reading/Sentence";
import { Option } from "effect";
import type { HttpClient } from "effect/http";
import type { Command, Update } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { FetchPage } from "./Copy.ts";
import { Book, Page, Room } from "./Model.ts";
import type { Message, Model } from "./Model.ts";
import { Seek } from "./Player.ts";
import type { Reader } from "./Prosody.ts";
import { Show } from "./Text.ts";
import { firstOn, indexOf, pageOf, spanOf, startOf } from "./Timeline.ts";

/** What commands may need: the reader's Api, and HTTP for the reading copies. */
export type Resources = Reader | HttpClient.HttpClient;

export type Return = Update.Return<Model, Message, Resources>;

export type Commands = ReadonlyArray<
	Command.Command<Message, never, Resources>
>;

/** A change to the room, and what it sets off. */
export type Step = readonly [Room, Commands];

/**
 * A work's reading room as it opens, before the book or your place has arrived. Its audio plays
 * from this device when a copy is kept here.
 */
export const roomOf = (work: string, isKeptHere: boolean): Room =>
	Room.make({
		work,
		book: Book.Opening(),
		pages: {},
		shown: 0,
		sentence: Option.none(),
		hasHeardPlace: false,
		heardPlace: Option.none(),
		hasOpened: false,
		time: 0,
		isPlaying: false,
		rate: 1,
		kept: Option.none(),
		isKeptHere,
		elsewhere: Option.none(),
	});

/** One update, then another on the model it left, with the commands of both. */
export const andThen = (
	first: Return,
	then: (model: Model) => Return
): Return => {
	const second = then(first.model);
	const before = first.commands ?? [];
	const after = second.commands ?? [];

	return { model: second.model, commands: [...before, ...after] };
};

/** The model with its room changed, when there is a room for `work`. */
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

/** The same, for the room that is open, whatever its work. */
export const inRoom = (model: Model, change: (room: Room) => Step): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => withRoom(model, room.work, change),
	});

/** Fetch a page unless it is fetched or on its way. */
export const fetchIfNeeded = (room: Room, path: string): Step =>
	path === "" || room.pages[path] !== undefined
		? [room, []]
		: [
				{ ...room, pages: { ...room.pages, [path]: Page.Fetching() } },
				[FetchPage({ work: room.work, path })],
			];

/** Show the page at `index`, fetching it and the one after it. */
export const turnTo = (room: Room, index: number): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents }) => {
			const path = contents.pages[index]?.path ?? "";
			const next = contents.pages[index + 1]?.path ?? "";
			const [fetched, first] = fetchIfNeeded({ ...room, shown: index }, path);
			const [ahead, second] = fetchIfNeeded(fetched, next);

			return [ahead, [...first, ...second]];
		},
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});

/**
 * Go to a sentence: show its page, underline it, bring it into view, and move the audio to it,
 * playing on if it was playing.
 */
export const goTo = (room: Room, sentence: Sentence): Step =>
	Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) => {
			const index = indexOf(contents, pageOf(sentence));
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

/**
 * Once both the book and your place have arrived, open the book at your place, or at its first
 * page when you have none.
 */
export const settle = (room: Room): Step => {
	if (!room.hasHeardPlace || Option.isSome(room.sentence)) {
		return [room, []];
	}

	return Book.match<Step>(room.book, {
		Open: ({ contents, timeline }) =>
			Option.match(room.heardPlace, {
				onSome: (place) =>
					goTo({ ...room, kept: Option.some(place) }, place.sentence),
				onNone: () => {
					const first = firstOn(timeline, contents.pages[0]?.path ?? "");

					return first === undefined ? turnTo(room, 0) : goTo(room, first);
				},
			}),
		Opening: () => [room, []],
		Unmade: () => [room, []],
		Failed: () => [room, []],
	});
};

/**
 * A place kept elsewhere that is newer than anything this page has. A place this page kept is never
 * newer than the last one it kept.
 */
export const isElsewhere = (room: Room, place: Bookmark): boolean =>
	Option.match(room.kept, {
		onNone: () => true,
		onSome: (kept) => place.at > kept.at,
	}) &&
	Option.match(room.sentence, {
		onNone: () => true,
		onSome: (sentence) => sentence !== place.sentence,
	});

/** A work's title and author: the shelf's, or with no shelf to hand, its copy on this device's. */
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

/** The chapter your place is in, or the page on show when you have no place yet. */
export const chapterOf = (room: Room, contents: Contents): number =>
	Option.match(room.sentence, {
		onNone: () => room.shown,
		onSome: (sentence) => indexOf(contents, pageOf(sentence)),
	});

/** A page's name in the contents, or its number when it has none. */
export const titleOf = (contents: Contents, index: number): string => {
	const title = contents.pages[index]?.title ?? "";

	return title === "" ? `Section ${index + 1}` : title;
};
