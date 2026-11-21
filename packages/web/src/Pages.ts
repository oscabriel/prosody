import type { Contents } from "@prosody/domain/Reading/Copy";
import { Clock, Effect, Schema, Stream } from "effect";
import { Mount } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { copyUrl } from "./Copy.ts";
import { Message } from "./Model.ts";
import type { Room } from "./Model.ts";
import { chapterOf } from "./Steps.ts";

export const PRINTED = "printed";

const SWIPE = 50;

const TAP = 10;

const KEYS = new Map([
	["ArrowRight", 1],
	["PageDown", 1],
	["ArrowLeft", -1],
	["PageUp", -1],
]);

interface Point {
	readonly x: number;
	readonly y: number;
}

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

const isZoomed = (): boolean => (window.visualViewport?.scale ?? 1) > 1;

const pointOf = (touch: Touch | undefined): Point => ({
	x: touch?.clientX ?? 0,
	y: touch?.clientY ?? 0,
});

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

export const pagesView = (
	room: Room,
	contents: Contents,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const { shown } = room;
	const count = contents.pictures.length;
	const heading = contents.headings[chapterOf(room, contents)];

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
