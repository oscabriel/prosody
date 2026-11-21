import { Duration, Effect, Option, Schema, Stream } from "effect";
import { Command, Mount } from "foldkit";

import { Message } from "./Model.ts";

const spanAt = (target: EventTarget | null): string | undefined => {
	const span =
		target instanceof Element ? target.closest('span[id^="ps-"]') : null;

	return span?.id;
};

const isVisible = (element: Element): boolean => {
	const { top, bottom } = element.getBoundingClientRect();

	return bottom > 0 && top < window.innerHeight;
};

const firstVisible = (section: Element): string | undefined => {
	for (const span of section.querySelectorAll('span[id^="ps-"]')) {
		if (span.getBoundingClientRect().bottom > 0) {
			return span.id;
		}
	}

	return undefined;
};

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

const drawn = Effect.callback<undefined>((resume) => {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			resume(Effect.undefined);
		});
	});
});

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
