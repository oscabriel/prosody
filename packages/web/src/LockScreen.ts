import { Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import type { Update } from "foldkit";

import { copyUrl, kindOf } from "./Copy.ts";
import { Book, Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";

/**
 * What the lock screen says is playing: the book, its author, the chapter you are in, and the
 * book's cover, or the app's icon for a book with none.
 */
export const NowPlaying = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	chapter: Schema.String,
	artwork: Schema.String,
});

export type NowPlaying = typeof NowPlaying.Type;

const isSame = Schema.toEquivalence(Schema.Option(NowPlaying));

/** What is playing in the room that is open, once its book is. A text alone plays nothing. */
const nowPlaying = (model: Model): Option.Option<NowPlaying> =>
	Option.flatMap(model.room, (room) =>
		Book.match(room.book, {
			Open: ({ contents }) => {
				if (kindOf(contents) === "text") {
					return Option.none();
				}

				const entry = Option.getOrUndefined(entryOf(model, room.work));

				return Option.some({
					title: entry?.title ?? "",
					author: entry?.author ?? "",
					chapter: titleOf(contents, chapterOf(room, contents)),
					artwork:
						contents.cover === null
							? "/icon-512.png"
							: copyUrl(room.work, contents.cover),
				});
			},
			Opening: () => Option.none(),
			Unmade: () => Option.none(),
			Failed: () => Option.none(),
		})
	);

/** Name the book and chapter on the lock screen, with the book's cover. */
const Announce = Command.define("Announce", {
	args: NowPlaying.fields,
	messages: [Message.CompletedPlayer],
	execute: ({ title, author, chapter, artwork }) =>
		Effect.sync(() => {
			navigator.mediaSession.metadata = new MediaMetadata({
				title,
				artist: author,
				album: chapter,
				artwork: [{ src: artwork }],
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
