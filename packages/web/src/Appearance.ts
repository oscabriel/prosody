import { Effect, Option, Schema } from "effect";

import { APPEARANCE_STORE, paintTheme } from "./Theme.ts";
import type { Scheme } from "./Theme.ts";

export const ThemeMode = Schema.Literals(["auto", "light", "dark"]);

export type ThemeMode = typeof ThemeMode.Type;

export const Leading = Schema.Literals(["1.45", "1.6", "1.8"]);

export type Leading = typeof Leading.Type;

export const Measure = Schema.Literals(["52ch", "64ch", "74ch"]);

export type Measure = typeof Measure.Type;

export const PageFit = Schema.Literals(["page", "width"]);

export type PageFit = typeof PageFit.Type;

export const PageTone = Schema.Literals(["original", "dimmed", "inverted"]);

export type PageTone = typeof PageTone.Type;

export const ShelfLayout = Schema.Literals(["grid", "list"]);

export type ShelfLayout = typeof ShelfLayout.Type;

export const Appearance = Schema.Struct({
	theme: ThemeMode,
	size: Schema.Int,
	leading: Leading,
	measure: Measure,
	focusDim: Schema.Boolean,
	pageFit: PageFit,
	pageTone: PageTone,
});

export type Appearance = typeof Appearance.Type;

export const MIN_TEXT_SIZE = 85;

export const MAX_TEXT_SIZE = 150;

const TEXT_SIZES: ReadonlyArray<number> = [
	MIN_TEXT_SIZE,
	90,
	100,
	110,
	120,
	130,
	140,
	MAX_TEXT_SIZE,
];

export const DEFAULT_APPEARANCE: Appearance = Appearance.make({
	theme: "auto",
	size: 100,
	leading: "1.6",
	measure: "64ch",
	focusDim: true,
	pageFit: "page",
	pageTone: "dimmed",
});

export const DEFAULT_SHELF_LAYOUT: ShelfLayout = "grid";

const SHELF_VIEW_STORE = "prosody:shelf-view";

const AppearanceJson = Schema.fromJsonString(Appearance);

class StorageRefused extends Schema.TaggedError<StorageRefused>()(
	"StorageRefused",
	{}
) {}

const stored = (key: string): Effect.Effect<Option.Option<string>> =>
	Effect.try({
		try: () => Option.fromNullishOr(localStorage.getItem(key)),
		catch: () => new StorageRefused(),
	}).pipe(Effect.orElseSucceed(() => Option.none()));

const store = (key: string, value: string): Effect.Effect<void> =>
	Effect.try({
		try: () => {
			localStorage.setItem(key, value);
		},
		catch: () => new StorageRefused(),
	}).pipe(Effect.ignore);

export const clampTextSize = (size: number): number =>
	Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, Math.round(size)));

export const stepTextSize = (size: number, by: 1 | -1): number =>
	by > 0
		? (TEXT_SIZES.find((step) => step > size) ?? MAX_TEXT_SIZE)
		: (TEXT_SIZES.findLast((step) => step < size) ?? MIN_TEXT_SIZE);

export const effectiveTheme = (
	theme: ThemeMode,
	systemDark: boolean
): Scheme => {
	if (theme === "auto") {
		return systemDark ? "dark" : "light";
	}

	return theme;
};

export const nextToggleTheme = (
	theme: ThemeMode,
	systemDark: boolean
): ThemeMode =>
	effectiveTheme(theme, systemDark) === "dark" ? "light" : "dark";

export const applyAppearance = (appearance: Appearance): void => {
	paintTheme(appearance.theme === "auto" ? undefined : appearance.theme);

	const root = document.documentElement;
	const size = clampTextSize(appearance.size);

	root.style.setProperty("--reader-size", `${(1.25 * size) / 100}rem`);
	root.style.setProperty("--reader-leading", appearance.leading);
	root.style.setProperty("--reader-measure", appearance.measure);
};

export const savedAppearance: Effect.Effect<Appearance> = Effect.map(
	stored(APPEARANCE_STORE),
	(raw) =>
		Option.getOrElse(
			Option.flatMap(raw, Schema.decodeOption(AppearanceJson)),
			() => DEFAULT_APPEARANCE
		)
);

export const saveAppearance = (appearance: Appearance): Effect.Effect<void> =>
	Option.match(Schema.encodeOption(AppearanceJson)(appearance), {
		onNone: () => Effect.void,
		onSome: (encoded) => store(APPEARANCE_STORE, encoded),
	});

export const savedShelfLayout: Effect.Effect<ShelfLayout> = Effect.map(
	stored(SHELF_VIEW_STORE),
	(raw) =>
		Option.getOrElse(
			Option.flatMap(raw, Schema.decodeUnknownOption(ShelfLayout)),
			() => DEFAULT_SHELF_LAYOUT
		)
);

export const saveShelfLayout = (layout: ShelfLayout): Effect.Effect<void> =>
	store(SHELF_VIEW_STORE, layout);
