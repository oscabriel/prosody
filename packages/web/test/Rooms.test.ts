import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";

import { update } from "../src/Main.ts";
import { Book, Message, Model } from "../src/Model.ts";
import { Prosody } from "../src/Prosody.ts";
import { AppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";

/** A page offline with Carl's room open. */
const inCarl = Model.make({
	route: AppRoute.Room({ work: "w-carl" }),
	commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
	isOnline: false,
	places: {},
	copies: {},
	copying: Option.none(),
	shelf: Option.none(),
	hasAnswered: false,
	error: Option.none(),
	nightstand: Option.none(),
	room: Option.some({
		...roomOf("w-carl", false),
		book: Book.Open({
			contents: { audio: "audio.m4b", pages: [] },
			timeline: [],
		}),
	}),
});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

describe("the open room, back online", () => {
	it("opens the book again when the model has not answered its open", () => {
		const { commands } = update(inCarl, Message.WentOnline());

		expect(names(commands ?? [])).toStrictEqual(["Stamp"]);
	});

	it("leaves the nightstand alone once the model has answered", () => {
		const answered = update(
			inCarl,
			Message.ReceivedResult({
				result: Prosody.Message.SucceededOpenBook({
					commandId: "s:1",
					reply: undefined,
					receipt: { stream: "Reading/w-carl", version: 1 },
				}),
			})
		);

		const { commands } = update(answered.model, Message.WentOnline());

		expect(commands ?? []).toStrictEqual([]);
	});
});
