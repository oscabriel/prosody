import { Schema } from "effect";

export const ReaderId = Schema.String.check(
	Schema.isPattern(/^u-[a-z0-9]+$/u)
).pipe(Schema.brand("ReaderId"));

export type ReaderId = typeof ReaderId.Type;

export const Role = Schema.Literals(["admin", "reader"]);

export type Role = typeof Role.Type;
