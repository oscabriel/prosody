import { Schema } from "effect";

export const Stage = Schema.Literals([
	"unopened",
	"reading",
	"finished",
	"setAside",
]);

export type Stage = typeof Stage.Type;

export const Moment = Schema.Struct({
	at: Schema.Int,
	device: Schema.String,
});

export type Moment = typeof Moment.Type;
