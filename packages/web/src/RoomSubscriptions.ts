import { Clock, Duration, Effect, Option, Schema, Stream } from "effect";
import { Dom, Subscription } from "foldkit";

import type { Kind } from "./Copy.ts";
import { Message } from "./Model.ts";
import type { Model, RoomKey } from "./Model.ts";
import type { Reader } from "./Prosody.ts";
import { kindIn } from "./Steps.ts";
import { isJumpingItself, isScrollingItself } from "./Text.ts";

const KindName = Schema.Literals(["synced", "text", "audio", "pages"]);

const SLEEP_TICK = Duration.seconds(20);

const HIDE_AFTER = 80;

const SHOW_AFTER = 12;

const NEAR_TOP = 40;

const YIELD_AFTER = 14;

const CONTROLS =
	'button, a, summary, input, textarea, select, [role="button"], [contenteditable]';

const press = (
	keys: string,
	key: RoomKey,
	whenRepeated: "Allow" | "Ignore" = "Ignore"
): Dom.KeyBinding<Message> => ({
	keys,
	whenRepeated,
	mapEvent: () => Message.PressedRoomKey({ key }),
});

const SHARED = [
	press("T", "T"),
	press("[", "BracketLeft"),
	press("]", "BracketRight"),
];

const HEARD = [
	press("ArrowLeft", "ArrowLeft"),
	press("ArrowRight", "ArrowRight"),
	press(",", "Comma"),
	press(".", "Period"),
];

const READ = [
	press("-", "Minus"),
	press("=", "Equal"),
	press("Plus", "Equal"),
	press("Shift+Plus", "Equal"),
	press("0", "Zero"),
];

const LEAFED = [
	press("ArrowLeft", "ArrowLeft", "Allow"),
	press("ArrowRight", "ArrowRight", "Allow"),
	press("PageUp", "PageUp", "Allow"),
	press("PageDown", "PageDown", "Allow"),
	press("G", "G"),
];

const BINDINGS: Readonly<Record<Kind, ReadonlyArray<Dom.KeyBinding<Message>>>> =
	{
		synced: [...SHARED, ...HEARD, ...READ, press("F", "F")],
		text: [...SHARED, ...READ],
		audio: [...SHARED, ...HEARD],
		pages: [...SHARED, ...LEAFED],
	};

const kindOpen = (model: Model): Option.Option<Kind> =>
	Option.flatMap(
		Option.filter(model.room, () => Option.isNone(model.confirm)),
		kindIn
	);

const isOnControl = (target: EventTarget | null): boolean =>
	target instanceof Element && target.closest(CONTROLS) !== null;

const isPlain = (event: KeyboardEvent): boolean =>
	!(
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.isComposing
	);

const spaces = Dom.streamFromEventFilterMapPreventDefault({
	target: () => window,
	type: "keydown",
	filterMapEvent: (event) =>
		event.key === " " &&
		!event.defaultPrevented &&
		isPlain(event) &&
		!event.repeat &&
		!isOnControl(event.target)
			? Option.some(Message.PressedRoomKey({ key: "Space" }))
			: Option.none(),
});

const escapes = Dom.streamFromEventFilterMapPreventDefault({
	target: () => window,
	type: "keydown",
	filterMapEvent: (event) =>
		event.key === "Escape" && !event.isComposing && !event.defaultPrevented
			? Option.some(Message.PressedRoomKey({ key: "Escape" }))
			: Option.none(),
});

export interface Travel {
	readonly from: number;
	readonly last: number;
}

export const travelled = (travel: Travel, y: number): Travel => {
	const wasGoingDown = travel.last >= travel.from;
	const isGoingDown = y >= travel.last;

	return wasGoingDown === isGoingDown
		? { from: travel.from, last: y }
		: { from: travel.last, last: y };
};

export const chromeAfter = (
	travel: Travel,
	y: number,
	hidden: boolean
): boolean => {
	if (y <= NEAR_TOP) {
		return false;
	}

	const moved = y - travel.from;

	if (moved > HIDE_AFTER) {
		return true;
	}

	return moved < -SHOW_AFTER ? false : hidden;
};

const chromeScrolls = (hidden: boolean): Stream.Stream<Message> =>
	Stream.suspend(() => {
		const start = window.scrollY;
		let travel: Travel = { from: start, last: start };

		return Dom.streamFromEventFilterMap({
			target: window,
			type: "scroll",
			options: { passive: true },
			filterMapEvent: () => {
				const y = window.scrollY;

				if (isJumpingItself()) {
					travel = { from: y, last: y };

					return Option.none();
				}

				travel = travelled(travel, y);

				const next = chromeAfter(travel, y, hidden);

				return next === hidden
					? Option.none()
					: Option.some(Message.SetChromeHidden({ hidden: next }));
			},
		});
	});

const BY_HAND = 250;

const handled = (type: "wheel" | "touchmove") =>
	Dom.streamFromEvent({
		target: window,
		type,
		options: { passive: true },
		mapEvent: () => performance.now(),
	});

const yields: Stream.Stream<Message> = Stream.suspend(() => {
	let from = window.scrollY;
	let touched = 0;

	const hands = Stream.merge(handled("wheel"), handled("touchmove")).pipe(
		Stream.flatMap((at) => {
			touched = at;

			return Stream.empty;
		})
	);

	const scrolls = Dom.streamFromEventFilterMap({
		target: window,
		type: "scroll",
		options: { passive: true },
		filterMapEvent: () => {
			const y = window.scrollY;
			const isByHand = performance.now() - touched < BY_HAND;

			if (isScrollingItself() && !isByHand) {
				from = y;

				return Option.none();
			}

			return Math.abs(y - from) > YIELD_AFTER
				? Option.some(Message.YieldedFollow())
				: Option.none();
		},
	});

	return Stream.merge(hands, scrolls);
});

const sleepClock: Stream.Stream<Message> = Stream.tick(SLEEP_TICK).pipe(
	Stream.mapEffect(() => Clock.currentTimeMillis),
	Stream.map((now) => Message.SleepTimerTicked({ now }))
);

const sleepEnd = (endsAt: number): Stream.Stream<Message> =>
	Stream.fromEffect(
		Clock.currentTimeMillis.pipe(
			Effect.flatMap((now) =>
				Effect.sleep(Duration.millis(Math.max(0, endsAt - now)))
			),
			Effect.as(Message.SleepTimerFired())
		)
	);

export const roomSubscriptions: Subscription.Subscriptions<
	Model,
	Message,
	Reader
> = Subscription.make<Model, Message, Reader>()((entry) => ({
	roomKeys: entry(
		{ kind: Schema.Option(KindName) },
		{
			modelToDependencies: (model) => ({ kind: kindOpen(model) }),
			dependenciesToStream: ({ kind }) =>
				Option.match(kind, {
					onNone: () => Stream.empty,
					onSome: (open) =>
						Dom.streamFromKeyBindings<Message>({ bindings: BINDINGS[open] }),
				}),
		}
	),
	roomSpace: entry(
		{ isHeard: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isHeard: Option.exists(
					kindOpen(model),
					(kind) => kind === "synced" || kind === "audio"
				),
			}),
			dependenciesToStream: ({ isHeard }) => (isHeard ? spaces : Stream.empty),
		}
	),
	roomEscape: entry(
		{ isArmed: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isArmed:
					Option.isNone(model.confirm) &&
					Option.exists(
						model.room,
						(room) => room.chromeHidden || Option.isSome(room.openPanel)
					),
			}),
			dependenciesToStream: ({ isArmed }) => (isArmed ? escapes : Stream.empty),
		}
	),
	roomChrome: entry(
		{ isRead: Schema.Boolean, hidden: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isRead: Option.exists(
					model.room,
					(room) =>
						Option.isNone(room.openPanel) &&
						Option.exists(
							kindIn(room),
							(kind) => kind === "synced" || kind === "text"
						)
				),
				hidden: Option.exists(model.room, (room) => room.chromeHidden),
			}),
			dependenciesToStream: ({ isRead, hidden }) =>
				isRead ? chromeScrolls(hidden) : Stream.empty,
		}
	),
	roomYield: entry(
		{ isFollowed: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isFollowed: Option.exists(
					model.room,
					(room) =>
						room.isPlaying &&
						room.isFollowing &&
						Option.exists(kindIn(room), (kind) => kind === "synced")
				),
			}),
			dependenciesToStream: ({ isFollowed }) =>
				isFollowed ? yields : Stream.empty,
		}
	),
	roomSleep: entry(
		{ isSet: Schema.Boolean, endsAt: Schema.Option(Schema.Finite) },
		{
			modelToDependencies: (model) => ({
				isSet: Option.exists(model.room, (room) =>
					Option.isSome(room.sleepMinutes)
				),
				endsAt: Option.flatMap(model.room, (room) => room.sleepEndsAt),
			}),
			dependenciesToStream: ({ isSet, endsAt }) => {
				if (!isSet) {
					return Stream.empty;
				}

				return Option.match(endsAt, {
					onNone: () => sleepClock,
					onSome: (end) => Stream.merge(sleepClock, sleepEnd(end)),
				});
			},
		}
	),
}));
