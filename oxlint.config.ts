import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  options: {
    denyWarnings: true,
  },
  rules: {
    // Effect's tagged values carry a `_tag` field.
    "no-underscore-dangle": ["error", { allow: ["_tag"] }],
  },
  ignorePatterns: ["spikes/**"],
  overrides: [
    {
      // Prosody's own rule: the model decides, and knows nothing about how it is hosted.
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
