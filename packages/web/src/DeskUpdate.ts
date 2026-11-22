import { Effect, Match, Schema } from "effect";
import { Command, Dom } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { Message } from "./Model.ts";
import type { DeskMessage, DeskTab, Model } from "./Model.ts";
import type { Return } from "./Steps.ts";

export const DESK_TAB_ID: Readonly<Record<DeskTab, string>> = {
	wants: "tab-wants",
	grabs: "tab-grabs",
};

export const FocusOnDesk = Command.define("FocusOnDesk", {
	args: { id: Schema.String },
	messages: [Message.CompletedDeskAction],
	execute: ({ id }) =>
		Dom.focus(`[id="${id}"]`).pipe(
			Effect.ignore,
			Effect.as(Message.CompletedDeskAction())
		),
});

export const updateDesk = (model: Model, message: DeskMessage): Return =>
	Match.value(message).pipe(
		Match.tagsExhaustive({
			SelectedDeskTab: ({ tab }): Return => ({
				model: modifyFields(model, { deskUi: (ui) => ({ ...ui, tab }) }),
				commands: [FocusOnDesk({ id: DESK_TAB_ID[tab] })],
			}),
			CompletedDeskAction: (): Return => ({ model }),
		})
	);
