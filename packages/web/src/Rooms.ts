import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { WorkId } from "@prosody/domain/Library/Work.id";
import type { Contents, Timeline } from "@prosody/domain/Reading/Copy";
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
import type { Kept } from "./Places.ts";
import { Seek } from "./Player.ts";
import { Prosody } from "./Prosody.ts";
import { closed, withoutPanels } from "./RoomPanels.ts";
import { awake, sleptThrough } from "./RoomSleep.ts";
import { AppRoute } from "./Route.ts";
import {
	andThen,
	chapterOf,
	chaptersIn,
	goTo,
	inRoom,
	listenFrom,
	roomOf,
	settle,
	spotOf,
	titleOf,
	turnTo,
	withRoom,
} from "./Steps.ts";
import type { Return, Step } from "./Steps.ts";
import { Follow, Show, ToTop } from "./Text.ts";
import {
	bookDuration,
	heardOf,
	indexOf,
	sectionOf,
	sentenceAt,
	sentenceOf,
	spanOf,
	startOf,
} from "./Timeline.ts";

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

const spokenIn = (room: Room, contents: Contents): Step =>
	Option.match(room.sentence, {
		onNone: () => [room, []],
		onSome: (sentence) => {
			const index = indexOf(contents, sectionOf(sentence));

			return index === room.shown || index === -1
				? [room, []]
				: turnTo(room, index);
		},
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

				const spoken = { ...moved, sentence: Option.some(sentence) };

				if (!room.isFollowing) {
					return [spoken, []];
				}

				const [turned, fetches] = spokenIn(
					{ ...spoken, returnChapter: Option.none() },
					contents
				);

				const id = spanOf(sentence);

				return [
					turned,
					[...fetches, room.isPlaying ? Follow({ id }) : Show({ id })],
				];
			},
			Opening: () => [{ ...room, time }, []],
			Unmade: () => [{ ...room, time }, []],
			Failed: () => [{ ...room, time }, []],
		});

	const followed = Option.exists(
		model.room,
		(room) => isDue(room, at) || isMovedByHand(room, time)
	)
		? keepIn(model, (room) => {
				const [next, commands] = step(room);

				return Option.map(spotOf(next), (spot) => [next, spot, at, commands]);
			})
		: inRoom(model, step);

	return andThen(followed, (next) => sleptThrough(next, model.room, at));
};

export const played = (model: Model): Return =>
	inRoom(model, (room) => {
		const playing = {
			...room,
			isPlaying: true,
			isFollowing: true,
			returnChapter: Option.none(),
		};

		return Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				const [turned, fetches] = spokenIn(playing, contents);

				return [
					turned,
					Option.match(
						Option.filter(room.sentence, () => kindOf(contents) === "synced"),
						{
							onNone: () => fetches,
							onSome: (sentence) => [
								...fetches,
								Show({ id: spanOf(sentence) }),
							],
						}
					),
				];
			},
			Opening: () => [playing, []],
			Unmade: () => [playing, []],
			Failed: () => [playing, []],
		});
	});

export const backToPlaying = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				const [turned, fetches] = spokenIn(
					{ ...room, isFollowing: true, returnChapter: Option.none() },
					contents
				);

				return [
					turned,
					Option.match(room.sentence, {
						onNone: () => fetches,
						onSome: (sentence) => [
							...fetches,
							Follow({ id: spanOf(sentence) }),
						],
					}),
				];
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

export const returnToChapter = (model: Model): Return =>
	inRoom(model, (room) =>
		Option.match(room.returnChapter, {
			onNone: () => [room, []],
			onSome: (index) => {
				const [turned, fetches] = turnTo(
					{ ...room, returnChapter: Option.none(), isFollowing: true },
					index
				);

				const kept = Option.filter(room.sentence, (sentence) =>
					Book.match(room.book, {
						Open: ({ contents }) =>
							indexOf(contents, sectionOf(sentence)) === index,
						Opening: () => false,
						Unmade: () => false,
						Failed: () => false,
					})
				);

				return [
					turned,
					[
						...fetches,
						Option.match(kept, {
							onNone: () => ToTop(),
							onSome: (sentence) => Show({ id: spanOf(sentence) }),
						}),
					],
				];
			},
		})
	);

const lookedUp = (room: Room, contents: Contents, index: number): Room => {
	const place = chapterOf(room, contents);

	return {
		...room,
		isFollowing: !room.isPlaying,
		returnChapter:
			room.isPlaying || index === place ? Option.none() : Option.some(place),
	};
};

const turnedTo = (model: Model, index: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents, timeline }) => {
				const isPicked = Option.exists(
					room.openPanel,
					(open) => open === "toc"
				);

				const [left, focus] = isPicked
					? closed({ ...room, returnToPlayerSheet: false })
					: [room, []];

				if (kindOf(contents) === "audio") {
					const [heard, seeks] = listenFrom(
						left,
						contents.chapters[index]?.start ?? 0
					);

					return [heard, [...seeks, ...focus]];
				}

				if (kindOf(contents) === "pages") {
					const page = contents.headings[index]?.page ?? 1;
					const [turned, fetches] = turnTo(left, page - 1);

					return [turned, [...fetches, Show({ id: PRINTED }), ...focus]];
				}

				if (Option.exists(room.openPanel, (open) => open === "player")) {
					return Option.match(
						Option.fromUndefinedOr(
							heardOf(timeline).find(
								(entry) =>
									sectionOf(entry.sentence) === contents.sections[index]?.path
							)
						),
						{
							onNone: () => [room, []],
							onSome: (entry) => goTo(room, entry.sentence),
						}
					);
				}

				const [turned, fetches] = turnTo(
					isPicked
						? lookedUp(left, contents, index)
						: {
								...left,
								isFollowing: !room.isPlaying,
								returnChapter: Option.none(),
							},
					index
				);

				return [
					{ ...turned, chromeHidden: false },
					[...fetches, ToTop(), ...focus],
				];
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

export const toChapter = (model: Model, index: number): Return => {
	const turned = turnedTo(model, index);

	const title = Option.flatMap(model.room, (room) =>
		Book.match(room.book, {
			Open: ({ contents }) => Option.some(titleOf(contents, index)),
			Opening: () => Option.none(),
			Unmade: () => Option.none(),
			Failed: () => Option.none(),
		})
	);

	return Option.match(title, {
		onNone: () => turned,
		onSome: (name) => ({
			...turned,
			model: modifyFields(turned.model, {
				announcement: () => `Opened ${name}`,
			}),
		}),
	});
};

export const stepChapter = (model: Model, by: number): Return =>
	Option.match(model.room, {
		onNone: () => ({ model }),
		onSome: (room) =>
			Book.match<Return>(room.book, {
				Open: ({ contents }) => {
					const count = chaptersIn(contents).length;

					const from = ["audio", "pages"].includes(kindOf(contents))
						? chapterOf(room, contents)
						: room.shown;

					const index = from + by;

					return index < 0 || index >= count
						? { model }
						: toChapter(
								modifyFields(model, {
									room: () => Option.some(withoutPanels(room)),
								}),
								index
							);
				},
				Opening: () => ({ model }),
				Unmade: () => ({ model }),
				Failed: () => ({ model }),
			}),
	});

export const turnPage = (model: Model, index: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) =>
				kindOf(contents) === "pages" &&
				index >= 0 &&
				index < contents.pictures.length
					? turnTo({ ...room, scrubbingTime: Option.none() }, index)
					: [{ ...room, scrubbingTime: Option.none() }, []],
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

export const bookEnd = (contents: Contents, timeline: Timeline): number =>
	kindOf(contents) === "audio"
		? (contents.chapters.at(-1)?.end ?? 0)
		: bookDuration(heardOf(timeline));

export const skip = (model: Model, seconds: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents, timeline }) => {
				const end = bookEnd(contents, timeline);
				const on = Math.max(0, room.time + seconds);

				return listenFrom(room, end > 0 ? Math.min(end, on) : on);
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

export const scrubbed = (model: Model, time: number, at: number): Return => {
	const landed = inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents, timeline }) => {
				const [heard, seeks] = listenFrom(
					{ ...room, scrubbingTime: Option.none() },
					Math.min(Math.max(0, time), bookEnd(contents, timeline))
				);

				const sentence = sentenceAt(heardOf(timeline), heard.time);

				if (sentence === undefined) {
					return [heard, seeks];
				}

				const spoken = { ...heard, sentence: Option.some(sentence) };

				if (!room.isFollowing) {
					return [spoken, seeks];
				}

				const [turned, fetches] = spokenIn(spoken, contents);

				return [turned, [...seeks, ...fetches, Show({ id: spanOf(sentence) })]];
			},
			Opening: () => [{ ...room, scrubbingTime: Option.none() }, []],
			Unmade: () => [{ ...room, scrubbingTime: Option.none() }, []],
			Failed: () => [{ ...room, scrubbingTime: Option.none() }, []],
		})
	);

	return andThen(landed, (next) =>
		keepIn(next, (room) =>
			Option.map(
				Option.filter(spotOf(room), () => room.knowsPlace),
				(spot) => [room, spot, at, []] as const
			)
		)
	);
};

const isQuiet = (room: Room): boolean =>
	room.isPlaying || !room.knowsPlace || Option.isSome(room.openPanel);

export const readTo = (model: Model, id: string, at: number): Return =>
	Option.exists(model.room, isQuiet)
		? { model }
		: keepIn(model, (room) =>
				Book.match<Option.Option<Kept>>(room.book, {
					Open: ({ contents, timeline }) => {
						const sentence = sentenceOf(
							contents.sections[room.shown]?.path ?? "",
							id
						);

						const start = startOf(timeline, sentence);

						return Option.some([
							{
								...room,
								sentence: Option.some(sentence),
								time: start ?? room.time,
								returnChapter: Option.none(),
							},
							{ sentence, time: null, page: null },
							at,
							start === undefined ? [] : [Seek({ time: start, play: false })],
						] as const);
					},
					Opening: () => Option.none(),
					Unmade: () => Option.none(),
					Failed: () => Option.none(),
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

export const openAgain = (model: Model): Return =>
	inRoom(model, (room) =>
		Book.guards.Failed(room.book)
			? [{ ...room, book: Book.Opening() }, [OpenCopy({ work: room.work })]]
			: [room, []]
	);

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

const leaveRoom = (model: Model, next: AppRoute): Return => ({
	model: modifyFields(model, {
		route: () => next,
		room: () => Option.none(),
	}),
});

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
		NotFound: () => leaveRoom(model, next),
		Login: () => leaveRoom(model, next),
		Setup: () => leaveRoom(model, next),
		Invite: () => leaveRoom(model, next),
		Account: () => leaveRoom(model, next),
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
	Option.flatMap(model.shelf, ({ copies, syncs }) => {
		const made = isAlone(model, work) ? copies[work] : syncs[work];

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
						Option.some({
							...awake(withoutPanels(room)),
							book: Book.Unmade({ phase: "asked" }),
							isPlaying: false,
						}),
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
