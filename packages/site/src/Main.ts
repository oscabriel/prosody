import { Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import type { Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { load, pushUrl } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import { toString as urlToString } from "foldkit/url";

import { blogView, postView } from "./Blog.ts";
import { docOf, FIRST, postOf } from "./Content.ts";
import { docView } from "./Docs.ts";
import { homeView } from "./Home.ts";
import { pageView } from "./Layout.ts";
import { Message } from "./Model.ts";
import type { Listening, Model } from "./Model.ts";
import { PASSAGE, sentenceAt } from "./Passage.ts";
import { Pause, Play, PlayFrom } from "./Player.ts";
import { AppRoute, homeRouter, urlToAppRoute } from "./Route.ts";

type Return = Update.Return<Model, Message>;

const QUIET: Listening = { isPlaying: false, time: 0, sentence: null };

export const routeOf = (url: Url): AppRoute => {
	const route = urlToAppRoute(url);

	const isMissing =
		(AppRoute.guards.Doc(route) &&
			(route.slug === FIRST || docOf(route.slug) === undefined)) ||
		(AppRoute.guards.Post(route) && postOf(route.slug) === undefined);

	return isMissing ? AppRoute.NotFound({ path: url.pathname }) : route;
};

export const init = (url: Url): Return => ({
	model: { route: routeOf(url), listening: QUIET },
});

const Navigate = Command.define("Navigate", {
	args: { url: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ url }) =>
		pushUrl(url).pipe(Effect.as(Message.CompletedNavigate())),
});

const Leave = Command.define("Leave", {
	args: { href: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ href }) =>
		load(href).pipe(Effect.as(Message.CompletedNavigate())),
});

const Settle = Command.define("Settle", {
	args: { anchor: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ anchor }) =>
		Effect.sync(() => {
			const heading =
				anchor === "" ? null : document.querySelector(`#${CSS.escape(anchor)}`);

			if (heading === null) {
				window.scrollTo({ top: 0 });
			} else {
				heading.scrollIntoView();
			}
		}).pipe(Effect.as(Message.CompletedNavigate())),
});

const listen = (model: Model, change: Partial<Listening>): Model =>
	modifyFields(model, {
		listening: (listening) => ({ ...listening, ...change }),
	});

export const update = (model: Model, message: Message): Return =>
	Message.match<Return>(message, {
		ClickedLink: ({ request }) => ({
			model,
			commands: [
				Match.value(request).pipe(
					Match.tagsExhaustive({
						Internal: ({ url }) => Navigate({ url: urlToString(url) }),
						External: ({ href }) => Leave({ href }),
					})
				),
			],
		}),
		ChangedUrl: ({ url }) => ({
			model: { route: routeOf(url), listening: QUIET },
			commands: [Settle({ anchor: Option.getOrElse(url.hash, () => "") })],
		}),
		CompletedNavigate: () => ({ model }),

		ClickedPlay: () => ({
			model,
			commands: [model.listening.isPlaying ? Pause() : Play()],
		}),
		ClickedSentence: ({ index }) => ({
			model: listen(model, { sentence: index }),
			commands: [PlayFrom({ time: PASSAGE[index]?.start ?? 0 })],
		}),
		Played: () => ({ model: listen(model, { isPlaying: true }) }),
		Paused: () => ({ model: listen(model, { isPlaying: false }) }),
		Ticked: ({ time }) => ({
			model: listen(model, { time, sentence: sentenceAt(time) }),
		}),
		CompletedPlayer: () => ({ model }),
	});

const notFoundView = (h: HtmlBuilder<Message>) => [
	h.div(
		[h.Class("column")],
		[
			h.h1([], ["Nothing is shelved here"]),
			h.p(
				[h.Class("lede")],
				[
					"This page does not exist. ",
					h.a([h.Href(homeRouter())], ["Go back to the start →"]),
				]
			),
		]
	),
];

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
	const { route } = model;

	const doc = AppRoute.guards.Docs(route)
		? docOf(FIRST)
		: docOf(AppRoute.guards.Doc(route) ? route.slug : "");

	const post = postOf(AppRoute.guards.Post(route) ? route.slug : "");

	if (doc !== undefined) {
		return {
			title: `${doc.title} · Prosody`,
			body: pageView(route, h, docView(doc, h)),
		};
	}

	if (post !== undefined) {
		return {
			title: `${post.title} · Prosody`,
			body: pageView(route, h, postView(post, h)),
		};
	}

	if (AppRoute.guards.Blog(route)) {
		return { title: "Blog · Prosody", body: pageView(route, h, blogView(h)) };
	}

	return AppRoute.guards.Home(route)
		? {
				title: "Prosody: your audiobook and your ebook, as one book",
				body: pageView(route, h, homeView(model, h)),
			}
		: {
				title: "Not found · Prosody",
				body: pageView(route, h, notFoundView(h)),
			};
};
