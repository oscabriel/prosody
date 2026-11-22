import { Effect, Option, Schema } from "effect";
import { Command, Dom, Render } from "foldkit";

import { Message, RoomPanel } from "./Model.ts";
import type { Room } from "./Model.ts";
import type { Step } from "./Steps.ts";

const WITHIN =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export const panelId = (panel: RoomPanel): string => `room-panel-${panel}`;

export const openerId = (panel: RoomPanel): string => `room-open-${panel}`;

export const sheetOpenerId = (panel: RoomPanel): string =>
	`sheet-open-${panel}`;

export const isOpen = (room: Room, panel: RoomPanel): boolean =>
	Option.exists(room.openPanel, (open) => open === panel);

const enter = (panel: RoomPanel): void => {
	const within = document.querySelector(`#${panelId(panel)}`);

	if (!(within instanceof HTMLElement)) {
		return;
	}

	const first = within.querySelector(WITHIN);

	if (first instanceof HTMLElement) {
		first.focus({ preventScroll: true });
	}

	if (first instanceof HTMLInputElement && first.type === "number") {
		first.select();
	}

	within
		.querySelector('[aria-current="location"]')
		?.scrollIntoView({ block: "center" });
};

export const EnterPanel = Command.define("EnterPanel", {
	args: { panel: RoomPanel },
	messages: [Message.CompletedRoomDom],
	execute: ({ panel }) =>
		Render.afterCommit.pipe(
			Effect.map(() => {
				enter(panel);

				return Message.CompletedRoomDom();
			})
		),
});

export const FocusOn = Command.define("FocusOn", {
	args: { id: Schema.String },
	messages: [Message.CompletedRoomDom],
	execute: ({ id }) =>
		Dom.focus(`#${id}`, { preventScroll: true }).pipe(
			Effect.ignore,
			Effect.as(Message.CompletedRoomDom())
		),
});

const shut = (room: Room): Room => ({
	...room,
	openPanel: Option.none(),
	returnToPlayerSheet: false,
	scrubbingTime: Option.none(),
});

export const withoutPanels = shut;

export const closed = (room: Room): Step =>
	Option.match(room.openPanel, {
		onNone: () => [room, []],
		onSome: (panel) =>
			room.returnToPlayerSheet && panel !== "player"
				? [
						{ ...shut(room), openPanel: Option.some("player") },
						[FocusOn({ id: sheetOpenerId(panel) })],
					]
				: [
						{ ...shut(room), chromeHidden: false },
						[FocusOn({ id: openerId(panel) })],
					],
	});

export const opened = (
	room: Room,
	panel: RoomPanel,
	fromPlayerSheet: boolean
): Step =>
	isOpen(room, panel)
		? closed(room)
		: [
				{
					...shut(room),
					openPanel: Option.some(panel),
					returnToPlayerSheet: fromPlayerSheet,
					chromeHidden: false,
				},
				[EnterPanel({ panel })],
			];
