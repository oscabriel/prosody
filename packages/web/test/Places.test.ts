import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { Sentence } from "@prosody/domain/Reading/Sentence";
import { Option } from "effect";

import { update } from "../src/Main.ts";
import { Message, Model } from "../src/Model.ts";
import type { Places } from "../src/Model.ts";
import { answered, learnPlace, sendWaiting } from "../src/Places.ts";
import { AppRoute } from "../src/Route.ts";
import { roomOf } from "../src/Steps.ts";

const at = (span: string) => Sentence.make(`OEBPS/ch1.xhtml#${span}`);

/** A place at a sentence, kept at `when`. */
const place = (span: string, when: number) => ({
	sentence: at(span),
	time: null,
	page: null,
	at: when,
});

/** A page with these places on its device. */
const withPlaces = (places: Places) =>
	Model.make({
		route: AppRoute.Shelf(),
		commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
		isOnline: true,
		places,
		copies: {},
		copying: Option.none(),
		shelf: Option.none(),
		hasAnswered: false,
		error: Option.none(),
		nightstand: Option.none(),
		room: Option.none(),
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

describe("your places on the device", () => {
	it("send every place still waiting, and only those", () => {
		const model = withPlaces({
			"w-carl": { ...place("ps-2", 2000), commandId: "s:1" },
			"w-odyssey": { ...place("ps-9", 1000), commandId: null },
		});

		expect(names(sendWaiting(model))).toStrictEqual(["KeepPlace"]);
	});

	it("stop waiting once the model answers, and remember that", () => {
		const model = withPlaces({
			"w-carl": { ...place("ps-2", 2000), commandId: "s:1" },
		});

		const { model: next, commands } = answered(model, "s:1");

		expect(next.places["w-carl"]?.commandId).toBeNull();
		expect(names(commands ?? [])).toStrictEqual(["SavePlaces"]);
	});

	it("take a place heard from the model only when it is newer", () => {
		const model = withPlaces({
			"w-carl": { ...place("ps-2", 2000), commandId: "s:1" },
		});

		const [older] = learnPlace(model, "w-carl", place("ps-1", 1000));
		const [newer] = learnPlace(model, "w-carl", place("ps-7", 3000));

		expect(older.places["w-carl"]?.sentence).toStrictEqual(at("ps-2"));

		expect(newer.places["w-carl"]).toStrictEqual({
			...place("ps-7", 3000),
			commandId: null,
		});
	});

	it("keep a newer place heard in the open room on the device", () => {
		const model = Model.make({
			...withPlaces({}),
			room: Option.some(roomOf("w-carl", false)),
		});

		const { model: next, commands } = update(
			model,
			Message.ReceivedPlace({
				state: Option.some({
					place: { ...place("ps-7", 3000), device: "iphone" },
				}),
				cursor: 1,
			})
		);

		expect(next.places["w-carl"]).toStrictEqual({
			...place("ps-7", 3000),
			commandId: null,
		});

		expect(names(commands ?? [])).toStrictEqual(["SavePlaces"]);
	});
});
