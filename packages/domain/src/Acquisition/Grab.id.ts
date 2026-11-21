import { Schema } from "effect";

export const GrabId = Schema.String.check(
	Schema.isPattern(/^w-[a-z0-9]+\.[1-9][0-9]*$/u)
).pipe(Schema.brand("GrabId"));

export type GrabId = typeof GrabId.Type;

export const GrabStatus = Schema.Literals([
	"none",
	"downloading",
	"stalled",
	"abandoned",
	"arrived",
	"released",
]);
