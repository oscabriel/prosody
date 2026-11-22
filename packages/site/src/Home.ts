import type { Html, HtmlBuilder } from "foldkit/html";

import type { Message, Model } from "./Model.ts";
import { roomView } from "./Room.ts";
import { docRouter, docsRouter } from "./Route.ts";

const INSTALLING = docRouter({ slug: "installing" });

const ALIGNER = docRouter({ slug: "how-the-aligner-works" });

const NEEDS = docRouter({ slug: "what-you-need" });

const DOES: ReadonlyArray<readonly [string, string]> = [
	[
		"Text and audio in step",
		"When a book has both an EPUB and an M4B audiobook, Prosody aligns them sentence by sentence. The current sentence highlights as it plays, and tapping any sentence jumps the audio there.",
	],
	[
		"One place across devices",
		"Your place follows you between devices as a sentence, a timestamp or a page. Pause an audiobook on your phone, and your laptop opens the ebook at that same sentence.",
	],
	[
		"Built for a phone browser",
		"Install it to your home screen, control playback from the lock screen, open books offline and keep whole reading copies on the device when you need them.",
	],
	[
		"Works with single editions too",
		"Not every book needs a pair. EPUBs open to read, M4B audiobooks play by chapter, and PDFs open a page at a time.",
	],
];

const YOURS: ReadonlyArray<readonly [string, string]> = [
	[
		"Plain folders, untouched",
		"Point Prosody at folders organised by author and title. It never moves, renames or modifies your book files; reading copies live in a separate folder.",
	],
	[
		"Offline speech models",
		"Both speech models are baked into the container image and run on your CPU. Your books and audio never leave your machine.",
	],
	[
		"Accounts and single sign-on",
		"Share one library while keeping every reader’s places and nightstand separate. Sign in with OpenID Connect (such as Pocket ID) or built-in local accounts and invite links.",
	],
	[
		"One TypeScript codebase",
		"Licensed under MIT and structured so you, or a coding agent, can adapt its assumptions to your own hardware.",
	],
];

const FIGURES: ReadonlyArray<readonly [string, string]> = [
	["19×", "faster than real time across 72 hours of audio, on 8 CPU cores"],
	["~0.1 s", "median sentence start error across five measured books"],
	["Up to 40", "sentences checked by a second model before a sync is accepted"],
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
			h.p([h.Class("label")], ["Self-hosted · open source · MIT"]),
			h.h1([], ["Read and listen to the same book, in sync."]),
			h.p(
				[h.Class("lede")],
				[
					"Prosody is a self-hosted app for DRM-free books you own. It aligns each audiobook to its ebook sentence by sentence on your own machine, and keeps one place per book across your devices.",
				]
			),
			h.p(
				[h.Class("calls")],
				[
					h.a([h.Href(INSTALLING), h.Class("call")], ["Install Prosody"]),
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
			h.h2([], ["How alignment works"]),
			h.p(
				[h.Class("lede")],
				[
					"An offline speech model listens to the audiobook once and maps every sentence of the text onto the audio. A second model then checks a spread of aligned sentences against the page; if too few match, the alignment is rejected rather than shown.",
				]
			),
			h.dl(
				[h.Class("figures")],
				FIGURES.map(([figure, means]) =>
					h.div([], [h.dt([], [figure]), h.dd([], [means])])
				)
			),
			h.p([], [h.a([h.Href(ALIGNER)], ["Read how the aligner works →"])]),
		]
	),
	h.section(
		[h.Class("band")],
		[h.h2([], ["Built to stay yours"]), pairsView(YOURS, h)]
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
						[
							"A Linux host running Docker in swarm mode (benchmarked on 8 CPU cores, no GPU required).",
						]
					),
					h.li(
						[],
						[
							"Caddy (or another reverse proxy) with a domain name and TLS certificate for the app.",
						]
					),
					h.li(
						[],
						[
							"An optional OpenID Connect provider if you prefer single sign-on over built-in local accounts.",
						]
					),
					h.li(
						[],
						[
							"DRM-free books (EPUB, M4B or PDF) in folders organised by author and title.",
						]
					),
				]
			),
			h.p(
				[h.Class("calls")],
				[
					h.a([h.Href(INSTALLING), h.Class("call")], ["Install Prosody"]),
					h.a([h.Href(NEEDS)], ["Full requirements →"]),
				]
			),
		]
	),
];
