import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const ultraciteIgnores = ultracite.ignorePatterns ?? [];

export default defineConfig({
	...ultracite,
	useTabs: true,
	ignorePatterns: [
		...ultraciteIgnores,
		".agents/**",
		".claude/**",
		"**/*.md",
		"tools/oxlint/**",
		"pnpm-lock.yaml",
	],
});
