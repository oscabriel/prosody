import { Duration, Effect, Option, Schema, Stream } from "effect";
import { Command, Mount } from "foldkit";

import { Message } from "./Model.ts";

/** The marked sentence an event happened in, if any. */
const spanAt = (target: EventTarget | null): string | undefined => {
	const span =
		target instanceof Element ? target.closest('span[id^="ps-"]') : null;

	return span?.id;
};

/** Whether an element can be seen in the window. */
const isVisible = (element: Element): boolean => {
	const { top, bottom } = element.getBoundingClientRect();

	return bottom > 0 && top < window.innerHeight;
};

/**
 * The first marked sentence whose line is below the top of the window: where a reader who scrolled
 * has got to.
 */
const firstVisible = (section: Element): string | undefined => {
	for (const span of section.querySelectorAll('span[id^="ps-"]')) {
		if (span.getBoundingClientRect().bottom > 0) {
			return span.id;
		}
	}

	return undefined;
};

/**
 * What a reader does in the text: tapping a sentence, and scrolling to another part of the section.
 * A scroll only counts once it has stopped, and only when it took your place off the screen; the
 * section marks your place in `data-sentence`.
 */
export const Read = Mount.defineStream("Read", {
	messages: [Message.PressedSentence, Message.ReadTo],
	execute: ({ element }) => {
		const presses = Stream.fromEventListener<MouseEvent>(element, "click").pipe(
			Stream.flatMap((event) =>
				Option.match(Option.fromUndefinedOr(spanAt(event.target)), {
					onNone: () => Stream.empty,
					onSome: (id) =>
						Stream.succeed(Message.PressedSentence({ id, at: Date.now() })),
				})
			)
		);

		const scrolls = Stream.fromEventListener(window, "scroll", {
			passive: true,
		}).pipe(
			Stream.debounce(Duration.seconds(1.5)),
			Stream.flatMap(() => {
				const place =
					element instanceof HTMLElement
						? (element.dataset.sentence ?? "")
						: "";

				const marked =
					place === "" ? null : document.querySelector(`#${place}`);

				const id =
					marked !== null && isVisible(marked)
						? undefined
						: firstVisible(element);

				return id === undefined
					? Stream.empty
					: Stream.succeed(Message.ReadTo({ id, at: Date.now() }));
			})
		);

		return Stream.merge(presses, scrolls);
	},
});

/** Two animation frames: long enough for a new section to be drawn. */
const drawn = Effect.callback<undefined>((resume) => {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			resume(Effect.undefined);
		});
	});
});

/** Bring a sentence into view, unless it is already on screen. */
export const Show = Command.define("Show", {
	args: { id: Schema.String },
	messages: [Message.CompletedShow],
	execute: ({ id }) =>
		drawn.pipe(
			Effect.flatMap(() =>
				Effect.sync(() => {
					const element = document.querySelector(`#${id}`);

					if (element !== null && !isVisible(element)) {
						element.scrollIntoView({ block: "center" });
					}
				})
			),
			Effect.as(Message.CompletedShow())
		),
});

/** Go to the top of a newly shown section. */
export const ToTop = Command.define("ToTop", {
	messages: [Message.CompletedShow],
	execute: drawn.pipe(
		Effect.flatMap(() =>
			Effect.sync(() => {
				window.scrollTo({ top: 0 });
			})
		),
		Effect.as(Message.CompletedShow())
	),
});
