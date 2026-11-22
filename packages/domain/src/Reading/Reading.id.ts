import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { ReaderId } from "../Reader.id.ts";

export const ReadingId = Schema.String.check(
	Schema.isPattern(/^u-[a-z0-9]+:w-[a-z0-9]+$/u)
).pipe(Schema.brand("ReadingId"));

export type ReadingId = typeof ReadingId.Type;

export const readingOf = (reader: ReaderId, work: WorkId): ReadingId =>
	ReadingId.make(`${reader}:${work}`);

export const readerOf = (reading: ReadingId): ReaderId =>
	ReaderId.make(reading.slice(0, reading.indexOf(":")));

export const workOf = (reading: ReadingId): WorkId =>
	WorkId.make(reading.slice(reading.indexOf(":") + 1));
