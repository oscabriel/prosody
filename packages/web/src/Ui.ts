import { OBLIGATION } from "@prosody/domain/Acquisition/ReleasePayload.command";
import { COVER } from "@prosody/domain/Reading/Copy";
import { Effect, Match, Option } from "effect";
import { Command, Dom, Mount } from "foldkit";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { modifyFields } from "foldkit/struct";

import {
	Appearance,
	applyAppearance,
	effectiveTheme,
	nextToggleTheme,
	saveAppearance,
} from "./Appearance.ts";
import { copyUrl } from "./Copy.ts";
import { deskIcon, moonIcon, shelfIcon, sunIcon } from "./Icons.ts";
import { ConfirmAction, Message } from "./Model.ts";
import type { Copying, Model, Room, ToastAction } from "./Model.ts";
import { percentOf, sizeIn } from "./OnDevice.ts";
import { AppRoute, deskRouter, roomRouter, shelfRouter } from "./Route.ts";
import { kindIn } from "./Steps.ts";

export const CONFIRM_DIALOG_ID = "confirm-dialog";

export const CONFIRM_CANCEL_ID = "confirm-cancel";

export type NavDestination = "shelf" | "desk" | "none";

export type BadgeTone = "neutral" | "ink" | "ok" | "warn" | "danger";

export type HeadingLevel = 1 | 2 | 3;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

const LEADING_PUNCTUATION = /^[\s"'“”‘’«»([{—–-]+/u;

export const firstLetterOf = (title: string): string => {
	const cleaned = title.trim().replace(LEADING_PUNCTUATION, "");

	if (cleaned === "") {
		return "·";
	}

	const first = segmenter.segment(cleaned)[Symbol.iterator]().next();

	return first.done === true ? "·" : first.value.segment;
};

export const OpenConfirmDialog = Command.define("OpenConfirmDialog", {
	messages: [Message.CompletedDialog],
	execute: Dom.showDialog(`#${CONFIRM_DIALOG_ID}`, {
		focusSelector: `#${CONFIRM_CANCEL_ID}`,
		isModal: true,
	}).pipe(Effect.ignore, Effect.as(Message.CompletedDialog())),
});

export const CloseConfirmDialog = Command.define("CloseConfirmDialog", {
	messages: [Message.CompletedDialog],
	execute: Dom.closeDialog(`#${CONFIRM_DIALOG_ID}`).pipe(
		Effect.ignore,
		Effect.as(Message.CompletedDialog())
	),
});

export const ReleaseConfirmDialog = Command.define("ReleaseConfirmDialog", {
	messages: [Message.CompletedDialog],
	execute: Dom.releaseDialogResources(CONFIRM_DIALOG_ID).pipe(
		Effect.as(Message.CompletedDialog())
	),
});

export const ApplyAppearance = Command.define("ApplyAppearance", {
	args: { appearance: Appearance },
	messages: [Message.SavedAppearance],
	execute: ({ appearance }) =>
		Effect.sync(() => {
			applyAppearance(appearance);
		}).pipe(
			Effect.andThen(saveAppearance(appearance)),
			Effect.as(Message.SavedAppearance())
		),
});

export const showToast = (
	model: Model,
	message: string,
	action?: ToastAction
): Model => {
	const nextId = Option.match(model.toast, {
		onNone: () => 1,
		onSome: (current) => current.id + 1,
	});

	return modifyFields(model, {
		toast: () =>
			Option.some({
				id: nextId,
				message,
				action: Option.fromUndefinedOr(action),
				paused: false,
			}),
		announcement: () => message,
	});
};

const HideBrokenCover = Mount.define("HideBrokenCover", {
	messages: [Message.CompletedCover],
	execute: ({ element }) =>
		Effect.gen(function* () {
			if (element instanceof HTMLImageElement) {
				const hide = () => {
					element.hidden = true;
				};

				if (element.complete && element.naturalWidth === 0) {
					hide();
				}

				yield* Effect.acquireRelease(
					Effect.sync(() => {
						element.addEventListener("error", hide, { once: true });

						return hide;
					}),
					(listener) =>
						Effect.sync(() => {
							element.removeEventListener("error", listener);
						})
				);
			}

			return Message.CompletedCover();
		}),
});

const shortTitleOf = (title: string): string =>
	title.length > 18 ? `${title.slice(0, 17).trimEnd()}…` : title;

const copyingPillView = (
	copying: Copying,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	if (copying.problem !== null) {
		return [];
	}

	const hasTotal = copying.of > 0;
	const pct = percentOf(copying.done, copying.of);

	const title = hasTotal
		? `Keeping ${copying.title} on this device (${pct}%)`
		: `Keeping ${copying.title} on this device`;

	const wideLabel = hasTotal
		? `Keeping ${shortTitleOf(copying.title)} ${pct}%`
		: `Keeping ${shortTitleOf(copying.title)}…`;

	const narrowLabel = hasTotal ? `${pct}%` : "Keeping…";

	return [
		h.a(
			[
				h.Class("topbar-pill"),
				h.Href(roomRouter({ work: copying.work })),
				h.Title(title),
			],
			[
				h.span([h.Class("dot"), h.AriaHidden(true)], []),
				h.span([h.Class("hide-narrow tabular")], [wideLabel]),
				h.span([h.Class("hide-wide tabular")], [narrowLabel]),
			]
		),
	];
};

export const themeButtonView = (
	model: Model,
	h: HtmlBuilder<Message>
): Html => {
	const { theme } = model.appearance;
	const effective = effectiveTheme(theme, model.systemDark);
	const next = nextToggleTheme(theme, model.systemDark);

	const label = Match.value(theme).pipe(
		Match.when(
			"auto",
			() => `Theme: Auto (${effective === "dark" ? "Ink" : "Paper"})`
		),
		Match.when("dark", () => "Theme: Ink"),
		Match.when("light", () => "Theme: Paper"),
		Match.exhaustive
	);

	return h.button(
		[
			h.Type("button"),
			h.Class("icon-btn"),
			h.AriaLabel(`${label}. Activate to switch.`),
			h.Title(label),
			h.OnClick(
				Message.ChangedAppearance({
					appearance: { ...model.appearance, theme: next },
				})
			),
		],
		[effective === "dark" ? sunIcon(h) : moonIcon(h)]
	);
};

export const shellView = (
	model: Model,
	active: NavDestination,
	narrow: boolean,
	children: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html => {
	const copying = Option.match(model.copying, {
		onNone: () => [],
		onSome: (activeCopy) => copyingPillView(activeCopy, h),
	});

	const shelfAttrs =
		active === "shelf"
			? [h.Class("topnav-link"), h.Href(shelfRouter()), h.AriaCurrent("page")]
			: [h.Class("topnav-link"), h.Href(shelfRouter())];

	const deskAttrs =
		active === "desk"
			? [h.Class("topnav-link"), h.Href(deskRouter()), h.AriaCurrent("page")]
			: [h.Class("topnav-link"), h.Href(deskRouter())];

	const shelfTabAttrs =
		active === "shelf"
			? [h.Class("tabbar-link"), h.Href(shelfRouter()), h.AriaCurrent("page")]
			: [h.Class("tabbar-link"), h.Href(shelfRouter())];

	const deskTabAttrs =
		active === "desk"
			? [h.Class("tabbar-link"), h.Href(deskRouter()), h.AriaCurrent("page")]
			: [h.Class("tabbar-link"), h.Href(deskRouter())];

	return h.div(
		[],
		[
			h.header(
				[h.Class("topbar")],
				[
					h.div(
						[h.Class(narrow ? "topbar-inner narrow" : "topbar-inner")],
						[
							h.div(
								[h.Class("topbar-left")],
								[
									h.a(
										[h.Class("wordmark"), h.Href(shelfRouter())],
										["Prosody"]
									),
									h.nav(
										[h.Class("topnav"), h.AriaLabel("Primary")],
										[
											h.a(shelfAttrs, ["The shelf"]),
											h.a(deskAttrs, ["The desk"]),
										]
									),
								]
							),
							h.div(
								[h.Class("topbar-right")],
								[...copying, themeButtonView(model, h)]
							),
						]
					),
				]
			),
			h.main(
				[h.Class(narrow ? "app-main narrow" : "app-main"), h.Id("main")],
				children
			),
			h.nav(
				[h.Class("tabbar"), h.AriaLabel("Primary")],
				[
					h.a(shelfTabAttrs, [shelfIcon(h), h.span([], ["Shelf"])]),
					h.a(deskTabAttrs, [deskIcon(h), h.span([], ["Desk"])]),
				]
			),
		]
	);
};

export const offlineBannerView = (
	message: string,
	action: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("banner banner-warn"), h.Role("status")],
		[
			h.div(
				[h.Class("banner-lead")],
				[
					h.span([h.Class("dot"), h.AriaHidden(true)], []),
					h.span([], [message]),
				]
			),
			...action,
		]
	);

const BADGE_CLASS: Readonly<Record<BadgeTone, string>> = {
	neutral: "badge",
	ink: "badge badge-ink",
	ok: "badge badge-ok",
	warn: "badge badge-warn",
	danger: "badge badge-danger",
};

export const badgeView = (
	label: string,
	tone: BadgeTone,
	dot: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.span(
		[h.Class(BADGE_CLASS[tone])],
		dot ? [h.span([h.Class("dot"), h.AriaHidden(true)], []), label] : [label]
	);

export const coverView = (
	work: string,
	title: string,
	hasCopy: boolean,
	badges: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>,
	extraClass?: string
): Html => {
	const frameClass =
		extraClass === undefined || extraClass === ""
			? "cover-frame"
			: `cover-frame ${extraClass}`;

	const image = hasCopy
		? [
				h.keyed("img")(
					work,
					[
						h.Class("cover-img"),
						h.Src(copyUrl(work, COVER)),
						h.Alt(""),
						h.Loading("lazy"),
						h.OnMount(HideBrokenCover()),
					],
					[]
				),
			]
		: [];

	const badgeStrip =
		badges.length > 0 ? [h.div([h.Class("cover-badges")], badges)] : [];

	return h.div(
		[h.Class(frameClass)],
		[
			h.span(
				[h.Class("cover-initial"), h.AriaHidden(true)],
				[firstLetterOf(title)]
			),
			...image,
			...badgeStrip,
		]
	);
};

type Beneath =
	| "nothing"
	| "tabbar"
	| "stage"
	| "dock"
	| "dock-pill"
	| "footer"
	| "footer-pill"
	| "pages";

const beneathIn = (room: Room): Beneath =>
	Option.match(kindIn(room), {
		onNone: () => "nothing",
		onSome: (kind) => {
			if (kind === "audio") {
				return "stage";
			}

			if (kind === "pages") {
				return room.chromeHidden ? "nothing" : "pages";
			}

			const hasPill = room.isPlaying
				? !room.isFollowing
				: Option.isSome(room.returnChapter);

			if (kind === "synced") {
				return hasPill ? "dock-pill" : "dock";
			}

			return hasPill ? "footer-pill" : "footer";
		},
	});

type Beside = "nothing" | "sheet" | "panel";

export const panelBesideToast = (model: Model): Beside =>
	Option.match(
		Option.flatMap(model.room, (room) => room.openPanel),
		{
			onNone: () => "nothing",
			onSome: (panel) => (panel === "player" ? "sheet" : "panel"),
		}
	);

export const beneathToast = (model: Model): Beneath =>
	Option.match(
		Option.filter(model.room, () => AppRoute.guards.Room(model.route)),
		{ onNone: () => "tabbar", onSome: beneathIn }
	);

export const toastView = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.div(
		[
			h.Class("toast"),
			h.DataAttribute("over", beneathToast(model)),
			h.DataAttribute("panel", panelBesideToast(model)),
			h.Hidden(Option.isNone(model.toast)),
			h.OnMouseEnter(Message.PausedToast()),
			h.OnMouseLeave(Message.ResumedToast()),
			h.OnFocusEnter(Message.PausedToast()),
			h.OnFocusLeave(Message.ResumedToast()),
		],
		Option.match(model.toast, {
			onNone: () => [],
			onSome: (toast) => [
				h.span([], [toast.message]),
				...Option.match(toast.action, {
					onNone: () => [],
					onSome: (action) => [
						h.a(
							[
								h.Class("toast-action"),
								h.Href(action.href),
								h.OnClick(Message.DismissedToast()),
							],
							[action.label]
						),
					],
				}),
			],
		})
	);

interface ConfirmCopy {
	readonly title: string;
	readonly body: string;
	readonly confirmLabel: string;
}

const confirmCopyOf = (action: ConfirmAction): ConfirmCopy =>
	ConfirmAction.match(action, {
		Realign: ({ title }) => ({
			title: `Align ${title} again?`,
			body: "This removes the current reading copy until the press finishes aligning it again (usually a minute or two if it has already heard this audio).",
			confirmLabel: "Align again",
		}),
		RemoveCopy: ({ title, bytes }) => ({
			title: "Remove kept copy?",
			body: `${title} (${sizeIn(bytes)}) will be removed from this device. Your reading place stays saved.`,
			confirmLabel: "Remove",
		}),
		Withdraw: ({ title }) => ({
			title: `Withdraw ${title}?`,
			body: "This removes the want from the desk. Any grabs already started will keep running.",
			confirmLabel: "Withdraw",
		}),
		Abandon: ({ title }) => ({
			title: `Abandon ${title}?`,
			body: "Prosody will stop following this grab. Any files already downloaded stay untouched in downloads.",
			confirmLabel: "Abandon",
		}),
		Release: ({ title }) => ({
			title: `Release ${title}?`,
			body: `Make sure your tracker counts all ${OBLIGATION.hours} seeded hours first. The files in downloads remain untouched.`,
			confirmLabel: "Release",
		}),
	});

export const confirmDialogView = (
	model: Model,
	h: HtmlBuilder<Message>
): Html => {
	const copy = Option.match(model.confirm, {
		onNone: (): ConfirmCopy => ({
			title: "",
			body: "",
			confirmLabel: "Confirm",
		}),
		onSome: confirmCopyOf,
	});

	return h.dialog(
		[
			h.Id(CONFIRM_DIALOG_ID),
			h.Class("confirm-dialog"),
			h.AriaLabelledBy("confirm-title"),
			h.AriaDescribedBy("confirm-body"),
			h.OnCancel(Message.CancelledConfirm()),
			h.OnClick(Message.CancelledConfirm()),
		],
		[
			h.div(
				[
					h.Class("confirm-dialog-panel"),
					h.OnClick(Message.CompletedDialog(), { propagation: "Stop" }),
				],
				[
					h.h2([h.Class("dialog-title"), h.Id("confirm-title")], [copy.title]),
					h.p([h.Class("dialog-body"), h.Id("confirm-body")], [copy.body]),
					h.div(
						[h.Class("dialog-actions")],
						[
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-secondary"),
									h.Id(CONFIRM_CANCEL_ID),
									h.OnClick(Message.CancelledConfirm()),
								],
								["Cancel"]
							),
							h.button(
								[
									h.Type("button"),
									h.Class("btn btn-danger"),
									h.Id("confirm-ok"),
									h.OnClick(Message.ConfirmedAction()),
								],
								[copy.confirmLabel]
							),
						]
					),
				]
			),
		]
	);
};

const headingView = (
	level: HeadingLevel,
	title: string,
	h: HtmlBuilder<Message>
): Html =>
	Match.value(level).pipe(
		Match.when(1, () => h.h1([h.Class("empty-title")], [title])),
		Match.when(2, () => h.h2([h.Class("empty-title")], [title])),
		Match.when(3, () => h.h3([h.Class("empty-title")], [title])),
		Match.exhaustive
	);

export const emptyStateView = (
	level: HeadingLevel,
	title: string,
	body: string,
	action: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("empty-state")],
		[
			headingView(level, title, h),
			h.p([h.Class("empty-body")], [body]),
			...action,
		]
	);

export const notFoundView = (
	path: string,
	h: HtmlBuilder<Message>
): Document => ({
	title: "Page not found · Prosody",
	body: h.div(
		[h.Class("empty-state")],
		[
			h.h1([h.Class("empty-title")], ["Page not found"]),
			h.span([h.Class("mono-path")], [path]),
			h.p(
				[h.Class("empty-body")],
				["That address does not match a book or screen in Prosody."]
			),
			h.a(
				[h.Class("btn btn-primary"), h.Href(shelfRouter())],
				["Go to the shelf"]
			),
		]
	),
});

export const liveRegionView = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.div([h.Class("sr-only"), h.AriaLive("polite")], [model.announcement]);
