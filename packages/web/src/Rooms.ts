import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { Option } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { kindOf, OpenCopy } from "./Copy.ts";
import { Book, Message } from "./Model.ts";
import type { Model, Move, Room } from "./Model.ts";
import { Stamp } from "./Nightstand.ts";
import { isDue, keepIn, placeOn } from "./Places.ts";
import { Prosody } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";
import {
	andThen,
	inRoom,
	listenFrom,
	roomOf,
	settle,
	spotOf,
	turnTo,
	withRoom,
} from "./Steps.ts";
import type { Return, Step } from "./Steps.ts";
import { Show, ToTop } from "./Text.ts";
import { heardOf, indexOf, pageOf, sentenceAt, spanOf } from "./Timeline.ts";

// The reading room's steps that open it, follow the audio through it, and close it.

/** Whether the room's book is open with its audio alone. */
const isListening = (room: Room): boolean =>
	Book.match(room.book, {
		Open: ({ contents }) => kindOf(contents) === "audio",
		Opening: () => false,
		Unmade: () => false,
		Failed: () => false,
	});

/**
 * In audio alone, the audio moving while it is paused is you moving it, by a chapter or a skip or
 * from the lock screen, so the place is kept at once. Opening at your place moves it too, to where
 * it already was.
 */
const isMovedByHand = (room: Room, time: number): boolean =>
	isListening(room) &&
	!room.isPlaying &&
	Option.match(room.kept, {
		onNone: () => time > 0,
		onSome: (kept) => Math.abs((kept.time ?? 0) - time) > 1,
	});

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

	return Option.exists(
		model.room,
		(room) => isDue(room, at) || isMovedByHand(room, time)
	)
		? keepIn(model, (room) => {
				const [next, commands] = step(room);

				return Option.map(spotOf(next), (spot) => [next, spot, at, commands]);
			})
		: inRoom(model, step);
};

/** Go to a chapter in the contents: turn to its page, or in audio alone, play from its start. */
export const toChapter = (model: Model, index: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				if (kindOf(contents) === "audio") {
					return listenFrom(room, contents.chapters[index]?.start ?? 0);
				}

				const [turned, fetches] = turnTo(room, index);

				return [turned, [...fetches, ToTop()]];
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

/** Move the audio back or on by `seconds`, within the book. */
export const skip = (model: Model, seconds: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				const end = contents.chapters.at(-1)?.end ?? room.time + seconds;

				return listenFrom(
					room,
					Math.min(end, Math.max(0, room.time + seconds))
				);
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

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

/** Whether the shelf says a work has one edition, so its copy is of that edition alone. */
export const isAlone = (model: Model, work: string): boolean =>
	Option.exists(model.shelf, ({ works }) => {
		const entry = works[work];

		return entry !== undefined && entry.text !== entry.audio;
	});

/** Why the press could not make the copy of a work's one edition, when it tried and failed. */
export const copyFailureOf = (
	model: Model,
	work: string
): Option.Option<string> =>
	Option.flatMap(model.shelf, ({ copies }) => {
		const made = copies[work];

		return made?.state === "failed" ? Option.some(made.note) : Option.none();
	});

/**
 * Whether the shelf reports the press at work on a work's copy: copying its edition alone, or
 * aligning its pair. A pair's lone copy, left from a walk that saw half of it, is not asked.
 */
const isPressing = (model: Model, work: string): boolean =>
	Option.exists(model.shelf, ({ syncs, copies }) =>
		isAlone(model, work)
			? copies[work]?.state === "copying"
			: syncs[work]?.state === "syncing"
	);

/** A copy that would not open is not made yet: the press may be making it now. */
export const unmade = (model: Model, work: string): Return =>
	withRoom(model, work, (room) => [
		{
			...room,
			book: Book.Unmade({
				phase: isPressing(model, work) ? "aligning" : "idle",
			}),
		},
		[],
	]);

const toMessage = (result: typeof Prosody.Message.Type) =>
	Message.ReceivedResult({ result });

/** Ask the press to make the open room's copy again: align its pair, or copy its edition alone. */
export const remake = (model: Model): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => {
			const allocation = DomainFoldkit.next(model.commandIds);

			const args = {
				target: WorkId.make(room.work),
				input: {},
				commandId: allocation.commandId,
			};

			return {
				model: modifyFields(model, {
					commandIds: () => allocation.commandIds,
					room: () =>
						Option.some({ ...room, book: Book.Unmade({ phase: "asked" }) }),
				}),
				commands: [
					isAlone(model, room.work)
						? Command.mapMessage(Prosody.RemakeCopy(args), toMessage)
						: Command.mapMessage(Prosody.RealignNarration(args), toMessage),
				],
			};
		},
	});

/**
 * The model's answer to a remake, for a room still waiting on it: taken, so the press is at it and
 * the book reopens when the shelf says it is done; or refused, so the room offers it again.
 */
export const answeredRemake = (
	model: Model,
	phase: "idle" | "aligning"
): Return =>
	inRoom(model, (room) => [
		Book.guards.Unmade(room.book)
			? { ...room, book: Book.Unmade({ phase }) }
			: room,
		[],
	]);

/**
 * Move a room that waits on its copy along as the shelf reports the press at work, and reopen the
 * book when it is done. A room opened while the press is at it waits with it.
 */
export const realigned = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Unmade: ({ phase }) => {
				const isBusy = isPressing(model, room.work);

				if (phase !== "aligning" && isBusy) {
					return [{ ...room, book: Book.Unmade({ phase: "aligning" }) }, []];
				}

				if (phase === "aligning" && !isBusy) {
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
