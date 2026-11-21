import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import { editionToCopy } from "@prosody/domain/Reading/CopyEdition.command";
import { Option } from "effect";
import { Command } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { kindOf, OpenCopy } from "./Copy.ts";
import { Book, Message } from "./Model.ts";
import type { Model, Move, Room } from "./Model.ts";
import { Stamp } from "./Nightstand.ts";
import { PRINTED } from "./Pages.ts";
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
import { heardOf, indexOf, sectionOf, sentenceAt, spanOf } from "./Timeline.ts";

const isListening = (room: Room): boolean =>
	Book.match(room.book, {
		Open: ({ contents }) => kindOf(contents) === "audio",
		Opening: () => false,
		Unmade: () => false,
		Failed: () => false,
	});

const isMovedByHand = (room: Room, time: number): boolean =>
	isListening(room) &&
	!room.isPlaying &&
	Option.match(room.kept, {
		onNone: () => time > 0,
		onSome: (kept) => Math.abs((kept.time ?? 0) - time) > 1,
	});

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

				const index = indexOf(contents, sectionOf(sentence));

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

export const toChapter = (model: Model, index: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				if (kindOf(contents) === "audio") {
					return listenFrom(room, contents.chapters[index]?.start ?? 0);
				}

				if (kindOf(contents) === "pages") {
					const page = contents.headings[index]?.page ?? 1;
					const [turned, fetches] = turnTo(room, page - 1);

					return [turned, [...fetches, Show({ id: PRINTED })]];
				}

				const [turned, fetches] = turnTo(room, index);

				return [turned, [...fetches, ToTop()]];
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

export const turnPage = (model: Model, index: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) =>
				kindOf(contents) === "pages" &&
				index >= 0 &&
				index < contents.pictures.length
					? turnTo(room, index)
					: [room, []],
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

export const showedPage = (model: Model, index: number, at: number): Return =>
	keepIn(model, (room) => {
		const was = Option.match(room.kept, {
			onNone: () => 1,
			onSome: (kept) => kept.page,
		});

		return Option.map(
			Option.filter(
				spotOf(room),
				(spot) =>
					room.knowsPlace && spot.page === index + 1 && spot.page !== was
			),
			(spot) => [room, spot, at, []] as const
		);
	});

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

export const stampIn = (model: Model, move: Move): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) => ({ model, commands: [Stamp({ work: room.work, move })] }),
	});

export const hearOwn = (model: Model): Return =>
	inRoom(model, (room) =>
		room.knowsPlace
			? [room, []]
			: settle({
					...room,
					knowsPlace: true,
					knownPlace: placeOn(model, room.work),
				})
	);

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
		Desk: () => ({
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

export const isAlone = (model: Model, work: string): boolean =>
	Option.exists(model.shelf, ({ works }) => {
		const entry = works[work];

		return (
			entry !== undefined && editionToCopy((kind) => entry[kind]) !== undefined
		);
	});

export const copyFailureOf = (
	model: Model,
	work: string
): Option.Option<string> =>
	Option.flatMap(model.shelf, ({ copies }) => {
		const made = copies[work];

		return made?.state === "failed" ? Option.some(made.note) : Option.none();
	});

const isPressing = (model: Model, work: string): boolean =>
	Option.exists(model.shelf, ({ syncs, copies }) =>
		isAlone(model, work)
			? copies[work]?.state === "copying"
			: syncs[work]?.state === "syncing"
	);

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
