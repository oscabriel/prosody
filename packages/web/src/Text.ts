import { Duration, Effect, Option, Schema, Stream } from "effect";
import { Command, Dom, Mount, Render } from "foldkit";

import { Message } from "./Model.ts";

const SPANS = 'span[id^="ps-"]';

const SETTLE = Duration.seconds(1.5);

const LOOKUP = Duration.seconds(6);

const BAND_TOP = 100;

const BAND_BOTTOM = 150;

const JUMP = 200;

const GLIDE = 3000;

const SETTLED = 120;

const scrolling = { until: 0, isGliding: false };

const scrollsItself = (lasting: number): void => {
	scrolling.until = performance.now() + lasting;
	scrolling.isGliding = lasting === GLIDE;

	if (scrolling.isGliding) {
		window.addEventListener(
			"scrollend",
			() => {
				scrolling.until = Math.min(
					scrolling.until,
					performance.now() + SETTLED
				);
			},
			{ once: true }
		);
	}
};

export const isScrollingItself = (): boolean =>
	performance.now() < scrolling.until;

export const isJumpingItself = (): boolean =>
	isScrollingItself() && !scrolling.isGliding;

const isCalm = (): boolean =>
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const spanAt = (target: EventTarget | null): string | undefined => {
	const span = target instanceof Element ? target.closest(SPANS) : null;

	return span?.id;
};

const clearing = () => {
	const bar = document.querySelector(".room-bar");
	const dock = document.querySelector(".player-dock-card");

	return {
		top: Math.max(0, bar?.getBoundingClientRect().bottom ?? 0),
		bottom: Math.min(
			window.innerHeight,
			dock?.getBoundingClientRect().top ?? window.innerHeight
		),
	};
};

const isVisible = (element: Element): boolean => {
	const { top, bottom } = element.getBoundingClientRect();
	const clear = clearing();

	return bottom > clear.top && top < clear.bottom;
};

const isInBand = (element: Element): boolean => {
	const { top, bottom } = element.getBoundingClientRect();

	return top >= BAND_TOP && bottom <= window.innerHeight - BAND_BOTTOM;
};

const isNear = (element: Element): boolean => {
	const { top } = element.getBoundingClientRect();

	return Math.abs(top - window.innerHeight / 2) < window.innerHeight * 1.5;
};

const firstVisible = (section: Element): string | undefined => {
	const { top } = clearing();

	for (const span of section.querySelectorAll(SPANS)) {
		if (span.getBoundingClientRect().bottom > top) {
			return span.id;
		}
	}

	return undefined;
};

const placeIn = (article: Element): string =>
	article instanceof HTMLElement ? (article.dataset.sentence ?? "") : "";

const isLookup = (article: Element): boolean =>
	article instanceof HTMLElement && article.dataset.lookup === "true";

const spanIn = (article: Element, id: string): HTMLElement | undefined => {
	const span = id === "" ? null : article.querySelector(`#${CSS.escape(id)}`);

	return span instanceof HTMLElement ? span : undefined;
};

const focusedIn = (article: Element): HTMLElement | undefined => {
	const focused = document.activeElement;

	return focused instanceof HTMLElement &&
		article.contains(focused) &&
		focused.matches(SPANS)
		? focused
		: undefined;
};

const stopIn = (article: Element): HTMLElement | undefined => {
	const stop = article.querySelector(`${SPANS}[tabindex="0"]`);

	return stop instanceof HTMLElement ? stop : undefined;
};

const rove = (article: Element, to: HTMLElement): void => {
	for (const stop of article.querySelectorAll(`${SPANS}[tabindex="0"]`)) {
		if (stop !== to) {
			stop.setAttribute("tabindex", "-1");
		}
	}

	to.setAttribute("tabindex", "0");
};

const mark = (article: Element): void => {
	const active = spanIn(article, placeIn(article));

	for (const span of article.querySelectorAll(`${SPANS}.is-active`)) {
		if (span !== active) {
			span.classList.remove("is-active");
			span.removeAttribute("aria-current");
		}
	}

	if (active !== undefined) {
		active.classList.add("is-active");
		active.setAttribute("aria-current", "true");
	}

	const first = article.querySelector(SPANS);
	const stop = active ?? focusedIn(article) ?? stopIn(article) ?? first;

	if (stop instanceof HTMLElement) {
		rove(article, stop);
	}
};

const prepare = (article: Element): void => {
	for (const span of article.querySelectorAll(SPANS)) {
		span.setAttribute("tabindex", "-1");
	}

	mark(article);
};

const isAside = (): boolean => {
	const focused = document.activeElement;

	return (
		focused instanceof Element &&
		focused.closest('[role="dialog"], dialog, input, textarea, select') !== null
	);
};

const stepFocus = (article: Element, by: number): void => {
	const from = focusedIn(article);

	if (from === undefined) {
		stopIn(article)?.focus();

		return;
	}

	const spans = [...article.querySelectorAll(SPANS)];
	const to = spans[spans.indexOf(from) + by];

	if (to instanceof HTMLElement) {
		rove(article, to);
		to.focus();
	}
};

const watched = (article: Element) =>
	Effect.acquireRelease(
		Effect.sync(() => {
			prepare(article);

			const observer = new MutationObserver(() => {
				mark(article);
			});

			observer.observe(article, {
				attributes: true,
				attributeFilter: ["data-sentence"],
			});

			return observer;
		}),
		(observer) =>
			Effect.sync(() => {
				observer.disconnect();
			})
	);

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

		const chosen = Dom.streamFromEventFilterMapPreventDefault({
			target: element,
			type: "keydown",
			filterMapEvent: (event) =>
				event instanceof KeyboardEvent &&
				event.key === "Enter" &&
				!(event.altKey || event.ctrlKey || event.metaKey)
					? Option.fromUndefinedOr(spanAt(event.target))
					: Option.none(),
		}).pipe(
			Stream.map((id) => Message.PressedSentence({ id, at: Date.now() }))
		);

		const steps = Dom.streamFromEventFilterMapPreventDefault({
			target: window,
			type: "keydown",
			filterMapEvent: (event) => {
				if (!event.altKey || event.ctrlKey || event.metaKey || isAside()) {
					return Option.none();
				}

				if (event.key === "ArrowDown") {
					return Option.some(1);
				}

				return event.key === "ArrowUp" ? Option.some(-1) : Option.none();
			},
		}).pipe(
			Stream.flatMap((by) => {
				stepFocus(element, by);

				return Stream.empty;
			})
		);

		const scrolls = Stream.fromEventListener(window, "scroll", {
			passive: true,
		}).pipe(
			Stream.filter(() => !(isLookup(element) && isScrollingItself())),
			Stream.switchMap(() =>
				Stream.fromEffect(Effect.sleep(isLookup(element) ? LOOKUP : SETTLE))
			),
			Stream.flatMap(() => {
				const marked = spanIn(element, placeIn(element));

				const id =
					marked !== undefined && isVisible(marked)
						? undefined
						: firstVisible(element);

				return id === undefined
					? Stream.empty
					: Stream.succeed(Message.ReadTo({ id, at: Date.now() }));
			})
		);

		return Stream.unwrap(
			watched(element).pipe(
				Effect.as(
					Stream.merge(
						Stream.merge(presses, chosen),
						Stream.merge(steps, scrolls)
					)
				)
			)
		);
	},
});

const shown = (id: string): Effect.Effect<Option.Option<Element>> =>
	Render.afterCommit.pipe(
		Effect.map(() => Option.fromNullishOr(document.querySelector(`#${id}`)))
	);

export const Show = Command.define("Show", {
	args: { id: Schema.String },
	messages: [Message.CompletedShow],
	execute: ({ id }) =>
		shown(id).pipe(
			Effect.map((found) => {
				if (Option.isSome(found) && !isVisible(found.value)) {
					scrollsItself(JUMP);
					found.value.scrollIntoView({ block: "center" });
				}

				return Message.CompletedShow();
			})
		),
});

export const Follow = Command.define("Follow", {
	args: { id: Schema.String },
	messages: [Message.CompletedShow],
	execute: ({ id }) =>
		shown(id).pipe(
			Effect.map((found) => {
				if (Option.isSome(found) && !isInBand(found.value)) {
					const glides = !isCalm() && isNear(found.value);

					scrollsItself(glides ? GLIDE : JUMP);
					found.value.scrollIntoView({
						behavior: glides ? "smooth" : "auto",
						block: "center",
					});
				}

				return Message.CompletedShow();
			})
		),
});

export const ToTop = Command.define("ToTop", {
	messages: [Message.CompletedShow],
	execute: Render.afterCommit.pipe(
		Effect.map(() => {
			scrollsItself(JUMP);
			window.scrollTo({ top: 0 });

			return Message.CompletedShow();
		})
	),
});
