import { Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import type { Update } from "foldkit";

import { Book, Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";

/** What the lock screen says is playing: the book, its author, and the chapter you are in. */
export const NowPlaying = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	chapter: Schema.String,
});

export type NowPlaying = typeof NowPlaying.Type;

const isSame = Schema.toEquivalence(Schema.Option(NowPlaying));

/** What is playing in the room that is open, once its book is. */
const nowPlaying = (model: Model): Option.Option<NowPlaying> =>
	Option.flatMap(model.room, (room) =>
		Book.match(room.book, {
			Open: ({ contents }) => {
				const entry = Option.getOrUndefined(entryOf(model, room.work));

				return Option.some({
					title: entry?.title ?? "",
					author: entry?.author ?? "",
					chapter: titleOf(contents, chapterOf(room, contents)),
				});
			},
			Opening: () => Option.none(),
			Unmade: () => Option.none(),
			Failed: () => Option.none(),
		})
	);

/** Name the book and chapter on the lock screen. The app's icon stands in for a cover. */
const Announce = Command.define("Announce", {
	args: NowPlaying.fields,
	messages: [Message.CompletedPlayer],
	execute: ({ title, author, chapter }) =>
		Effect.sync(() => {
			navigator.mediaSession.metadata = new MediaMetadata({
				title,
				artist: author,
				album: chapter,
				artwork: [
					{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
				],
			});
		}).pipe(Effect.as(Message.CompletedPlayer())),
});

/**
 * An update that also tells the lock screen when what is playing changed: the book opened, the
 * shelf named it, or you moved to another chapter.
 */
export const announced = <R>(
	before: Model,
	result: Update.Return<Model, Message, R>
): Update.Return<Model, Message, R> => {
	const now = nowPlaying(result.model);

	if (Option.isNone(now) || isSame(now, nowPlaying(before))) {
		return result;
	}

	const commands = result.commands ?? [];

	return { ...result, commands: [...commands, Announce(now.value)] };
};
