import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { describe, expect, it } from "@effect/vitest";
import { OBLIGATION } from "@prosody/domain/Acquisition/ReleasePayload.command";
import type { GrabbedRelease } from "@prosody/domain/Acquisition/Wanted.view";
import { Shelfmark } from "@prosody/domain/Library/Shelfmark";
import { Option } from "effect";

import { DEFAULT_APPEARANCE } from "../src/Appearance.ts";
import {
	activityOf,
	groupsOf,
	isReleasable,
	seedingOf,
} from "../src/Grabbed.ts";
import { update } from "../src/Main.ts";
import {
	ConfirmAction,
	DEFAULT_DESK_UI,
	DEFAULT_SHELF_UI,
	Message,
	Model,
} from "../src/Model.ts";
import { AppRoute } from "../src/Route.ts";

const grabbed = (change: Partial<GrabbedRelease>): GrabbedRelease => ({
	work: "w-0123456789ab",
	title: "Piranesi",
	author: "Susanna Clarke",
	release: {
		id: "1_guid",
		indexer: "An indexer",
		title: "Piranesi [ENG / EPUB]",
		kind: "text",
		bytes: 3_000_000,
		seeders: 12,
		published: "2021-05-05T00:00:00Z",
		page: null,
		link: null,
	},
	state: "arrived",
	percent: 100,
	note: "",
	seeded: 0,
	arrived: 0,
	shelf: null,
	...change,
});

const onTheShelf = {
	work: "w-0123456789ab",
	shelfmark: Shelfmark.make("Susanna Clarke/Piranesi"),
};

const grabs = {
	"w-0123456789ab.1": grabbed({
		state: "downloading",
		percent: 64,
		arrived: null,
	}),
	"w-0123456789ab.2": grabbed({ state: "stalled", percent: 18, arrived: null }),
	"w-0123456789ab.3": grabbed({ seeded: 48, note: "It has no .epub file" }),
	"w-0123456789ab.4": grabbed({ seeded: 1 }),
	"w-0123456789ab.5": grabbed({ seeded: OBLIGATION.hours, shelf: onTheShelf }),
	"w-0123456789ab.6": grabbed({ seeded: 36, shelf: onTheShelf }),
};

const atDesk = Model.make({
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
	wanted: Option.some({
		wants: {
			"w-0123456789ab": {
				title: "piranesi",
				author: "clarke",
				at: 0,
				state: "offered",
				note: "",
				offers: [],
				grabbed: [],
			},
		},
		catalogue: {
			"w-0123456789ab": {
				title: "Piranesi",
				author: "Susanna Clarke",
				description: { year: 2020, openLibrary: null, recording: null },
			},
		},
		grabs,
	}),
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
});

const names = (commands: ReadonlyArray<{ readonly name: string }>) =>
	commands.map((command) => command.name);

const toastOf = (model: Model) =>
	Option.map(model.toast, (toast) => toast.message);

describe("the desk's two lists", () => {
	it("opens on what is wanted, and turns to the grabs", () => {
		expect(atDesk.deskUi.tab).toBe("wants");

		const { model, commands } = update(
			atDesk,
			Message.SelectedDeskTab({ tab: "grabs" })
		);

		expect(model.deskUi.tab).toBe("grabs");
		expect(names(commands ?? [])).toStrictEqual(["FocusOnDesk"]);
	});

	it("turns back to the wants when a book is asked for, and says so", () => {
		const onGrabs: Model = {
			...atDesk,
			deskUi: { tab: "grabs" },
			desk: { ...atDesk.desk, title: "The Odyssey", author: "Homer" },
		};

		const { model } = update(onGrabs, Message.SubmittedWant());

		expect(model.deskUi.tab).toBe("wants");
		expect(toastOf(model)).toStrictEqual(
			Option.some("Added “The Odyssey” — searching for offers")
		);
	});

	it("stays on the grabs when the book could not be asked for", () => {
		const onGrabs: Model = { ...atDesk, deskUi: { tab: "grabs" } };
		const { model } = update(onGrabs, Message.SubmittedWant());

		expect(model.deskUi.tab).toBe("grabs");
		expect(toastOf(model)).toStrictEqual(Option.none());
	});
});

describe("the grabs on the desk", () => {
	it("puts those still at work above those shelved and seeding", () => {
		const { active, shelved } = groupsOf(grabs);

		expect(active.map(([grab]) => grab)).toStrictEqual([
			"w-0123456789ab.5",
			"w-0123456789ab.4",
			"w-0123456789ab.3",
			"w-0123456789ab.2",
			"w-0123456789ab.1",
		]);
		expect(shelved.map(([grab]) => grab)).toStrictEqual(["w-0123456789ab.6"]);
	});

	it("counts the downloads, the stalls and the payloads ready to release", () => {
		expect(activityOf(grabs)).toBe(
			"1 downloading · 1 stalled · 1 ready to release"
		);
		expect(activityOf({ "w-0123456789ab.4": grabbed({ seeded: 1 }) })).toBe("");
		expect(activityOf({})).toBe("");
	});

	it("can release a payload once its obligation is met", () => {
		expect(isReleasable(grabbed({ seeded: OBLIGATION.hours - 1 }))).toBeFalsy();
		expect(isReleasable(grabbed({ seeded: OBLIGATION.hours }))).toBeTruthy();
		expect(
			isReleasable(grabbed({ state: "downloading", seeded: OBLIGATION.hours }))
		).toBeFalsy();
	});

	it("takes the hours and the days of the obligation from the model", () => {
		const day = 24 * 60 * 60 * 1000;
		const arrived = Date.UTC(2026, 0, 1, 12);

		const owedBy = new Date(arrived + OBLIGATION.days * day).toLocaleDateString(
			"en-GB",
			{ day: "numeric", month: "long" }
		);

		expect(seedingOf(48, arrived)).toBe(
			`Seeded 48 of ${OBLIGATION.hours} hours, owed by ${owedBy}.`
		);
		expect(seedingOf(OBLIGATION.hours + 8, arrived)).toBe(
			`Seeded ${OBLIGATION.hours} of ${OBLIGATION.hours} hours. Check your tracker before releasing it.`
		);
	});
});

describe("what the desk asks before it acts", () => {
	it("asks before withdrawing a want, and withdraws on yes", () => {
		const asked = update(
			atDesk,
			Message.RequestedConfirm({
				action: ConfirmAction.Withdraw({
					work: "w-0123456789ab",
					title: "Piranesi",
				}),
			})
		);

		expect(Option.isSome(asked.model.confirm)).toBeTruthy();
		expect(names(asked.commands ?? [])).toStrictEqual(["OpenConfirmDialog"]);

		const { model, commands } = update(asked.model, Message.ConfirmedAction());

		expect(Option.isNone(model.confirm)).toBeTruthy();
		expect(names(commands ?? [])).toStrictEqual([
			"CloseConfirmDialog",
			"WithdrawWant",
		]);
	});

	it("sends nothing when the answer is no", () => {
		const asked = update(
			atDesk,
			Message.RequestedConfirm({
				action: ConfirmAction.Abandon({
					grab: "w-0123456789ab.1",
					title: "Piranesi",
				}),
			})
		);

		const { model, commands } = update(asked.model, Message.CancelledConfirm());

		expect(Option.isNone(model.confirm)).toBeTruthy();
		expect(names(commands ?? [])).toStrictEqual(["CloseConfirmDialog"]);
	});

	it("asks before abandoning a grab and before releasing a payload", () => {
		const abandon = update(
			update(
				atDesk,
				Message.RequestedConfirm({
					action: ConfirmAction.Abandon({
						grab: "w-0123456789ab.1",
						title: "Piranesi",
					}),
				})
			).model,
			Message.ConfirmedAction()
		);

		const release = update(
			update(
				atDesk,
				Message.RequestedConfirm({
					action: ConfirmAction.Release({
						grab: "w-0123456789ab.5",
						title: "Piranesi",
					}),
				})
			).model,
			Message.ConfirmedAction()
		);

		expect(names(abandon.commands ?? [])).toStrictEqual([
			"CloseConfirmDialog",
			"AbandonGrab",
		]);
		expect(names(release.commands ?? [])).toStrictEqual([
			"CloseConfirmDialog",
			"ReleasePayload",
		]);
	});
});

describe("what the desk says it did", () => {
	it("names the book it searches for again", () => {
		const { model } = update(
			atDesk,
			Message.ClickedSearchAgain({ work: "w-0123456789ab" })
		);

		expect(toastOf(model)).toStrictEqual(
			Option.some("Searching again for Piranesi")
		);
	});

	it("names the book it grabs and the grab it resumes", () => {
		const grab = update(
			atDesk,
			Message.ClickedGrab({ work: "w-0123456789ab", release: "1_guid" })
		);

		const resume = update(
			atDesk,
			Message.ClickedGrabMove({ grab: "w-0123456789ab.2", move: "resume" })
		);

		expect(toastOf(grab.model)).toStrictEqual(Option.some("Grabbed Piranesi"));
		expect(toastOf(resume.model)).toStrictEqual(
			Option.some("Resumed Piranesi")
		);
	});
});

describe("leaving a correction", () => {
	it("goes to the title when it opens, and back to its button when put by", () => {
		const opened = update(
			atDesk,
			Message.ClickedCorrect({ work: "w-0123456789ab" })
		);

		expect(names(opened.commands ?? [])).toStrictEqual(["FocusOnDesk"]);

		const { model, commands } = update(
			opened.model,
			Message.ClickedCancelCorrection()
		);

		expect(model.desk.correcting).toStrictEqual(Option.none());
		expect(names(commands ?? [])).toStrictEqual(["FocusOnDesk"]);
	});
});
