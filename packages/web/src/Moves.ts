import { Option } from "effect";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Book, Message } from "./Model.ts";
import type { Model, Room } from "./Model.ts";
import { bedsideOf, dayOf } from "./Nightstand.ts";
import { sizeIn } from "./OnDevice.ts";

// The moves under a book's author: where it stands on the nightstand, and its copy on this device.

/** A button among the moves under the book's author. */
const moveButton = (
	h: HtmlBuilder<Message>,
	message: Message,
	label: string
): Html => h.button([h.Type("button"), h.OnClick(message)], [label]);

/**
 * Where the work stands with you, and, while the model can be reached, the moves that take it off
 * the nightstand.
 */
export const bedsideView = (
	model: Model,
	room: Room,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	Option.match(bedsideOf(model, room.work), {
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

/** Whether the work's copy is kept on this device, on its way, or can be. */
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

	// Only a copy that opened can be kept.
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
