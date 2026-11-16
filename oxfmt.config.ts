import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const ultraciteIgnores = ultracite.ignorePatterns ?? [];

// oxfmt has no `extends`, so Ultracite's settings are spread in.
export default defineConfig({
	...ultracite,
	// Prosody indents with tabs; Ultracite's preset uses spaces.
	useTabs: true,
	ignorePatterns: [
		...ultraciteIgnores,
		".agents/**",
		".claude/**",
		// The notes are prose and the spikes are throwaway, so the formatter leaves both alone.
		"**/*.md",
		"spikes/**",
		"tools/oxlint/**",
		"pnpm-lock.yaml",
	],
});
