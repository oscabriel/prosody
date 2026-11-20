import { Schema } from "effect";

/** Where a work stands with you: not opened yet, on the nightstand, finished, or put down for now. */
export const Stage = Schema.Literals([
	"unopened",
	"reading",
	"finished",
	"setAside",
]);

export type Stage = typeof Stage.Type;

/** When one of your devices did something to a work, and which device. */
export const Moment = Schema.Struct({
	/** In milliseconds since 1970, by the device's clock. */
	at: Schema.Int,
	device: Schema.String,
});

export type Moment = typeof Moment.Type;
