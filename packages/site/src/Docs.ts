import type { Html, HtmlBuilder } from "foldkit/html";

import { DOCS, docHref } from "./Content.ts";
import type { Page } from "./Content.ts";
import type { Message } from "./Model.ts";
import { anchorsOf, proseView } from "./Prose.ts";

const listView = (page: Page, h: HtmlBuilder<Message>): Html =>
	h.ol(
		[],
		DOCS.map((other) =>
			h.li(
				[],
				[
					h.a(
						[
							h.Href(docHref(other)),
							h.AriaCurrent(other.slug === page.slug ? "page" : "false"),
						],
						[other.title]
					),
				]
			)
		)
	);

const turnView = (
	h: HtmlBuilder<Message>,
	other: Page | undefined,
	label: string,
	side: string
): ReadonlyArray<Html> =>
	other === undefined
		? []
		: [
				h.a(
					[h.Href(docHref(other)), h.Class(side)],
					[h.span([h.Class("label")], [label]), h.span([], [other.title])]
				),
			];

export const docView = (
	page: Page,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const at = DOCS.findIndex((other) => other.slug === page.slug);
	const anchors = anchorsOf(page.document);

	return [
		h.div(
			[h.Class("docs")],
			[
				h.nav(
					[h.Class("docs-list wide"), h.AriaLabel("Docs")],
					[h.p([h.Class("label")], ["Docs"]), listView(page, h)]
				),
				h.details(
					[h.Class("docs-list narrow")],
					[
						h.summary([h.Class("label")], ["All of the docs"]),
						listView(page, h),
					]
				),
				h.article(
					[],
					[
						h.h1([], [page.title]),
						h.p([h.Class("lede")], [page.summary]),
						proseView(page.document, h),
						h.nav(
							[h.Class("turns"), h.AriaLabel("Next and previous")],
							[
								...turnView(h, DOCS[at - 1], "Before", "back"),
								...turnView(h, DOCS[at + 1], "Next", "on"),
							]
						),
					]
				),
				h.nav(
					[h.Class("docs-here"), h.AriaLabel("On this page")],
					anchors.length < 2
						? []
						: [
								h.p([h.Class("label")], ["On this page"]),
								h.ol(
									[],
									anchors.map((anchor) =>
										h.li([], [h.a([h.Href(`#${anchor.id}`)], [anchor.text])])
									)
								),
							]
				),
			]
		),
	];
};
