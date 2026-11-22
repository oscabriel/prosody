import { OBLIGATION } from "@prosody/domain/Acquisition/ReleasePayload.command";
import type { GrabbedRelease } from "@prosody/domain/Acquisition/Wanted.view";
import type { Html, HtmlBuilder } from "foldkit/html";

import { ConfirmAction, Message } from "./Model.ts";
import { dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { roomRouter } from "./Route.ts";
import { badgeView, emptyStateView } from "./Ui.ts";

const DAY = 24 * 60 * 60 * 1000;

type Grabs = Readonly<Record<string, GrabbedRelease>>;

type Entry = readonly [string, GrabbedRelease];

export const isReleasable = (grabbed: GrabbedRelease): boolean =>
	grabbed.state === "arrived" && grabbed.seeded >= OBLIGATION.hours;

const isSettled = (grabbed: GrabbedRelease): boolean =>
	grabbed.shelf !== null && grabbed.seeded < OBLIGATION.hours;

export interface GrabGroups {
	readonly active: ReadonlyArray<Entry>;
	readonly shelved: ReadonlyArray<Entry>;
}

export const groupsOf = (grabs: Grabs): GrabGroups => {
	const entries = Object.entries(grabs).toReversed();

	return {
		active: entries.filter(([, grabbed]) => !isSettled(grabbed)),
		shelved: entries.filter(([, grabbed]) => isSettled(grabbed)),
	};
};

export const activityOf = (grabs: Grabs): string => {
	const all = Object.values(grabs);

	const counts = [
		[all.filter(({ state }) => state === "downloading").length, "downloading"],
		[all.filter(({ state }) => state === "stalled").length, "stalled"],
		[all.filter(isReleasable).length, "ready to release"],
	] as const;

	return counts
		.flatMap(([count, label]) => (count > 0 ? [`${count} ${label}`] : []))
		.join(" · ");
};

export const seedingOf = (seeded: number, arrived: number): string =>
	seeded >= OBLIGATION.hours
		? `Seeded ${OBLIGATION.hours} of ${OBLIGATION.hours} hours. Check your tracker before releasing it.`
		: `Seeded ${seeded} of ${OBLIGATION.hours} hours, owed by ${dayOf(arrived + OBLIGATION.days * DAY)}.`;

export const kindOf = (kind: "text" | "audio"): string =>
	kind === "audio" ? "Audiobook" : "Ebook";

const stateView = (grabbed: GrabbedRelease, h: HtmlBuilder<Message>): Html => {
	if (grabbed.state === "downloading") {
		return badgeView(`${grabbed.percent}%`, "ink", false, h);
	}

	if (grabbed.state === "stalled") {
		return badgeView("Stalled", "warn", false, h);
	}

	if (grabbed.shelf !== null) {
		return badgeView("On the shelf", "ok", false, h);
	}

	return grabbed.note === ""
		? badgeView("Shelving…", "neutral", true, h)
		: badgeView("Not shelved", "danger", false, h);
};

const progressView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.state === "downloading"
		? [
				h.div(
					[h.Class("grab-progress")],
					[
						h.div(
							[
								h.Class("progress-track"),
								h.Role("progressbar"),
								h.AriaLabel("Download progress"),
								h.AriaValuenow(grabbed.percent),
								h.AriaValuemin(0),
								h.AriaValuemax(100),
							],
							[
								h.div(
									[
										h.Class("progress-fill"),
										h.Style({
											"--progress": String(
												Math.min(100, Math.max(0, grabbed.percent)) / 100
											),
										}),
									],
									[]
								),
							]
						),
					]
				),
			]
		: [];

const problemView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.note === ""
		? []
		: [h.p([h.Class("desk-meta is-danger")], [grabbed.note])];

const seedingView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.arrived === null
		? []
		: [
				h.p(
					[h.Class("desk-meta")],
					[seedingOf(grabbed.seeded, grabbed.arrived)]
				),
			];

const shelfView = (
	grabbed: GrabbedRelease,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	grabbed.shelf === null
		? []
		: [
				h.p(
					[h.Class("desk-meta")],
					[
						"On the shelf at ",
						h.a(
							[
								h.Class("desk-link"),
								h.Href(roomRouter({ work: grabbed.shelf.work })),
							],
							[grabbed.shelf.shelfmark]
						),
					]
				),
			];

const movesView = (
	grab: string,
	grabbed: GrabbedRelease,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (grabbed.state !== "arrived") {
		return [
			h.div(
				[h.Class("desk-actions")],
				[
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary btn-sm"),
							h.Disabled(!isOnline),
							h.OnClick(Message.ClickedGrabMove({ grab, move: "resume" })),
						],
						["Resume"]
					),
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-danger-ghost btn-sm"),
							h.Disabled(!isOnline),
							h.OnClick(
								Message.RequestedConfirm({
									action: ConfirmAction.Abandon({
										grab,
										title: grabbed.title,
									}),
								})
							),
						],
						["Abandon"]
					),
				]
			),
		];
	}

	return isReleasable(grabbed)
		? [
				h.div(
					[h.Class("desk-actions")],
					[
						h.button(
							[
								h.Type("button"),
								h.Class("btn btn-secondary btn-sm"),
								h.Disabled(!isOnline),
								h.OnClick(
									Message.RequestedConfirm({
										action: ConfirmAction.Release({
											grab,
											title: grabbed.title,
										}),
									})
								),
							],
							["Release"]
						),
					]
				),
			]
		: [];
};

const grabView = (
	[grab, grabbed]: Entry,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("li")(
		grab,
		[h.Class("desk-item")],
		[
			h.div(
				[h.Class("desk-item-head")],
				[
					h.h3(
						[h.Class("desk-item-title is-grab"), h.Dir("auto")],
						[grabbed.title]
					),
					stateView(grabbed, h),
				]
			),
			h.p(
				[h.Class("desk-meta"), h.Dir("auto")],
				[
					h.span([h.Class("badge desk-kind")], [kindOf(grabbed.release.kind)]),
					`${sizeIn(grabbed.release.bytes)} · ${grabbed.release.title}`,
				]
			),
			...progressView(grabbed, h),
			...problemView(grabbed, h),
			...seedingView(grabbed, h),
			...shelfView(grabbed, h),
			...movesView(grab, grabbed, isOnline, h),
		]
	);

const groupView = (
	id: string,
	title: string,
	entries: ReadonlyArray<Entry>,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	entries.length === 0
		? []
		: [
				h.section(
					[h.Class("grab-group"), h.AriaLabelledBy(id)],
					[
						h.h2([h.Class("section-title"), h.Id(id)], [title]),
						h.ol(
							[h.Class("desk-list")],
							entries.map((entry) => grabView(entry, isOnline, h))
						),
					]
				),
			];

export const grabsView = (
	grabs: Grabs,
	isOnline: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const { active, shelved } = groupsOf(grabs);

	if (active.length === 0 && shelved.length === 0) {
		return [
			emptyStateView(
				2,
				"No grabs yet",
				"When you grab an offer from your wants, its download and shelving progress appears here.",
				[],
				h
			),
		];
	}

	return [
		...groupView(
			"grabs-active",
			"Active & needing action",
			active,
			isOnline,
			h
		),
		...groupView("grabs-shelved", "On the shelf", shelved, isOnline, h),
	];
};
