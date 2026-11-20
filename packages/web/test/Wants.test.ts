import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { StillObligated } from "@prosody/domain/Acquisition/ReleasePayload.command";
import { Option, Schema } from "effect";

import { update } from "../src/Main.ts";
import { Message, Model } from "../src/Model.ts";
import { Prosody } from "../src/Prosody.ts";
import { AppRoute } from "../src/Route.ts";

/** A page online at the desk, its form filled in with this title and author. */
const atDesk = (title: string, author: string) =>
	Model.make({
		route: AppRoute.Desk(),
		commandIds: DomainFoldkit.CommandIds.make({ session: "s", sent: 0 }),
		isOnline: true,
		places: {},
		copies: {},
		copying: Option.none(),
		shelf: Option.none(),
		hasAnswered: false,
		error: Option.none(),
		nightstand: Option.none(),
		room: Option.none(),
		wanted: Option.none(),
		desk: { title, author, correcting: Option.none(), problem: Option.none() },
	});

/** A command's answer that the connection lost. */
const Lost = Schema.TaggedStruct("Unknown", {});

/** A command's answer that the model refused. */
const Refused = Schema.TaggedStruct("Rejected", { rejection: Schema.Any });

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

describe("wanting a book at the desk", () => {
	it("makes the book a work id, and empties the form", () => {
		const { model, commands } = update(
			atDesk(" Project Hail Mary ", "Andy Weir"),
			Message.SubmittedWant()
		);

		expect(names(commands ?? [])).toStrictEqual(["MintWork"]);
		expect(model.desk).toStrictEqual({
			title: "",
			author: "",
			correcting: Option.none(),
			problem: Option.none(),
		});
	});

	it("asks for both a title and an author", () => {
		const { model, commands } = update(
			atDesk("Project Hail Mary", "  "),
			Message.SubmittedWant()
		);

		expect(commands ?? []).toStrictEqual([]);
		expect(Option.isSome(model.desk.problem)).toBeTruthy();
	});

	it("keeps the book in the form while the desk can't be reached", () => {
		const { model, commands } = update(
			{ ...atDesk("Project Hail Mary", "Andy Weir"), isOnline: false },
			Message.SubmittedWant()
		);

		expect(commands ?? []).toStrictEqual([]);
		expect(model.desk.title).toBe("Project Hail Mary");
		expect(Option.isSome(model.desk.problem)).toBeTruthy();
	});

	it("sends the want under its new work id", () => {
		const { commands } = update(
			atDesk("", ""),
			Message.MintedWork({
				work: "w-0123456789ab",
				title: "Project Hail Mary",
				author: "Andy Weir",
			})
		);

		expect(names(commands ?? [])).toStrictEqual(["WantBook"]);
	});

	it("says so when the want is lost, and goes offline", () => {
		const { model } = update(
			atDesk("", ""),
			Message.ReceivedResult({
				result: Prosody.Message.FailedWantBook({
					commandId: "s:1",
					failure: Lost.make({}),
				}),
			})
		);

		expect(Option.isSome(model.desk.problem)).toBeTruthy();
		expect(model.isOnline).toBeFalsy();
	});

	it("puts by what went wrong once something else is sent", () => {
		const { model, commands } = update(
			{
				...atDesk("", ""),
				desk: {
					title: "",
					author: "",
					correcting: Option.none(),
					problem: Option.some("Not sent: the model could not be reached."),
				},
			},
			Message.ClickedWithdraw({ work: "w-0123456789ab" })
		);

		expect(names(commands ?? [])).toStrictEqual(["WithdrawWant"]);
		expect(model.desk.problem).toStrictEqual(Option.none());
	});
});

describe("the desk", () => {
	it("is empty when nothing was ever wanted", () => {
		const { model } = update(
			atDesk("", ""),
			Message.ReceivedWanted({ state: Option.none(), cursor: 0 })
		);

		expect(model.wanted).toStrictEqual(
			Option.some({ wants: {}, catalogue: {}, grabs: {} })
		);
	});
});

/** The desk, wanting Project Hail Mary, as typed and as Open Library knows it. */
const wantingHailMary = Model.make({
	...atDesk("", ""),
	wanted: Option.some({
		wants: {
			"w-0123456789ab": {
				title: "project hail mary",
				author: "weir",
				at: 0,
				state: "offered",
				note: "",
				offers: [],
				grabbed: [],
			},
		},
		catalogue: {
			"w-0123456789ab": {
				title: "Project Hail Mary",
				author: "Andy Weir",
				description: { year: 2021, openLibrary: null, recording: null },
			},
		},
		grabs: {},
	}),
});

describe("correcting a title at the desk", () => {
	it("opens on the work as the catalogues name it, and sends what you change", () => {
		const { model: opened } = update(
			wantingHailMary,
			Message.ClickedCorrect({ work: "w-0123456789ab" })
		);

		expect(opened.desk.correcting).toStrictEqual(
			Option.some({
				work: "w-0123456789ab",
				title: "Project Hail Mary",
				author: "Andy Weir",
			})
		);

		const { model: changed } = update(
			opened,
			Message.ChangedCorrectTitle({ value: "Project Hail Mary " })
		);

		const { model, commands } = update(changed, Message.SubmittedCorrection());

		expect(names(commands ?? [])).toStrictEqual(["CorrectTitle"]);
		expect(model.desk.correcting).toStrictEqual(Option.none());
	});

	it("keeps the correction in the form while the desk can't be reached", () => {
		const { model: opened } = update(
			{ ...wantingHailMary, isOnline: false },
			Message.ClickedCorrect({ work: "w-0123456789ab" })
		);

		const { model, commands } = update(opened, Message.SubmittedCorrection());

		expect(commands ?? []).toStrictEqual([]);
		expect(model.desk.correcting).toStrictEqual(opened.desk.correcting);
		expect(Option.isSome(model.desk.problem)).toBeTruthy();
	});
});

describe("a grab at the desk", () => {
	it("is sent for one of a want's offers", () => {
		const { commands } = update(
			wantingHailMary,
			Message.ClickedGrab({ work: "w-0123456789ab", release: "1_guid" })
		);

		expect(names(commands ?? [])).toStrictEqual(["GrabRelease"]);
	});

	it("is not released while it owes hours of seeding, and the desk says how many", () => {
		const { commands } = update(
			wantingHailMary,
			Message.ClickedGrabMove({ grab: "w-0123456789ab.1", move: "release" })
		);

		expect(names(commands ?? [])).toStrictEqual(["ReleasePayload"]);

		const { model } = update(
			wantingHailMary,
			Message.ReceivedResult({
				result: Prosody.Message.FailedReleasePayload({
					commandId: "s:1",
					failure: Refused.make({
						rejection: new StillObligated({ hours: 42 }),
					}),
				}),
			})
		);

		expect(model.desk.problem).toStrictEqual(
			Option.some("Not released: it owes 42 more hours of seeding.")
		);
	});
});
