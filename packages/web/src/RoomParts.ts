import { Stream } from "effect";
import { Mount } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { Appearance, ThemeMode } from "./Appearance.ts";
import { closeIcon } from "./Icons.ts";
import { Message } from "./Model.ts";

const FLICK = 60;

export const fillOf = (value: number, max: number): string =>
	`${max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0}%`;

export const segmentView = (
	label: string,
	isPressed: boolean,
	message: Message,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("segmented-btn"),
			h.AriaPressed(String(isPressed)),
			h.OnClick(message),
		],
		[label]
	);

export const changed = (appearance: Appearance): Message =>
	Message.ChangedAppearance({ appearance });

const THEMES: ReadonlyArray<readonly [ThemeMode, string]> = [
	["auto", "Auto"],
	["light", "Paper"],
	["dark", "Ink"],
];

export const themeRowView = (
	appearance: Appearance,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("setting-row")],
		[
			h.span([h.Class("setting-name")], ["Theme"]),
			h.div(
				[h.Class("segmented"), h.Role("group"), h.AriaLabel("Color theme")],
				THEMES.map(([theme, label]) =>
					segmentView(
						label,
						appearance.theme === theme,
						changed({ ...appearance, theme }),
						h
					)
				)
			),
		]
	);

export const closeButtonView = (label: string, h: HtmlBuilder<Message>): Html =>
	h.button(
		[
			h.Type("button"),
			h.Class("icon-btn"),
			h.AriaLabel(label),
			h.OnClick(Message.ClosedPanels()),
		],
		[closeIcon(h)]
	);

export const Flick = Mount.defineStream("Flick", {
	messages: [Message.ClosedPanels],
	execute: ({ element }) =>
		Stream.fromEventListener<TouchEvent>(element, "touchstart", {
			passive: true,
		}).pipe(
			Stream.switchMap((start) =>
				Stream.fromEventListener<TouchEvent>(element, "touchend").pipe(
					Stream.take(1),
					Stream.flatMap((end) => {
						const [from] = start.changedTouches;
						const [to] = end.changedTouches;

						if (from === undefined || to === undefined) {
							return Stream.empty;
						}

						const down = to.clientY - from.clientY;
						const across = Math.abs(to.clientX - from.clientX);

						return down >= FLICK && down > across
							? Stream.succeed(Message.ClosedPanels())
							: Stream.empty;
					})
				)
			)
		),
});

export const sheetHeadView = (
	title: string,
	closeLabel: string,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("sheet-top"), h.OnMount(Flick())],
		[
			h.div([h.Class("sheet-grabber hide-wide"), h.AriaHidden(true)], []),
			h.div(
				[h.Class("sheet-head")],
				[
					h.h2([h.Class("sheet-title")], [title]),
					closeButtonView(closeLabel, h),
				]
			),
		]
	);
