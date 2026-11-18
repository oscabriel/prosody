import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { ShelfEntry, Sync } from "@prosody/domain/Library/Shelf.view";
import { SHELF, Shelf } from "@prosody/domain/Library/Shelf.view";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import { Option, Schema } from "effect";
import type { Update } from "foldkit";
import { Subscription } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";

/** The connection to the model that commands and live reads need. */
type Reader = Domain.Api.ClientKey<"ReaderApi">;

/** Foldkit Commands and Subscriptions for everything on the reader's Api. */
const Prosody = DomainFoldkit.make(ReaderApi);

/** The shelf as the model keeps it: every work by id. */
const ShelfState = Shelf.definition.state ?? Schema.Never;

// MODEL

export const Flags = Schema.Struct({});

export type Flags = typeof Flags.Type;

export const Model = Schema.Struct({
	/** None until the model first answers. */
	shelf: Schema.Option(ShelfState),
	hasAnswered: Schema.Boolean,
	error: Schema.Option(Schema.String),
});

export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
	ReceivedShelf: { state: Schema.Option(ShelfState), cursor: Schema.Finite },
	FailedWatchShelf: { reason: Schema.String },
});

export type Message = typeof Message.Type;

// INIT

export const init = (): Update.Return<Model, Message, Reader> => ({
	model: Model.make({
		shelf: Option.none(),
		hasAnswered: false,
		error: Option.none(),
	}),
});

// UPDATE

export const update = (_model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message, Reader>>(message, {
		ReceivedShelf: ({ state }) => ({
			model: Model.make({
				shelf: state,
				hasAnswered: true,
				error: Option.none(),
			}),
		}),
		FailedWatchShelf: ({ reason }) => ({
			model: Model.make({
				shelf: Option.none(),
				hasAnswered: true,
				error: Option.some(reason),
			}),
		}),
	});

// SUBSCRIPTION

/** Follow the one shelf. The model pushes it again after every change. */
export const subscriptions = Subscription.make<Model, Message, Reader>()(
	() => ({
		shelf: Prosody.Shelf.watch({
			key: () => SHELF,
			toMessage: (snapshot): Message => Message.ReceivedShelf(snapshot),
			onFailure: (error): Message =>
				Message.FailedWatchShelf({ reason: error._tag }),
			onDefect: (): Message =>
				Message.FailedWatchShelf({ reason: "The connection failed" }),
		}),
	})
);

// VIEW

/** A work as the page lists it: its id, its entry, and its sync if it has a pair. */
type Listed = readonly [string, ShelfEntry, Option.Option<Sync>];

/** The shelf's works with their ids, by author and then title. */
const worksOf = (model: Model): ReadonlyArray<Listed> =>
	Option.match(model.shelf, {
		onNone: () => [],
		onSome: ({ works, syncs }) =>
			Object.entries(works)
				.toSorted(([, a], [, b]) =>
					`${a.author} ${a.title}`.localeCompare(`${b.author} ${b.title}`)
				)
				.map(([id, entry]): Listed => [
					id,
					entry,
					Option.fromUndefinedOr(syncs[id]),
				]),
	});

/** What can be done with a work, from the editions it has. */
const editionsOf = (entry: ShelfEntry) => {
	if (entry.text && entry.audio) {
		return "Text and audio";
	}

	if (entry.text) {
		return "Text";
	}

	if (entry.audio) {
		return "Audio";
	}

	return "No editions";
};

/** Whether a work's text and audio are joined, as a state for its mark and a line that says why. */
const syncOf = (entry: ShelfEntry, sync: Option.Option<Sync>) =>
	Option.match(sync, {
		onSome: ({ state, note }) => ({
			state,
			line: `${{ syncing: "Syncing", synced: "Synced", failed: "Not synced" }[state]}: ${note}`,
		}),
		onNone: () => ({
			state: "unpaired" as const,
			line:
				entry.text || entry.audio
					? `Not synced: no ${entry.text ? "audio" : "text"}`
					: "Not synced",
		}),
	});

const workView = ([id, entry, sync]: Listed, h: HtmlBuilder<Message>) => {
	const { state, line } = syncOf(entry, sync);

	return h.keyed("li")(
		id,
		[h.Class("work")],
		[
			h.div([h.Class("title")], [entry.title]),
			h.div([h.Class("author")], [entry.author]),
			h.div([h.Class(`sync ${state}`)], [line]),
			h.div([h.Class("editions")], [editionsOf(entry)]),
		]
	);
};

const statusOf = (model: Model, count: number) => {
	if (Option.isSome(model.error)) {
		return `Can't reach the shelf: ${model.error.value}`;
	}

	if (!model.hasAnswered) {
		return "Opening the shelf";
	}

	if (count === 0) {
		return "Nothing on the shelf yet";
	}

	return count === 1 ? "1 work" : `${count} works`;
};

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
	const works = worksOf(model);

	return {
		title: "Prosody",
		body: h.main(
			[],
			[
				h.h1([], ["Prosody"]),
				h.p([h.Class("status")], [statusOf(model, works.length)]),
				h.ul(
					[h.Class("shelf")],
					works.map((work) => workView(work, h))
				),
			]
		),
	};
};
