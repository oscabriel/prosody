import { Effect, Schema } from "effect";

export const Sentence = Schema.String.pipe(Schema.brand("Sentence"));

export type Sentence = typeof Sentence.Type;

export const PlaceAt = Schema.Struct({
	sentence: Schema.NullOr(Sentence),
	time: Schema.NullOr(Schema.Finite).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	page: Schema.NullOr(Schema.Int).pipe(
		Schema.withDecodingDefaultKey(Effect.succeed(null))
	),
	at: Schema.Int,
});

export type PlaceAt = typeof PlaceAt.Type;

export const KeptPlace = Schema.Struct({
	...PlaceAt.fields,
	device: Schema.String,
});

export type KeptPlace = typeof KeptPlace.Type;
