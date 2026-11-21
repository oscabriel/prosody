import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";

const ultraciteIgnores = core.ignorePatterns ?? [];

export default defineConfig({
	env: core.env,
	extends: [core, vitest, effectRecommended],
	ignorePatterns: [
		...ultraciteIgnores,
		".agents/**",
		".claude/**",
		"tools/oxlint/**",
	],
	jsPlugins: [
		{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
		{
			name: "anti-slop-effect",
			specifier: "./tools/oxlint/anti-slop/effect/index.ts",
		},
		{ name: "prosody", specifier: "./tools/oxlint/prosody/index.ts" },
	],
	options: {
		denyWarnings: true,
		reportUnusedDisableDirectives: "error",
		typeAware: true,
	},
	rules: {
		"effecttsgo/prefer-barrel-import": "error",
		"effecttsgo/schema-class-missing-brand": "off",
		"func-names": "off",
		"max-classes-per-file": "off",
		"no-redeclare": "off",
		"require-yield": "off",
		"sort-keys": "off",
		"typescript/array-type": [
			"error",
			{ default: "generic", readonly: "generic" },
		],
		"typescript/consistent-indexed-object-style": "off",
		"typescript/method-signature-style": "off",
		"unicorn/filename-case": [
			"error",
			{ cases: { kebabCase: true, pascalCase: true } },
		],
		"unicorn/no-array-method-this-argument": "off",
		"unicorn/throw-new-error": "off",

		"effecttsgo/crypto-random-uuid-in-effect": "error",
		"effecttsgo/global-console-in-effect": "error",
		"effecttsgo/global-date-in-effect": "error",
		"effecttsgo/global-fetch-in-effect": "error",
		"effecttsgo/global-json-in-effect": "error",
		"effecttsgo/process-env-in-effect": "error",
		"effecttsgo/effect-try-without-catch": "error",
		"effecttsgo/extends-native-error": "error",
		"effecttsgo/missing-concurrency-option": "error",
		"effecttsgo/provide-merge-all-to-array": "error",
		"effecttsgo/strict-effect-provide": "error",

		"oxc/no-accumulating-spread": "error",
		"anti-slop/max-ternary-depth": ["error", { maxDepth: 2 }],
		"anti-slop/no-array-filter-map": "error",
		"anti-slop/no-chained-type-assertions": "error",
		"anti-slop/no-conditional-spread": "error",
		"anti-slop/no-disabled-type-assertion-rules": "error",
		"anti-slop/no-known-value-widening": "error",
		"anti-slop/no-module-mocking": "error",
		"anti-slop/no-object-parameters": "error",
		"anti-slop/no-reduce-accumulator-copy": "error",
		"anti-slop/no-reflect-apply": "error",
		"anti-slop/no-reflect-get": "error",
		"anti-slop/no-reprovide-ambient-service": "error",
		"anti-slop/no-runtime-typeof": "error",
		"anti-slop/no-shape-in-symbol-names": "error",
		"anti-slop/no-unknown-parameters": "error",
		"anti-slop/no-unknown-returns": "error",
		"anti-slop/no-unknown-type-aliases": "error",
		"anti-slop/no-unsafe-dictionary-type": "error",
		"anti-slop/no-widen-then-assert": "error",
		"anti-slop/require-readable-spacing": "error",
		"anti-slop/require-safety-comment-for-type-assertion": "error",
		"anti-slop-effect/no-manual-effect-error-tag": "error",
		"anti-slop-effect/no-manual-tag-comparison": "error",
		"anti-slop-effect/no-manual-tagged-construction": "error",
		"anti-slop-effect/no-manual-tagged-type": "error",
		"anti-slop-effect/no-ordie-in-service-construction": "error",
		"anti-slop-effect/no-service-constructor-imports": "error",
		"anti-slop-effect/no-service-parameters": "error",
		"anti-slop-effect/no-test-code-in-src": "error",
		"anti-slop-effect/prefer-effect-match": "error",
		"anti-slop-effect/prefer-tagged-error-handling": "error",
		"anti-slop-effect/prefer-yield-service": "error",
		"anti-slop-effect/require-cause-when-narrowing": "error",
		"anti-slop-effect/require-operation-span": "error",
		"anti-slop-effect/require-service-make-layer": "error",

		"prosody/no-comments": "error",
	},
	overrides: [
		{
			files: [
				"packages/press/src/Press.ts",
				"packages/server/src/Api.ts",
				"packages/server/src/Source.ts",
				"packages/web/src/entry.ts",
			],
			rules: { "effecttsgo/strict-effect-provide": "off" },
		},
		{
			files: ["packages/domain/src/**"],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						patterns: [
							{
								group: [
									"**",
									"!effect",
									"!effect/**",
									"!@alchemy.run/domain",
									"!@alchemy.run/domain/**",
									"!./**",
									"!../**",
								],
								message:
									"The model imports only effect and @alchemy.run/domain. Docker, Postgres and the library's files belong to the server and the press.",
							},
						],
					},
				],
			},
		},
	],
});
