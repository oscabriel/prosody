import { Effect, Match, Option, Schema, Stream } from "effect";
import { Command, Dom, Subscription } from "foldkit";
import { modifyFields } from "foldkit/struct";

import { saveShelfLayout, ShelfLayout } from "./Appearance.ts";
import { Message } from "./Model.ts";
import type { Model, ShelfMessage, ShelfUi } from "./Model.ts";
import type { Reader } from "./Prosody.ts";
import { AppRoute } from "./Route.ts";
import type { Return } from "./Steps.ts";

export const SHELF_SEARCH_ID = "shelf-search";

const focusSearch = Dom.focus(`#${SHELF_SEARCH_ID}`).pipe(
	Effect.ignore,
	Effect.as(Message.CompletedShelfAction())
);

const FocusShelfSearch = Command.define("FocusShelfSearch", {
	messages: [Message.CompletedShelfAction],
	execute: focusSearch,
});

const SaveShelfLayout = Command.define("SaveShelfLayout", {
	args: { layout: ShelfLayout },
	messages: [Message.CompletedShelfAction],
	execute: ({ layout }) =>
		saveShelfLayout(layout).pipe(Effect.as(Message.CompletedShelfAction())),
});

const changeShelf = (model: Model, change: (ui: ShelfUi) => ShelfUi): Model =>
	modifyFields(model, { shelfUi: change });

export const updateShelf = (model: Model, message: ShelfMessage): Return =>
	Match.value(message).pipe(
		Match.tagsExhaustive({
			ChangedShelfQuery: ({ value }): Return => ({
				model: changeShelf(model, (ui) => ({ ...ui, query: value })),
			}),
			ClearedShelfQuery: (): Return => ({
				model: changeShelf(model, (ui) => ({ ...ui, query: "" })),
				commands: [FocusShelfSearch()],
			}),
			ClearedShelfFilters: (): Return => ({
				model: changeShelf(model, (ui) => ({
					...ui,
					query: "",
					filter: "all",
				})),
				commands: [FocusShelfSearch()],
			}),
			ChangedShelfSort: ({ sort }): Return => ({
				model: changeShelf(model, (ui) => ({ ...ui, sort })),
			}),
			SelectedShelfFilter: ({ filter }): Return => ({
				model: changeShelf(model, (ui) => ({ ...ui, filter })),
			}),
			SelectedShelfLayout: ({ layout }): Return => ({
				model: changeShelf(model, (ui) => ({ ...ui, layout })),
				commands: [SaveShelfLayout({ layout })],
			}),
			ToggledOfflineAll: (): Return => ({
				model: changeShelf(model, (ui) => ({
					...ui,
					showAllOffline: !ui.showAllOffline,
				})),
			}),
			CompletedShelfAction: (): Return => ({ model }),
		})
	);

const shelfKeys: Stream.Stream<Message> = Dom.streamFromKeyBindings<
	Effect.Effect<Message>
>({
	bindings: [
		{ keys: "/", mapEvent: () => focusSearch },
		{
			keys: "G",
			mapEvent: () =>
				Effect.succeed(Message.SelectedShelfLayout({ layout: "grid" })),
		},
		{
			keys: "L",
			mapEvent: () =>
				Effect.succeed(Message.SelectedShelfLayout({ layout: "list" })),
		},
	],
}).pipe(Stream.mapEffect((pressed) => pressed));

export const shelfSubscriptions: Subscription.Subscriptions<
	Model,
	Message,
	Reader
> = Subscription.make<Model, Message, Reader>()((entry) => ({
	shelfKeys: entry(
		{ isListening: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isListening:
					AppRoute.guards.Shelf(model.route) && Option.isNone(model.confirm),
			}),
			dependenciesToStream: ({ isListening }) =>
				isListening ? shelfKeys : Stream.empty,
		}
	),
}));
