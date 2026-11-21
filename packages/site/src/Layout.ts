import type { Html, HtmlBuilder } from "foldkit/html";

import type { Message } from "./Model.ts";
import { AppRoute, blogRouter, docsRouter, homeRouter } from "./Route.ts";

export const SOURCE = "https://github.com/oscabriel/prosody";

const isDocs = (route: AppRoute): boolean =>
	AppRoute.guards.Docs(route) || AppRoute.guards.Doc(route);

const isBlog = (route: AppRoute): boolean =>
	AppRoute.guards.Blog(route) || AppRoute.guards.Post(route);

const linkView = (
	h: HtmlBuilder<Message>,
	href: string,
	text: string,
	isHere: boolean
): Html =>
	h.a([h.Href(href), h.AriaCurrent(isHere ? "page" : "false")], [text]);

const headView = (route: AppRoute, h: HtmlBuilder<Message>): Html =>
	h.header(
		[h.Class("head")],
		[
			h.a([h.Href(homeRouter()), h.Class("wordmark")], ["Prosody"]),
			h.nav(
				[h.Class("label"), h.AriaLabel("Site")],
				[
					linkView(h, docsRouter(), "Docs", isDocs(route)),
					linkView(h, blogRouter(), "Blog", isBlog(route)),
					h.a([h.Href(SOURCE)], ["Source"]),
				]
			),
		]
	);

const footView = (h: HtmlBuilder<Message>): Html =>
	h.footer(
		[h.Class("foot")],
		[
			h.p(
				[],
				[
					"Prosody is open-source software under the MIT licence. Self-hosted on your own machine, accessed over your tailnet.",
				]
			),
			h.nav(
				[h.Class("label"), h.AriaLabel("More")],
				[
					h.a([h.Href(docsRouter())], ["Docs"]),
					h.a([h.Href(blogRouter())], ["Blog"]),
					h.a([h.Href(SOURCE)], ["Source"]),
				]
			),
		]
	);

export const pageView = (
	route: AppRoute,
	h: HtmlBuilder<Message>,
	content: ReadonlyArray<Html>
): Html =>
	h.div(
		[h.Class("site")],
		[headView(route, h), h.main([], content), footView(h)]
	);
