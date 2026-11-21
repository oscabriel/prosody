import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Book, Message } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { standingOf, dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";

const moveButton = (
	h: HtmlBuilder<Message>,
	message: Message,
	label: string
): Html => h.button([h.Type("button"), h.OnClick(message)], [label]);

export const standingView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(standingOf(model, room.work), {
		onNone: () => [],
		onSome: ({ stage, at }) => {
			if (stage === "reading") {
				const moves = model.isOnline
					? [
							moveButton(h, Message.ClickedSetAside(), "Set it aside"),
							moveButton(h, Message.ClickedFinish(), "Finished"),
						]
					: [];

				return [
					h.div(
						[h.Class("moves")],
						[h.span([h.Class("label")], ["On the nightstand"]), ...moves]
					),
				];
			}

			return stage === "unopened"
				? []
				: [
						h.p(
							[h.Class("moves label")],
							[
								`${stage === "finished" ? "Finished" : "Set aside"} on ${dayOf(at)}`,
							]
						),
					];
		},
	});

export const copyView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const kept = model.copies[room.work];

	const line = (label: string, buttons: ReadonlyArray<Html>) => [
		h.div(
			[h.Class("moves")],
			[h.span([h.Class("label")], [label]), ...buttons]
		),
	];

	if (kept !== undefined) {
		return line(`Kept on this device, ${sizeIn(kept.bytes)}`, [
			moveButton(h, Message.ClickedRemoveCopy(), "Remove it"),
		]);
	}

	const keep =
		model.isOnline && Book.guards.Open(room.book)
			? [moveButton(h, Message.ClickedKeepCopy(), "Keep on this device")]
			: [];

	return Option.match(model.copying, {
		onNone: () => (keep.length === 0 ? [] : line("Not on this device", keep)),
		onSome: ({ work, done, of, problem }) => {
			if (work !== room.work) {
				return problem === null
					? line("Keeping another book on this device", [])
					: line("Not on this device", keep);
			}

			return problem === null
				? line(`Keeping on this device, ${sizeIn(done)} of ${sizeIn(of)}`, [
						moveButton(h, Message.ClickedStopCopy(), "Stop"),
					])
				: line(`Could not keep it: ${problem}`, keep);
		},
	});
};
