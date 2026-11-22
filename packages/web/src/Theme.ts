export const APPEARANCE_STORE = "prosody:appearance";

export type Scheme = "light" | "dark";

const BAR: Readonly<Record<Scheme, string>> = {
	light: "#fafafa",
	dark: "#2a2722",
};

const FORCED = /"theme":"(?<theme>light|dark)"/u;

export const forcedIn = (saved: string | null): Scheme | undefined => {
	const theme = FORCED.exec(saved ?? "")?.groups?.theme;

	if (theme === "light" || theme === "dark") {
		return theme;
	}

	return undefined;
};

export const storedTheme = (): Scheme | undefined => {
	try {
		return forcedIn(localStorage.getItem(APPEARANCE_STORE));
	} catch {
		return undefined;
	}
};

export const paintTheme = (forced: Scheme | undefined): void => {
	const root = document.documentElement;

	if (forced === undefined) {
		delete root.dataset.theme;
	} else {
		root.dataset.theme = forced;
	}

	for (const bar of document.querySelectorAll('meta[name="theme-color"]')) {
		const isDark = (bar.getAttribute("media") ?? "").includes("dark");
		const scheme = isDark ? "dark" : "light";

		bar.setAttribute("content", BAR[forced ?? scheme]);
	}
};
