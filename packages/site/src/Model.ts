import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";

import { AppRoute } from "./Route.ts";

export const Listening = Schema.Struct({
	isPlaying: Schema.Boolean,
	time: Schema.Finite,
	sentence: Schema.NullOr(Schema.Int),
});

export type Listening = typeof Listening.Type;

export const Model = Schema.Struct({
	route: AppRoute,
	listening: Listening,
});

export type Model = typeof Model.Type;

export const Message = defineMessageUnion({
	ClickedLink: { request: UrlRequest },
	ChangedUrl: { url: Url },
	CompletedNavigate: {},
	ClickedPlay: {},
	ClickedSentence: { index: Schema.Int },
	Played: {},
	Paused: {},
	Ticked: { time: Schema.Finite },
	CompletedPlayer: {},
});

export type Message = typeof Message.Type;
