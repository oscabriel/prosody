import { OBLIGATION } from "@prosody/domain/Acquisition/ReleasePayload.command";
import type { GrabbedRelease } from "@prosody/domain/Acquisition/Wanted.view";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./Model.ts";
import { sizeIn } from "./OnDevice.ts";
import { roomRouter } from "./Route.ts";

const DAY = 24 * 60 * 60 * 1000;

const dayIn = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

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

const seedingOf = (grabbed: GrabbedRelease, arrived: number): string =>
	grabbed.seeded >= OBLIGATION.hours
		? `qBittorrent has seeded it ${OBLIGATION.hours} hours. Check your tracker counts them before you release it.`
		: `Seeded ${grabbed.seeded} of ${OBLIGATION.hours} hours, owed by ${dayIn(arrived + OBLIGATION.days * DAY)}`;

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

const problemView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.note === "" ? [] : [h.p([h.Class("note problem")], [grabbed.note])];

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
