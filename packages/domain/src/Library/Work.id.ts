import { Schema } from "effect";

export const WorkId = Schema.String.check(
	Schema.isPattern(/^w-[a-z0-9]+$/u)
).pipe(Schema.brand("WorkId"));

export type WorkId = typeof WorkId.Type;
