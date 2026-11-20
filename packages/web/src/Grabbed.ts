import { OBLIGATION } from "@prosody/domain/Acquisition/ReleasePayload.command";
import type { GrabbedRelease } from "@prosody/domain/Acquisition/Wanted.view";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./Model.ts";
import { sizeIn } from "./OnDevice.ts";
import { roomRouter } from "./Route.ts";

// The desk's grabs: each release you grabbed, from its download to the end of its seeding.

const DAY = 24 * 60 * 60 * 1000;

/** A day without its year: 18 December. */
const dayIn = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** Where a grab stands, as a label. */
const stateOf = (grabbed: GrabbedRelease): string => {
	if (grabbed.state === "downloading") {
		return `${grabbed.percent}%`;
	}

	if (grabbed.state === "stalled") {
		return "stalled";
	}

	if (grabbed.shelf !== null) {
		return "on the shelf";
	}

	return grabbed.note === "" ? "shelving" : "not shelved";
};

/**
 * How its seeding stands: the hours it owes, and the day they are owed by. The hours are
 * qBittorrent's, which count on while the tracker credits none, so the tracker has the last word.
 */
const seedingOf = (grabbed: GrabbedRelease, arrived: number): string =>
	grabbed.seeded >= OBLIGATION.hours
		? `qBittorrent has seeded it ${OBLIGATION.hours} hours. Check your tracker counts them before you release it.`
		: `Seeded ${grabbed.seeded} of ${OBLIGATION.hours} hours, owed by ${dayIn(arrived + OBLIGATION.days * DAY)}`;

/** What you can do with it now. */
const movesView = (
	grab: string,
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const button = (label: string, move: "resume" | "abandon" | "release") =>
		h.button(
			[h.Type("button"), h.OnClick(Message.ClickedGrabMove({ grab, move }))],
			[label]
		);

	if (grabbed.state !== "arrived") {
		return [
			h.p(
				[h.Class("moves")],
				[button("Resume", "resume"), button("Abandon", "abandon")]
			),
		];
	}

	return grabbed.seeded >= OBLIGATION.hours
		? [h.p([h.Class("moves")], [button("Release", "release")])]
		: [];
};

/** Why it stalled, or why it is not on the shelf yet. */
const problemView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.note === "" ? [] : [h.p([h.Class("note problem")], [grabbed.note])];

/** Where it was shelved, with the way into its room. */
const shelfView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.shelf === null
		? []
		: [
				h.p(
					[h.Class("note")],
					[
						"On the shelf at ",
						h.a(
							[
								h.Class("inline"),
								h.Href(roomRouter({ work: grabbed.shelf.work })),
							],
							[grabbed.shelf.shelfmark]
						),
					]
				),
			];

/** How its seeding stands, once its payload has come. */
const seedingView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.arrived === null
		? []
		: [h.p([h.Class("note")], [seedingOf(grabbed, grabbed.arrived)])];

const grabView = (
	grab: string,
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("li")(
		grab,
		[h.Class("want grab")],
		[
			h.div(
				[h.Class("line")],
				[
					h.h3([h.Class("title")], [grabbed.title]),
					h.span([h.Class("label")], [stateOf(grabbed)]),
				]
			),
			h.p(
				[h.Class("note")],
				[
					[
						grabbed.release.kind === "audio" ? "Audiobook" : "Ebook",
						sizeIn(grabbed.release.bytes),
						grabbed.release.title,
					].join(" · "),
				]
			),
			...problemView(grabbed, h),
			...seedingView(grabbed, h),
			...shelfView(grabbed, h),
			...movesView(grab, grabbed, h),
		]
	);

/** Every release you grabbed, the latest first, until it is released or abandoned. */
export const grabsView = (
	grabs: Readonly<Record<string, GrabbedRelease>>,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const entries = Object.entries(grabs).toReversed();

	return entries.length === 0
		? []
		: [
				h.h2([h.Class("label status")], ["Grabbed"]),
				h.ol(
					[h.Class("wants")],
					entries.map(([grab, grabbed]) => grabView(grab, grabbed, h))
				),
			];
};
