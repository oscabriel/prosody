import { Schema } from "effect";

/**
 * A work's identity: `w-` and lower-case letters or digits, so it can name a folder as it is.
 * Nothing is ever found or named by its title.
 */
export const WorkId = Schema.String.check(
	Schema.isPattern(/^w-[a-z0-9]+$/u)
).pipe(Schema.brand("WorkId"));

export type WorkId = typeof WorkId.Type;
