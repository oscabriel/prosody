import type { Contents } from "@prosody/domain/Reading/Copy";
import { Clock, Effect, Schema, Stream } from "effect";
import { Mount } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { copyUrl } from "./Copy.ts";
import { Message } from "./Model.ts";
import type { Room } from "./Model.ts";
import { chapterOf } from "./Steps.ts";

// What the reading room shows of a book made of pages: one page at a time, fitted to the screen,
// turned by a tap, a swipe or a key.

/** The id of the page on show, to bring it into view. */
export const PRINTED = "printed";

/** How far a finger must move across the page to turn it, and how little a tap may, in pixels. */
const SWIPE = 50;

const TAP = 10;

/** The keys that turn the page, and which way. */
const KEYS = new Map([
	["ArrowRight", 1],
	["PageDown", 1],
	["ArrowLeft", -1],
	["PageUp", -1],
]);

/** Where a finger or the mouse touched the screen. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/**
 * Which way a touch turns the page: on (1), back (-1), or not at all (0). A swipe to the left turns
 * on and to the right back; a tap on the left third of the page turns back and anywhere else on.
 * Anything else, such as scrolling, turns nothing.
 */
export const turnOf = (
	down: Point,
	up: Point,
	page: { readonly left: number; readonly width: number }
): number => {
	const across = up.x - down.x;
	const along = up.y - down.y;

	if (Math.abs(across) >= SWIPE && Math.abs(across) > Math.abs(along)) {
		return across < 0 ? 1 : -1;
	}

	if (Math.abs(across) < TAP && Math.abs(along) < TAP) {
		return up.x < page.left + page.width / 3 ? -1 : 1;
	}

	return 0;
};

/** Whether the page is zoomed in by a pinch, when a touch moves about the page and turns nothing. */
const isZoomed = (): boolean => (window.visualViewport?.scale ?? 1) > 1;

/** Where a touch began or ended. */
const pointOf = (touch: Touch | undefined): Point => ({
	x: touch?.clientX ?? 0,
	y: touch?.clientY ?? 0,
});

/**
 * Say which page is on show once it has stayed a second, and turn it by a click, a tap or a swipe
 * on it, or by a key. The page on show is keyed by its number, so each page starts this again, and
 * a page passed within the second is never said.
 */
export const Leaf = Mount.defineStream("Leaf", {
	args: { index: Schema.Int },
	messages: [Message.ShowedPage, Message.TurnedPage],
	execute: ({ element, index }) => {
		const turnBy = (by: number) =>
			by === 0
				? Stream.empty
				: Stream.succeed(Message.TurnedPage({ index: index + by }));

		const turn = (from: Point, to: Point) =>
			turnBy(turnOf(from, to, element.getBoundingClientRect()));

		const shown = Stream.fromEffect(
			Effect.map(Clock.currentTimeMillis, (at) =>
				Message.ShowedPage({ index, at })
			).pipe(Effect.delay("1 second"))
		);

		const clicks = Stream.fromEventListener<PointerEvent>(
			element,
			"pointerdown"
		).pipe(
			Stream.filter(
				(down) => down.pointerType === "mouse" && down.button === 0
			),
			Stream.switchMap((down) =>
				Stream.fromEventListener<PointerEvent>(element, "pointerup").pipe(
					Stream.take(1),
					Stream.flatMap((up) =>
						turn(
							{ x: down.clientX, y: down.clientY },
							{ x: up.clientX, y: up.clientY }
						)
					)
				)
			)
		);

		// Read from touch events, which come even while the browser scrolls or zooms. A second finger,
		// as in a pinch, ends the touch that came before it.
		const touches = Stream.fromEventListener<TouchEvent>(
			element,
			"touchstart"
		).pipe(
			Stream.switchMap((start) =>
				start.touches.length > 1 || isZoomed()
					? Stream.empty
					: Stream.fromEventListener<TouchEvent>(element, "touchend").pipe(
							Stream.take(1),
							Stream.flatMap((end) =>
								turn(
									pointOf(start.changedTouches[0]),
									pointOf(end.changedTouches[0])
								)
							)
						)
			)
		);

		const keys = Stream.fromEventListener<KeyboardEvent>(
			window,
			"keydown"
		).pipe(
			Stream.filter(
				(event) => !(event.altKey || event.ctrlKey || event.metaKey)
			),
			Stream.flatMap((event) => turnBy(KEYS.get(event.key) ?? 0))
		);

		return Stream.merge(
			shown,
			Stream.mergeAll([clicks, touches, keys], { concurrency: "unbounded" })
		);
	},
});

/** A button that turns to the page at `index`, by its number. */
const turnButton = (
	index: number,
	label: string,
	back: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class(back ? "turn back" : "turn"),
			h.OnClick(Message.TurnedPage({ index })),
		],
		[label]
	);

/**
 * The chapter you are in, the page on show as large as the window lets it be, and, under it, which
 * page of how many it is, with the pages either side of it. The next page is fetched ahead, so it
 * is there when you turn to it.
 */
export const pagesView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const { shown } = room;
	const count = contents.pictures.length;
	const heading = contents.headings[chapterOf(room, contents)];

	// The pages before the first chapter, such as the cover, are in none.
	const chapter =
		heading !== undefined && heading.page <= shown + 1 ? heading.title : "";

	const picture = (index: number) =>
		copyUrl(room.work, `pictures/${contents.pictures[index] ?? ""}`);

	const page = [
		h.p([h.Class("label chapter")], [chapter]),
		h.keyed("figure")(
			String(shown),
			[h.Id(PRINTED), h.Class("printed"), h.OnMount(Leaf({ index: shown }))],
			[h.img([h.Src(picture(shown)), h.Alt(`Page ${shown + 1}`)])]
		),
	];

	const turns: Array<Html> = [];

	if (shown > 0) {
		turns.push(turnButton(shown - 1, `← Page ${shown}`, true, h));
	}

	turns.push(h.span([h.Class("label")], [`Page ${shown + 1} of ${count}`]));

	if (shown + 1 < count) {
		page.push(h.img([h.Class("ahead"), h.Src(picture(shown + 1)), h.Alt("")]));
		turns.push(turnButton(shown + 1, `Page ${shown + 2} →`, false, h));
	}

	return [...page, h.nav([h.Class("leafing")], turns)];
};
