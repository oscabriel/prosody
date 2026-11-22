import type { Html, HtmlBuilder } from "foldkit/html";

const stroked = <M>(
	h: HtmlBuilder<M>,
	size: number,
	strokeWidth: string,
	children: ReadonlyArray<Html>
): Html =>
	h.svg(
		[
			h.Width(String(size)),
			h.Height(String(size)),
			h.ViewBox("0 0 24 24"),
			h.Fill("none"),
			h.Stroke("currentColor"),
			h.StrokeWidth(strokeWidth),
			h.StrokeLinecap("round"),
			h.StrokeLinejoin("round"),
			h.AriaHidden(true),
		],
		children
	);

const filled = <M>(
	h: HtmlBuilder<M>,
	size: number,
	children: ReadonlyArray<Html>
): Html =>
	h.svg(
		[
			h.Width(String(size)),
			h.Height(String(size)),
			h.ViewBox("0 0 24 24"),
			h.Fill("currentColor"),
			h.AriaHidden(true),
		],
		children
	);

export const shelfIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	stroked(h, size, "1.7", [
		h.path(
			[
				h.D(
					"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"
				),
			],
			[]
		),
	]);

export const deskIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	stroked(h, size, "1.7", [
		h.polyline([h.Points("22 12 16 12 14 15 10 15 8 12 2 12")], []),
		h.path(
			[
				h.D(
					"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
				),
			],
			[]
		),
	]);

export const backIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	stroked(h, size, "1.8", [h.path([h.D("m15 18-6-6 6-6")], [])]);

export const contentsIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	stroked(h, size, "1.7", [
		h.line([h.X1("8"), h.X2("21"), h.Y1("6"), h.Y2("6")], []),
		h.line([h.X1("8"), h.X2("21"), h.Y1("12"), h.Y2("12")], []),
		h.line([h.X1("8"), h.X2("21"), h.Y1("18"), h.Y2("18")], []),
		h.circle(
			[
				h.Cx("4"),
				h.Cy("6"),
				h.R("1"),
				h.Fill("currentColor"),
				h.Stroke("none"),
			],
			[]
		),
		h.circle(
			[
				h.Cx("4"),
				h.Cy("12"),
				h.R("1"),
				h.Fill("currentColor"),
				h.Stroke("none"),
			],
			[]
		),
		h.circle(
			[
				h.Cx("4"),
				h.Cy("18"),
				h.R("1"),
				h.Fill("currentColor"),
				h.Stroke("none"),
			],
			[]
		),
	]);

export const moreIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	filled(h, size, [
		h.circle([h.Cx("5"), h.Cy("12"), h.R("1.7")], []),
		h.circle([h.Cx("12"), h.Cy("12"), h.R("1.7")], []),
		h.circle([h.Cx("19"), h.Cy("12"), h.R("1.7")], []),
	]);

export const searchIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.circle([h.Cx("11"), h.Cy("11"), h.R("7")], []),
		h.path([h.D("m20 20-3.5-3.5")], []),
	]);

export const closeIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.8", [
		h.path([h.D("M18 6 6 18")], []),
		h.path([h.D("m6 6 12 12")], []),
	]);

export const gridIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.rect([h.X("3"), h.Y("3"), h.Width("7"), h.Height("7"), h.Rx("1")], []),
		h.rect([h.X("14"), h.Y("3"), h.Width("7"), h.Height("7"), h.Rx("1")], []),
		h.rect([h.X("3"), h.Y("14"), h.Width("7"), h.Height("7"), h.Rx("1")], []),
		h.rect([h.X("14"), h.Y("14"), h.Width("7"), h.Height("7"), h.Rx("1")], []),
	]);

export const listIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.line([h.X1("8"), h.X2("21"), h.Y1("6"), h.Y2("6")], []),
		h.line([h.X1("8"), h.X2("21"), h.Y1("12"), h.Y2("12")], []),
		h.line([h.X1("8"), h.X2("21"), h.Y1("18"), h.Y2("18")], []),
		h.line([h.X1("3"), h.X2("3.01"), h.Y1("6"), h.Y2("6")], []),
		h.line([h.X1("3"), h.X2("3.01"), h.Y1("12"), h.Y2("12")], []),
		h.line([h.X1("3"), h.X2("3.01"), h.Y1("18"), h.Y2("18")], []),
	]);

export const playIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	filled(h, size, [
		h.path(
			[
				h.D(
					"M7 5.2v13.6c0 .8.85 1.3 1.54.9l10.8-6.8a1.05 1.05 0 0 0 0-1.8L8.54 4.3A1.05 1.05 0 0 0 7 5.2Z"
				),
			],
			[]
		),
	]);

export const pauseIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	filled(h, size, [
		h.rect(
			[h.X("6"), h.Y("4.5"), h.Width("4.2"), h.Height("15"), h.Rx("1.2")],
			[]
		),
		h.rect(
			[h.X("13.8"), h.Y("4.5"), h.Width("4.2"), h.Height("15"), h.Rx("1.2")],
			[]
		),
	]);

export const skipBackIcon = <M>(h: HtmlBuilder<M>, size = 22): Html =>
	stroked(h, size, "1.65", [
		h.path([h.D("M3 12a9 9 0 1 0 3-6.7L3 8")], []),
		h.path([h.D("M3 3v5h5")], []),
		h.text(
			[
				h.X("12"),
				h.Y("15.2"),
				h.TextAnchor("middle"),
				h.Fill("currentColor"),
				h.Stroke("none"),
				h.FontSize("7.5"),
				h.FontWeight("700"),
				h.FontFamily("system-ui,sans-serif"),
			],
			["15"]
		),
	]);

export const skipAheadIcon = <M>(h: HtmlBuilder<M>, size = 22): Html =>
	stroked(h, size, "1.65", [
		h.path([h.D("M21 12a9 9 0 1 1-3-6.7L21 8")], []),
		h.path([h.D("M21 3v5h-5")], []),
		h.text(
			[
				h.X("12"),
				h.Y("15.2"),
				h.TextAnchor("middle"),
				h.Fill("currentColor"),
				h.Stroke("none"),
				h.FontSize("7.5"),
				h.FontWeight("700"),
				h.FontFamily("system-ui,sans-serif"),
			],
			["30"]
		),
	]);

export const prevChapIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	filled(h, size, [
		h.rect([h.X("5"), h.Y("5"), h.Width("2.2"), h.Height("14"), h.Rx("1")], []),
		h.path(
			[
				h.D(
					"M18.5 5.8v12.4a.8.8 0 0 1-1.24.67l-8.8-6.2a.8.8 0 0 1 0-1.34l8.8-6.2a.8.8 0 0 1 1.24.67Z"
				),
			],
			[]
		),
	]);

export const nextChapIcon = <M>(h: HtmlBuilder<M>, size = 20): Html =>
	filled(h, size, [
		h.rect(
			[h.X("16.8"), h.Y("5"), h.Width("2.2"), h.Height("14"), h.Rx("1")],
			[]
		),
		h.path(
			[
				h.D(
					"M5.5 5.8v12.4a.8.8 0 0 0 1.24.67l8.8-6.2a.8.8 0 0 0 0-1.34l-8.8-6.2a.8.8 0 0 0-1.24.67Z"
				),
			],
			[]
		),
	]);

export const chevUpIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.8", [h.path([h.D("m18 15-6-6-6 6")], [])]);

export const chevRightIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.8", [h.path([h.D("m9 18 6-6-6-6")], [])]);

export const moonIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.path([h.D("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z")], []),
	]);

export const sunIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.circle([h.Cx("12"), h.Cy("12"), h.R("4")], []),
		h.path(
			[
				h.D(
					"M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
				),
			],
			[]
		),
	]);

export const keptIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "2.1", [h.path([h.D("M20 6 9 17l-5-5")], [])]);

export const downloadIcon = <M>(h: HtmlBuilder<M>, size = 18): Html =>
	stroked(h, size, "1.7", [
		h.path([h.D("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4")], []),
		h.polyline([h.Points("7 10 12 15 17 10")], []),
		h.line([h.X1("12"), h.X2("12"), h.Y1("15"), h.Y2("3")], []),
	]);

export const audioIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "1.8", [
		h.path(
			[
				h.D(
					"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
				),
			],
			[]
		),
	]);

export const syncedIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "1.8", [
		h.path([h.D("M4 12v-1a8 8 0 0 1 16 0v1")], []),
		h.path(
			[
				h.D(
					"M4 12h2a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 6 18H5a1.5 1.5 0 0 1-1.5-1.5V12Z"
				),
			],
			[]
		),
		h.path(
			[
				h.D(
					"M18 12h2v4.5A1.5 1.5 0 0 1 18.5 18h-1A1.5 1.5 0 0 1 16 16.5v-3A1.5 1.5 0 0 1 17.5 12Z"
				),
			],
			[]
		),
		h.line([h.X1("10"), h.X2("14"), h.Y1("14"), h.Y2("14")], []),
		h.line([h.X1("10"), h.X2("14"), h.Y1("17"), h.Y2("17")], []),
	]);

export const pagesIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "1.8", [
		h.path(
			[h.D("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z")],
			[]
		),
		h.polyline([h.Points("14 2 14 8 20 8")], []),
	]);

export const textIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "1.8", [
		h.path([h.D("M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z")], []),
		h.path([h.D("M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z")], []),
	]);

export const alertIcon = <M>(h: HtmlBuilder<M>, size = 14): Html =>
	stroked(h, size, "2", [
		h.circle([h.Cx("12"), h.Cy("12"), h.R("9")], []),
		h.line([h.X1("12"), h.X2("12"), h.Y1("8"), h.Y2("12")], []),
		h.line([h.X1("12"), h.X2("12.01"), h.Y1("16"), h.Y2("16")], []),
	]);

export const returnBackIcon = <M>(h: HtmlBuilder<M>, size = 16): Html =>
	stroked(h, size, "1.8", [
		h.polyline([h.Points("9 14 4 9 9 4")], []),
		h.path([h.D("M20 20v-7a4 4 0 0 0-4-4H4")], []),
	]);

export const arrowDownIcon = <M>(h: HtmlBuilder<M>, size = 16): Html =>
	stroked(h, size, "1.8", [
		h.line([h.X1("12"), h.X2("12"), h.Y1("5"), h.Y2("19")], []),
		h.polyline([h.Points("19 12 12 19 5 12")], []),
	]);

export const externalIcon = <M>(h: HtmlBuilder<M>, size = 13): Html =>
	stroked(h, size, "1.8", [
		h.path(
			[h.D("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")],
			[]
		),
		h.polyline([h.Points("15 3 21 3 21 9")], []),
		h.line([h.X1("10"), h.X2("21"), h.Y1("14"), h.Y2("3")], []),
	]);
