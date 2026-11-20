import { Option } from "effect";
import { modifyFields } from "foldkit/struct";

import { OpenCopy } from "./Copy.ts";
import { Book } from "./Model.ts";
import type { Model, Move, Room } from "./Model.ts";
import { Stamp } from "./Nightstand.ts";
import { isDue, keepIn, placeOn } from "./Places.ts";
import { AppRoute } from "./Route.ts";
import { andThen, inRoom, roomOf, settle, turnTo } from "./Steps.ts";
import type { Return, Step } from "./Steps.ts";
import { Show } from "./Text.ts";
import { heardOf, indexOf, pageOf, sentenceAt, spanOf } from "./Timeline.ts";

// The reading room's steps that open it, follow the audio through it, and close it.

/**
 * Follow the audio: underline the sentence it is in, turn the page when it does, and keep the
 * place every so often.
 */
export const follow = (model: Model, time: number, at: number): Return => {
	const step = (room: Room): Step =>
		Book.match<Step>(room.book, {
			Open: ({ contents, timeline }) => {
				const moved = { ...room, time };
				const sentence = sentenceAt(heardOf(timeline), time);

				if (
					sentence === undefined ||
					Option.contains(room.sentence, sentence)
				) {
					return [moved, []];
				}

				const index = indexOf(contents, pageOf(sentence));

				const [turned, fetches] =
					index === room.shown || index === -1
						? [moved, []]
						: turnTo(moved, index);

				return [
					{ ...turned, sentence: Option.some(sentence) },
					[...fetches, Show({ id: spanOf(sentence) })],
				];
			},
			Opening: () => [{ ...room, time }, []],
			Unmade: () => [{ ...room, time }, []],
			Failed: () => [{ ...room, time }, []],
		});

	return Option.exists(model.room, (room) => isDue(room, at))
		? keepIn(model, (room) => {
				const [next, commands] = step(room);

				return Option.map(next.sentence, (sentence) => [
					next,
					sentence,
					at,
					commands,
				]);
			})
		: inRoom(model, step);
};

/** Read the clock for a move on the nightstand with the work that is open. */
export const stampIn = (model: Model, move: Move): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => ({ model, commands: [Stamp({ work: room.work, move })] }),
	});

/** With no connection, the device's own place stands in for the model's answer. */
export const hearOwn = (model: Model): Return =>
	inRoom(model, (room) =>
		room.hasHeardPlace
			? [room, []]
			: settle({
					...room,
					hasHeardPlace: true,
					heardPlace: placeOn(model, room.work),
				})
	);

/** Open a work's room: its copy, and its place. */
const openRoom = (model: Model, next: AppRoute, work: string): Return => {
	const opened = {
		model: modifyFields(model, {
			route: () => next,
			room: () => Option.some(roomOf(work, model.copies[work] !== undefined)),
		}),
		commands: [OpenCopy({ work })],
	};

	return model.isOnline ? opened : andThen(opened, hearOwn);
};

/**
 * Back online, try again a book that could not be opened, and send again an open the model has not
 * answered, so the book goes on the nightstand.
 */
export const reopen = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Failed: () => [
				{ ...room, book: Book.Opening() },
				[OpenCopy({ work: room.work })],
			],
			Open: () =>
				room.hasOpened
					? [room, []]
					: [room, [Stamp({ work: room.work, move: "open" })]],
			Opening: () => [room, []],
			Unmade: () => [room, []],
		})
	);

/** Open the room a route asks for, or close it. */
export const route = (model: Model, next: AppRoute): Return =>
	AppRoute.match<Return>(next, {
		Room: ({ work }) =>
			Option.exists(model.room, (room) => room.work === work)
				? { model: modifyFields(model, { route: () => next }) }
				: openRoom(model, next, work),
		Shelf: () => ({
			model: modifyFields(model, {
				route: () => next,
				room: () => Option.none(),
			}),
		}),
		NotFound: () => ({
			model: modifyFields(model, {
				route: () => next,
				room: () => Option.none(),
			}),
		}),
	});

/** The shelf's word on a work's sync, if it has one. */
const syncOf = (model: Model, work: string) =>
	Option.flatMap(model.shelf, ({ syncs }) =>
		Option.fromUndefinedOr(syncs[work])
	);

/** Move a realign along as the shelf reports the press at work, and reopen the book when it is done. */
export const realigned = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Unmade: ({ phase }) => {
				const state = Option.getOrUndefined(
					Option.map(syncOf(model, room.work), (sync) => sync.state)
				);

				if (phase === "asked" && state === "syncing") {
					return [{ ...room, book: Book.Unmade({ phase: "aligning" }) }, []];
				}

				if (phase === "aligning" && state !== "syncing") {
					return [
						{
							...roomOf(room.work, room.isKeptHere),
							hasOpened: room.hasOpened,
						},
						[OpenCopy({ work: room.work })],
					];
				}

				return [room, []];
			},
			Opening: () => [room, []],
			Open: () => [room, []],
			Failed: () => [room, []],
		})
	);
