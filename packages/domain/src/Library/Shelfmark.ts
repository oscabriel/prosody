import { Schema } from "effect";

/** Where a work sits in the library: its folder, `Author/Title`. */
export const Shelfmark = Schema.String.pipe(Schema.brand("Shelfmark"));

export type Shelfmark = typeof Shelfmark.Type;
