import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { DEFAULT_APPEARANCE } from "../src/Appearance.ts";
import { update } from "../src/Main.ts";
import {
	Book,
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	Message,
	Model,
} from "../src/Model.ts";
import type { Room } from "../src/Model.ts";
import { turnOf } from "../src/Pages.ts";
import { AppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";
import { adminAda, signedInAs } from "./Readers.ts";

const contents = {
	audio: null,
	sections: [],
	chapters: [],
	cover: "cover.jpg",
	pictures: Array.from(
		{ length: 324 },
		(_, index) => `page-${String(index + 1).padStart(3, "0")}.jpg`
	),
	headings: [
		{ title: "Crunching Knowledge", page: 2 },
		{ title: "Communication and the Use of Language", page: 12 },
		{ title: "Binding Model and Implementation", page: 25 },
	],
};

const inEvans = (room: Partial<Room> = {}) =>
	Model.make({
		route: AppRoute.Room({ work: "w-evans" }),
		commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
		isOnline: true,
		places: {},
		copies: {},
		copying: Option.none(),
		shelf: Option.none(),
		hasAnswered: false,
		error: Option.none(),
		nightstand: Option.none(),
		room: Option.some({
			...roomOf("w-evans", false),
			book: Book.Open({ contents, timeline: [] }),
			...room,
		}),
		wanted: Option.none(),
		desk: {
			title: "",
			author: "",
			correcting: Option.none(),
			problem: Option.none(),
		},
		appearance: DEFAULT_APPEARANCE,
		systemDark: false,
		toast: Option.none(),
		confirm: Option.none(),
		announcement: "",
		shelfUi: DEFAULT_SHELF_UI,
		deskUi: DEFAULT_DESK_UI,
		...signedInAs(adminAda),
	});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

const shownIn = (model: Model) => Option.map(model.room, (room) => room.shown);

const atPage = (page: number, at: number) => ({
	sentence: null,
	time: null,
	page,
	at,
	device: "iphone",
});

describe("a book of pages", () => {
	it("opens at the page you were at", () => {
		const { model } = update(
			inEvans(),
			Message.ReceivedPlace({
				state: Option.some({ place: atPage(40, 1000) }),
				cursor: 1,
			})
		);

		expect(shownIn(model)).toStrictEqual(Option.some(39));
	});

	it("keeps nothing for the page it opens at", () => {
		const opened = inEvans({
			shown: 39,
			kept: Option.some(atPage(40, 1000)),
		});

		const { commands } = update(
			opened,
			Message.ShowedPage({ index: 39, at: 2000 })
		);

		expect(commands ?? []).toStrictEqual([]);
	});

	it("keeps the page you turn to once it is on show", () => {
		const turned = update(
			inEvans({ knowsPlace: true }),
			Message.TurnedPage({ index: 1 })
		);

		expect(shownIn(turned.model)).toStrictEqual(Option.some(1));
		expect(turned.commands ?? []).toStrictEqual([]);

		const { model, commands } = update(
			turned.model,
			Message.ShowedPage({ index: 1, at: 2000 })
		);

		expect(model.places["w-evans"]).toStrictEqual({
			sentence: null,
			time: null,
			page: 2,
			at: 2000,
			commandId: "s:0",
		});
		expect(names(commands ?? [])).toStrictEqual(["SavePlaces", "KeepPlace"]);
	});

	it("keeps nothing before your place is known", () => {
		const turned = update(inEvans(), Message.TurnedPage({ index: 1 }));

		const { model, commands } = update(
			turned.model,
			Message.ShowedPage({ index: 1, at: 2000 })
		);

		expect(model.places).toStrictEqual({});
		expect(commands ?? []).toStrictEqual([]);
	});

	it("turns to no page before the first or after the last", () => {
		expect(
			shownIn(update(inEvans(), Message.TurnedPage({ index: -1 })).model)
		).toStrictEqual(Option.some(0));
		expect(
			shownIn(
				update(inEvans({ shown: 323 }), Message.TurnedPage({ index: 324 }))
					.model
			)
		).toStrictEqual(Option.some(323));
	});

	it("turns to the page a chapter begins on, and brings it into view", () => {
		const { model, commands } = update(
			inEvans(),
			Message.ClickedChapter({ index: 1 })
		);

		expect(shownIn(model)).toStrictEqual(Option.some(11));
		expect(names(commands ?? [])).toStrictEqual(["Show"]);
	});
});

describe("a touch on a page", () => {
	const page = { left: 100, width: 300 };

	it("turns on when it taps the right quarter, and back on the left quarter", () => {
		expect(turnOf({ x: 380, y: 50 }, { x: 382, y: 52 }, page)).toBe("next");
		expect(turnOf({ x: 150, y: 50 }, { x: 150, y: 50 }, page)).toBe("prev");
	});

	it("shows or hides the controls when it taps the middle half", () => {
		expect(turnOf({ x: 250, y: 50 }, { x: 250, y: 50 }, page)).toBe("toggle");
		expect(turnOf({ x: 180, y: 50 }, { x: 180, y: 50 }, page)).toBe("toggle");
		expect(turnOf({ x: 320, y: 50 }, { x: 320, y: 50 }, page)).toBe("toggle");
	});

	it("turns on when it swipes to the left, and back to the right", () => {
		expect(turnOf({ x: 300, y: 50 }, { x: 200, y: 70 }, page)).toBe("next");
		expect(turnOf({ x: 200, y: 50 }, { x: 300, y: 30 }, page)).toBe("prev");
	});

	it("turns nothing when it scrolls or drags a little", () => {
		expect(turnOf({ x: 200, y: 300 }, { x: 230, y: 100 }, page)).toBe("none");
		expect(turnOf({ x: 200, y: 300 }, { x: 230, y: 300 }, page)).toBe("none");
	});
});

describe("the page bar", () => {
	it("shows the page the scrubber is held at, and turns to it when let go", () => {
		const held = update(inEvans(), Message.ScrubbedAudio({ time: 120 }));

		expect(
			Option.flatMap(held.model.room, (room) => room.scrubbingTime)
		).toStrictEqual(Option.some(120));
		expect(shownIn(held.model)).toStrictEqual(Option.some(0));

		const let_go = update(held.model, Message.TurnedPage({ index: 119 }));

		expect(shownIn(let_go.model)).toStrictEqual(Option.some(119));
		expect(
			Option.flatMap(let_go.model.room, (room) => room.scrubbingTime)
		).toStrictEqual(Option.none());
	});

	it("goes to the page asked for, and closes the question", () => {
		const asked = update(
			inEvans(),
			Message.OpenedPanel({ panel: "jump", fromPlayerSheet: false })
		);

		const { model, commands } = update(
			asked.model,
			Message.JumpedToPage({ page: 200 })
		);

		expect(shownIn(model)).toStrictEqual(Option.some(199));
		expect(Option.flatMap(model.room, (room) => room.openPanel)).toStrictEqual(
			Option.none()
		);
		expect(names(commands ?? [])).toStrictEqual(["FocusOn"]);
	});

	it("goes to no page the book does not have", () => {
		const asked = update(
			inEvans({ shown: 10 }),
			Message.OpenedPanel({ panel: "jump", fromPlayerSheet: false })
		);

		for (const page of [0, 325, -3]) {
			const { model } = update(asked.model, Message.JumpedToPage({ page }));

			expect(shownIn(model)).toStrictEqual(Option.some(10));
			expect(
				Option.flatMap(model.room, (room) => room.openPanel)
			).toStrictEqual(Option.some("jump"));
		}
	});
});

describe("the keys of a book of pages", () => {
	it("turn the page on the arrows and the page keys", () => {
		const on = update(inEvans(), Message.PressedRoomKey({ key: "ArrowRight" }));

		expect(shownIn(on.model)).toStrictEqual(Option.some(1));

		const further = update(
			on.model,
			Message.PressedRoomKey({ key: "PageDown" })
		);

		expect(shownIn(further.model)).toStrictEqual(Option.some(2));

		const back = update(
			further.model,
			Message.PressedRoomKey({ key: "PageUp" })
		);

		expect(shownIn(back.model)).toStrictEqual(Option.some(1));
		expect(
			shownIn(
				update(inEvans(), Message.PressedRoomKey({ key: "ArrowLeft" })).model
			)
		).toStrictEqual(Option.some(0));
	});

	it("ask for a page on G, and move by heading on the brackets", () => {
		const asked = update(inEvans(), Message.PressedRoomKey({ key: "G" }));

		expect(
			Option.flatMap(asked.model.room, (room) => room.openPanel)
		).toStrictEqual(Option.some("jump"));

		const next = update(
			inEvans({ shown: 1 }),
			Message.PressedRoomKey({ key: "BracketRight" })
		);

		expect(shownIn(next.model)).toStrictEqual(Option.some(11));
	});

	it("show and hide the controls from a tap on the page", () => {
		const hidden = update(inEvans(), Message.ToggledChrome());

		expect(
			Option.map(hidden.model.room, (room) => room.chromeHidden)
		).toStrictEqual(Option.some(true));
	});
});
