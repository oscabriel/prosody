import * as Schema from "effect/Schema";

/* A work's identity. Nothing is ever found or named by its title. */
export const WorkId = Schema.String.pipe(Schema.brand("WorkId"));
export type WorkId = typeof WorkId.Type;
