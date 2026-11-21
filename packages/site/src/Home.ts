import type { Html, HtmlBuilder } from "foldkit/html";

import type { Message, Model } from "./Model.ts";
import { roomView } from "./Room.ts";
import { docRouter, docsRouter } from "./Route.ts";

const INSTALLING = docRouter({ slug: "installing" });

const ALIGNER = docRouter({ slug: "how-the-aligner-works" });

const NEEDS = docRouter({ slug: "what-you-need" });

const DOES: ReadonlyArray<readonly [string, string]> = [
	[
		"Reads and listens together",
		"A book with both an EPUB and an audiobook is synced sentence by sentence. In the reading room the audio follows the text, and a tap on a sentence moves the audio there.",
	],
	[
		"Keeps one place per book",
		"Your place follows you between devices, as a sentence, a time or a page. Stop listening on your phone, and the text opens at that sentence on your laptop.",
	],
	[
		"Works in your pocket",
		"The app installs on a phone from the browser, plays from the lock screen, opens with no network, and keeps a whole book on the device when you ask.",
	],
	[
		"Opens what you have",
		"An EPUB alone reads, an audiobook alone plays by its chapters, and a PDF opens a page at a time. Nothing has to be a pair.",
	],
];

const YOURS: ReadonlyArray<readonly [string, string]> = [
	[
		"Your files stay files",
		"Prosody reads a library of folders by author and title. It never moves, renames or rewrites a book, and what it makes it keeps in a folder of its own.",
	],
	[
		"The syncing is done at home",
		"The speech models are downloaded once and then run offline, on your own processor. Your audio and your text are never sent anywhere.",
	],
	[
		"No accounts",
		"Signing in is being on your tailnet. Only your own Tailscale devices can reach the app, and each is known by its name. There is no password to keep or to leak.",
	],
	[
		"Free to read and to change",
		"The whole of it is one TypeScript codebase under the MIT licence, written so that you, or an agent working for you, can remodel it for your own hardware.",
	],
];

const FIGURES: ReadonlyArray<readonly [string, string]> = [
	["about 20×", "faster than the book plays, on eight cores and no GPU"],
	["0.1 s", "is how close a sentence’s start typically lands"],
	["40", "sentences heard again by a second model before a sync is shown"],
];

const pairsView = (
	pairs: ReadonlyArray<readonly [string, string]>,
	h: HtmlBuilder<Message>
): Html =>
	h.dl(
		[h.Class("pairs")],
		pairs.map(([term, means]) =>
			h.div([], [h.dt([], [term]), h.dd([], [means])])
		)
	);

export const homeView = (
	model: Model,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => [
	h.section(
		[h.Class("hero")],
		[
			h.p([h.Class("label")], ["Self-hosted · open source"]),
			h.h1([], ["Your audiobook and your ebook, as one book."]),
			h.p(
				[h.Class("lede")],
				[
					"Prosody is a self-hosted app for the books you own. It syncs an audiobook to its ebook sentence by sentence, on your own machine, so you can read, listen or do both, and pick up on any device where you left off.",
				]
			),
			h.p(
				[h.Class("calls")],
				[
					h.a([h.Href(INSTALLING), h.Class("call")], ["Host it yourself"]),
					h.a([h.Href(docsRouter())], ["Read the docs →"]),
				]
			),
		]
	),
	roomView(model.listening, h),
	h.section(
		[h.Class("band")],
		[h.h2([], ["What it does"]), pairsView(DOES, h)]
	),
	h.section(
		[h.Class("band")],
		[
			h.h2([], ["How the sync is made"]),
			h.p(
				[h.Class("lede")],
				[
					"A speech model listens to the audiobook once. Every sentence of the text is then placed in what it heard, and a second model listens to a spread of them to confirm the right words are there. A sync that fails that check is refused, not shown.",
				]
			),
			h.dl(
				[h.Class("figures")],
				FIGURES.map(([figure, means]) =>
					h.div([], [h.dt([], [figure]), h.dd([], [means])])
				)
			),
			h.p([], [h.a([h.Href(ALIGNER)], ["How the aligner works →"])]),
		]
	),
	h.section(
		[h.Class("band")],
		[h.h2([], ["Yours, start to finish"]), pairsView(YOURS, h)]
	),
	h.section(
		[h.Class("band")],
		[
			h.h2([], ["What you need"]),
			h.ul(
				[h.Class("needs")],
				[
					h.li(
						[],
						["A Linux machine with Docker. Eight cores is comfortable."]
					),
					h.li([], ["Tailscale on it, and on each device you read with."]),
					h.li([], ["Caddy, and a name for the app."]),
					h.li(
						[],
						[
							"Your books: EPUBs and M4B audiobooks without DRM, in folders by author and title.",
						]
					),
				]
			),
			h.p(
				[h.Class("calls")],
				[
					h.a([h.Href(INSTALLING), h.Class("call")], ["Install Prosody"]),
					h.a([h.Href(NEEDS)], ["What you need, in full →"]),
				]
			),
		]
	),
];
