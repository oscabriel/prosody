import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { update } from "../src/Main.ts";
import { Book, Message, Model } from "../src/Model.ts";
import type { Room } from "../src/Model.ts";
import { turnOf } from "../src/Pages.ts";
import { AppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";

/** Domain-Driven Design as a book of pages: 324 pictures and three chapters. */
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

/** A page online with Domain-Driven Design's room open, before any place has come. */
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
	});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

const shownIn = (model: Model) => Option.map(model.room, (room) => room.shown);

/** A place at a page, kept on the phone. */
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

	it("turns on when it taps the right of the page, and back on its left third", () => {
		expect(turnOf({ x: 300, y: 50 }, { x: 302, y: 52 }, page)).toBe(1);
		expect(turnOf({ x: 150, y: 50 }, { x: 150, y: 50 }, page)).toBe(-1);
	});

	it("turns on when it swipes to the left, and back to the right", () => {
		expect(turnOf({ x: 300, y: 50 }, { x: 200, y: 70 }, page)).toBe(1);
		expect(turnOf({ x: 200, y: 50 }, { x: 300, y: 30 }, page)).toBe(-1);
	});

	it("turns nothing when it scrolls", () => {
		expect(turnOf({ x: 200, y: 300 }, { x: 230, y: 100 }, page)).toBe(0);
	});
});
