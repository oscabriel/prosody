import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 100,
  // The notes are prose and the spikes are throwaway, so the formatter leaves both alone.
  ignorePatterns: ["spikes/**", "pnpm-lock.yaml", "**/*.md"],
});
