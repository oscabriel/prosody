import { Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import type { Update } from "foldkit";

import { copyUrl } from "./Copy.ts";
import { Book, Message } from "./Model.ts";
import type { Model } from "./Model.ts";
import { chapterOf, entryOf, titleOf } from "./Steps.ts";

export const NowPlaying = Schema.Struct({
	title: Schema.String,
	author: Schema.String,
	chapter: Schema.String,
	artwork: Schema.String,
});

export type NowPlaying = typeof NowPlaying.Type;

const isSame = Schema.toEquivalence(Schema.Option(NowPlaying));

const nowPlaying = (model: Model): Option.Option<NowPlaying> =>
	Option.flatMap(model.room, (room) =>
		Book.match(room.book, {
			Open: ({ contents }) => {
				if (contents.audio === null) {
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
