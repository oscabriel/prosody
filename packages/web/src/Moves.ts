import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { keptIcon } from "./Icons.ts";
import { Book, ConfirmAction, Message } from "./Model.ts";
import type { Copying, DeviceCopy, Model, Room } from "./Model.ts";
import { standingOf, dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";
import { panelId } from "./RoomPanels.ts";
import { isAlone } from "./Rooms.ts";
import { entryOf } from "./Steps.ts";
import { badgeView, coverView } from "./Ui.ts";

export interface Keeping {
	readonly kept: DeviceCopy | undefined;
	readonly copying: Option.Option<Copying>;
	readonly problem: Option.Option<string>;
	readonly isBusy: boolean;
	readonly canKeep: boolean;
}

export const keepingOf = (model: Model, room: Room): Keeping => {
	const here = Option.filter(
		model.copying,
		(copying) => copying.work === room.work
	);

	const isBusy = Option.exists(
		model.copying,
		(copying) => copying.work !== room.work && copying.problem === null
	);

	return {
		kept: model.copies[room.work],
		copying: Option.filter(here, (copying) => copying.problem === null),
		problem: Option.flatMap(here, (copying) =>
			Option.fromNullishOr(copying.problem)
		),
		isBusy,
		canKeep: model.isOnline && Book.guards.Open(room.book) && !isBusy,
	};
};

const titleIn = (model: Model, room: Room): string =>
	Option.match(entryOf(model, room.work), {
		onNone: () => "This book",
		onSome: (entry) => entry.title,
	});

const standingBadge = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(standingOf(model, room.work), {
		onNone: () => [],
		onSome: ({ stage, at }) => {
			if (stage === "unopened") {
				return [];
			}

			if (stage === "reading") {
				return [badgeView("On the nightstand", "neutral", false, h)];
			}

			return [
				badgeView(
					`${stage === "finished" ? "Finished" : "Set aside"} on ${dayOf(at)}`,
					"neutral",
					false,
					h
				),
			];
		},
	});

const summaryView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): Html => {
	const entry = Option.getOrUndefined(entryOf(model, room.work));

	return h.div(
		[h.Class("book-summary")],
		[
			coverView(
				room.work,
				entry?.title ?? "",
				Book.guards.Open(room.book),
				[],
				h
			),
			h.div(
				[h.Class("book-summary-meta")],
				[
					h.p(
						[h.Class("book-summary-title"), h.Dir("auto")],
						[entry?.title ?? ""]
					),
					h.p(
						[h.Class("book-summary-author"), h.Dir("auto")],
						[entry?.author ?? ""]
					),
					...standingBadge(model, room, h),
				]
			),
		]
	);
};

const nightstandView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	model.isOnline &&
	Option.exists(
		standingOf(model, room.work),
		({ stage }) => stage === "reading"
	)
		? [
				h.div(
					[h.Class("menu-section")],
					[
						h.p([h.Class("menu-label")], ["Nightstand"]),
						h.button(
							[
								h.Type("button"),
								h.Class("menu-item"),
								h.OnClick(Message.ClickedFinish()),
							],
							[h.span([], ["Mark as finished"])]
						),
						h.button(
							[
								h.Type("button"),
								h.Class("menu-item"),
								h.OnClick(Message.ClickedSetAside()),
							],
							[h.span([], ["Set it aside"])]
						),
					]
				),
			]
		: [];

const keepButton = (h: HtmlBuilder<Message>): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("btn btn-secondary btn-sm keep-button"),
			h.OnClick(Message.ClickedKeepCopy()),
		],
		["Keep on this device"]
	);

const keepNote = (text: string, h: HtmlBuilder<Message>): Html =>
	h.p([h.Class("keep-note")], [text]);

const copyingView = (
	{ done, of }: Copying,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const isMeasured = of > 0;
	const share = isMeasured ? Math.min(1, done / of) : 0;

	const track = isMeasured
		? h.div(
				[
					h.Class("progress-track"),
					h.Role("progressbar"),
					h.AriaLabel("Keeping on this device"),
					h.AriaValuenow(Math.round(share * 100)),
					h.AriaValuemin(0),
					h.AriaValuemax(100),
				],
				[
					h.div(
						[
							h.Class("progress-fill"),
							h.Style({ "--progress": String(share) }),
						],
						[]
					),
				]
			)
		: h.div(
				[
					h.Class("progress-track is-unmeasured"),
					h.Role("progressbar"),
					h.AriaLabel("Keeping on this device"),
				],
				[h.div([h.Class("progress-fill")], [])]
			);

	return [
		h.div(
			[h.Class("keep-progress")],
			[
				h.div(
					[h.Class("keep-progress-row tabular")],
					[
						h.span([], ["Keeping on this device"]),
						h.span(
							[],
							[isMeasured ? `${sizeIn(done)} of ${sizeIn(of)}` : "Keeping…"]
						),
					]
				),
				track,
				h.button(
					[
						h.Type("button"),
						h.Class("btn btn-ghost btn-sm keep-stop"),
						h.OnClick(Message.ClickedStopCopy()),
					],
					["Stop"]
				),
			]
		),
	];
};

const keptView = (
	model: Model,
	room: Room,
	kept: DeviceCopy,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => [
	h.div(
		[h.Class("keep-kept")],
		[
			h.span(
				[h.Class("badge badge-ok")],
				[keptIcon(h), h.span([], [`Kept · ${sizeIn(kept.bytes)}`])]
			),
			h.button(
				[
					h.Type("button"),
					h.Class("btn btn-danger-ghost btn-sm"),
					h.OnClick(
						Message.RequestedConfirm({
							action: ConfirmAction.RemoveCopy({
								work: room.work,
								title: titleIn(model, room),
								bytes: kept.bytes,
							}),
						})
					),
				],
				["Remove"]
			),
		]
	),
];

const keepView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const keeping = keepingOf(model, room);

	if (keeping.kept !== undefined) {
		return keptView(model, room, keeping.kept, h);
	}

	if (Option.isSome(keeping.copying)) {
		return copyingView(keeping.copying.value, h);
	}

	const retry = keeping.canKeep ? [keepButton(h)] : [];

	if (Option.isSome(keeping.problem)) {
		return [
			h.p(
				[h.Class("keep-note is-danger"), h.Role("alert")],
				[`Could not keep it: ${keeping.problem.value}`]
			),
			...retry,
		];
	}

	if (keeping.isBusy) {
		return [keepNote("Keeping another book on this device", h)];
	}

	return keeping.canKeep ? retry : [keepNote("Not on this device", h)];
};

const syncedView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (
		!model.isOnline ||
		!Book.guards.Open(room.book) ||
		isAlone(model, room.work)
	) {
		return [];
	}

	const note = Option.flatMap(model.shelf, ({ syncs }) =>
		Option.fromUndefinedOr(syncs[room.work]?.note)
	);

	return [
		h.div(
			[h.Class("menu-section")],
			[
				h.details(
					[h.Class("sync-details")],
					[
						h.summary([], ["Synced"]),
						...Option.match(
							Option.filter(note, (text) => text !== ""),
							{
								onNone: () => [],
								onSome: (text) => [h.p([], [text])],
							}
						),
						h.p(
							[],
							[
								"Aligning it again takes a minute or two for a book the press has heard before. The book closes here until it is done.",
							]
						),
						h.button(
							[
								h.Type("button"),
								h.Class("btn btn-danger-ghost btn-sm"),
								h.OnClick(
									Message.RequestedConfirm({
										action: ConfirmAction.Realign({
											work: room.work,
											title: titleIn(model, room),
										}),
									})
								),
							],
							["Align it again…"]
						),
					]
				),
			]
		),
	];
};

export const bookMenuView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): Html =>
	h.keyed("div")(
		"menu",
		[
			h.Id(panelId("menu")),
			h.Class("popover"),
			h.Role("dialog"),
			h.AriaLabel("Book menu"),
		],
		[
			summaryView(model, room, h),
			...nightstandView(model, room, h),
			h.div(
				[h.Class("menu-section")],
				[
					h.p([h.Class("menu-label")], ["On this device"]),
					...keepView(model, room, h),
				]
			),
			...syncedView(model, room, h),
		]
	);
