import { Schema } from "effect";

/** Where a work sits in the library: its folder, `Author/Title`. */
export const Shelfmark = Schema.String.pipe(Schema.brand("Shelfmark"));

export type Shelfmark = typeof Shelfmark.Type;

/**
 * A name as a folder can hold it: a colon becomes a dash, and what no folder takes is left out, a
 * slash among them, so a name is always one folder.
 */
const folderOf = (name: string): string =>
	name
		.replaceAll(":", " -")
		.replaceAll(/[/\\*?"<>|]/gu, "")
		.replaceAll(/\s+/gu, " ")
		.trim();

/** The shelfmark a work is shelved at, made from its author and title. */
export const shelfmarkOf = (author: string, title: string): Shelfmark =>
	Shelfmark.make(`${folderOf(author)}/${folderOf(title)}`);
