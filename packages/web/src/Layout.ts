import type { Html, HtmlBuilder } from "foldkit/html";

import type { Message, Model } from "./Model.ts";
import { shelfRouter } from "./Route.ts";

export const bookView = (
	h: HtmlBuilder<Message>,
	leaf: ReadonlyArray<Html>,
	page: ReadonlyArray<Html>
): Html =>
	h.div(
		[h.Class("book")],
		[
			h.aside(
				[h.Class("leaf")],
				[
					h.a([h.Class("wordmark"), h.Href(shelfRouter())], ["Prosody"]),
					...leaf,
				]
			),
			h.main([h.Class("page")], page),
		]
	);

export const offlineView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> =>
	model.isOnline
		? []
		: [
				h.p(
					[h.Class("offline")],
					[
						h.span([h.Class("label")], ["Offline"]),
						" Your place is kept on this device, and sent when you are back.",
					]
				),
			];
