import { Match, Option } from "effect";
import { modifyFields } from "foldkit/struct";

import {
	clampTextSize,
	DEFAULT_APPEARANCE,
	stepTextSize,
} from "./Appearance.ts";
import { kindOf } from "./Copy.ts";
import type { Kind } from "./Copy.ts";
import { Book } from "./Model.ts";
import type { Model, Room, RoomKey, RoomMessage } from "./Model.ts";
import { Pause, Play, SetRate, SKIP_AHEAD, SKIP_BACK } from "./Player.ts";
import { closed, opened } from "./RoomPanels.ts";
import {
	backToPlaying,
	openAgain,
	returnToChapter,
	scrubbed,
	skip,
	stepChapter,
	turnPage,
} from "./Rooms.ts";
import {
	awake,
	fallAsleep,
	sleepAfter,
	sleepAtChapterEnd,
	sleepClocked,
} from "./RoomSleep.ts";
import { andThen, inRoom, kindIn, turnTo } from "./Steps.ts";
import type { Return, Step } from "./Steps.ts";
import { ApplyAppearance, showToast } from "./Ui.ts";

export const SLOWEST = 0.75;

export const FASTEST = 2.5;

const NUDGE = 0.1;

export const rateOf = (rate: number): number =>
	Math.round(Math.min(FASTEST, Math.max(SLOWEST, rate)) * 20) / 20;

export const rateLabel = (rate: number): string =>
	`${Number(rate.toFixed(2))}×`;

const resize = (model: Model, size: number): Return => {
	const appearance = { ...model.appearance, size: clampTextSize(size) };

	return {
		model: modifyFields(model, {
			appearance: () => appearance,
			announcement: () => `Text size ${appearance.size}%`,
		}),
		commands: [ApplyAppearance({ appearance })],
	};
};

const setSpeed = (model: Model, rate: number): Return => {
	const next = rateOf(rate);

	return andThen(
		inRoom(model, (room) => [
			{ ...room, rate: next },
			[SetRate({ rate: next })],
		]),
		(sped) => ({
			model: modifyFields(sped, {
				announcement: () => `Speed ${rateLabel(next)}`,
			}),
		})
	);
};

const setSleep = (
	model: Model,
	minutes: Option.Option<number>,
	endOfChapter: boolean
): Return => {
	const notice = endOfChapter
		? "Will pause at end of chapter"
		: Option.match(minutes, {
				onNone: () => "Sleep timer off",
				onSome: (count) => `Sleep timer set for ${count} minutes`,
			});

	return andThen(
		inRoom(model, (room) =>
			closed(
				endOfChapter
					? sleepAtChapterEnd(room)
					: Option.match(minutes, {
							onNone: () => awake(room),
							onSome: (count) => sleepAfter(room, count),
						})
			)
		),
		(set) => ({ model: showToast(set, notice) })
	);
};

const jumpToPage = (model: Model, page: number): Return =>
	inRoom(model, (room) =>
		Book.match<Step>(room.book, {
			Open: ({ contents }) => {
				if (
					kindOf(contents) !== "pages" ||
					page < 1 ||
					page > contents.pictures.length
				) {
					return [room, []];
				}

				const [left, focus] = closed(room);
				const [turned, fetches] = turnTo(left, page - 1);

				return [turned, [...fetches, ...focus]];
			},
			Opening: () => [room, []],
			Unmade: () => [room, []],
			Failed: () => [room, []],
		})
	);

const hasAudio = (kind: Kind): boolean => kind === "synced" || kind === "audio";

const hasText = (kind: Kind): boolean => kind === "synced" || kind === "text";

const hasContents = (room: Room): boolean =>
	Book.match(room.book, {
		Open: ({ contents }) =>
			kindOf(contents) !== "pages" || contents.headings.length > 0,
		Opening: () => false,
		Unmade: () => false,
		Failed: () => false,
	});

const leafOrSkip = (
	model: Model,
	room: Room,
	kind: Kind,
	by: number
): Return => {
	if (kind === "pages") {
		return turnPage(model, room.shown + by);
	}

	return hasAudio(kind)
		? skip(model, by > 0 ? SKIP_AHEAD : -SKIP_BACK)
		: { model };
};

const keyIn = (model: Model, room: Room, kind: Kind, key: RoomKey): Return =>
	Match.value(key).pipe(
		Match.when("Escape", () => ({ model })),
		Match.when("Space", () =>
			hasAudio(kind)
				? { model, commands: [room.isPlaying ? Pause() : Play()] }
				: { model }
		),
		Match.when("ArrowLeft", () => leafOrSkip(model, room, kind, -1)),
		Match.when("ArrowRight", () => leafOrSkip(model, room, kind, 1)),
		Match.when("PageUp", () =>
			kind === "pages" ? turnPage(model, room.shown - 1) : { model }
		),
		Match.when("PageDown", () =>
			kind === "pages" ? turnPage(model, room.shown + 1) : { model }
		),
		Match.when("T", () =>
			hasContents(room)
				? inRoom(model, (open) => opened(open, "toc", false))
				: { model }
		),
		Match.when("BracketLeft", () => stepChapter(model, -1)),
		Match.when("BracketRight", () => stepChapter(model, 1)),
		Match.when("Comma", () =>
			hasAudio(kind) ? setSpeed(model, room.rate - NUDGE) : { model }
		),
		Match.when("Period", () =>
			hasAudio(kind) ? setSpeed(model, room.rate + NUDGE) : { model }
		),
		Match.when("F", () =>
			kind === "synced" ? backToPlaying(model) : { model }
		),
		Match.when("Minus", () =>
			hasText(kind)
				? resize(model, stepTextSize(model.appearance.size, -1))
				: { model }
		),
		Match.when("Equal", () =>
			hasText(kind)
				? resize(model, stepTextSize(model.appearance.size, 1))
				: { model }
		),
		Match.when("Zero", () =>
			hasText(kind) ? resize(model, DEFAULT_APPEARANCE.size) : { model }
		),
		Match.when("G", () =>
			kind === "pages"
				? inRoom(model, (open) => opened(open, "jump", false))
				: { model }
		),
		Match.exhaustive
	);

const pressKey = (model: Model, key: RoomKey): Return =>
	Option.match(
		Option.filter(model.room, () => Option.isNone(model.confirm)),
		{
			onNone: () => ({ model }),
			onSome: (room) => {
				if (key === "Escape") {
					return inRoom(model, (open) =>
						Option.isSome(open.openPanel)
							? closed(open)
							: [{ ...open, chromeHidden: false }, []]
					);
				}

				return Option.match(kindIn(room), {
					onNone: () => ({ model }),
					onSome: (kind) => keyIn(model, room, kind, key),
				});
			},
		}
	);

export const updateRoom = (model: Model, message: RoomMessage): Return =>
	Match.value(message).pipe(
		Match.tagsExhaustive({
			ToggledChrome: () =>
				inRoom(model, (room) => [
					{ ...room, chromeHidden: !room.chromeHidden },
					[],
				]),
			SetChromeHidden: ({ hidden }) =>
				inRoom(model, (room) => [
					{
						...room,
						chromeHidden: hidden && Option.isNone(room.openPanel),
					},
					[],
				]),
			OpenedPanel: ({ panel, fromPlayerSheet }) =>
				inRoom(model, (room) => opened(room, panel, fromPlayerSheet)),
			ClosedPanels: () => inRoom(model, closed),
			ScrubbedAudio: ({ time }) =>
				inRoom(model, (room) => [
					{ ...room, scrubbingTime: Option.some(time) },
					[],
				]),
			CommittedScrub: ({ time, at }) => scrubbed(model, time, at),
			SetSpeed: ({ rate }) => setSpeed(model, rate),
			SetSleepTimer: ({ minutes, endOfChapter }) =>
				setSleep(model, minutes, endOfChapter),
			SleepTimerFired: () => fallAsleep(model),
			SleepTimerTicked: ({ now }) => sleepClocked(model, now),
			YieldedFollow: () =>
				inRoom(model, (room) => [{ ...room, isFollowing: false }, []]),
			ClickedBackToPlaying: () => backToPlaying(model),
			ClickedReturnChapter: () => returnToChapter(model),
			JumpedToPage: ({ page }) => jumpToPage(model, page),
			CompletedRoomDom: () => ({ model }),
			PressedRoomKey: ({ key }) => pressKey(model, key),
			DismissedElsewhere: () =>
				inRoom(model, (room) => [{ ...room, elsewhere: Option.none() }, []]),
			ClickedOpenAgain: () => openAgain(model),
		})
	);
