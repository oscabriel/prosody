import { Schema } from "effect";

export const Shelfmark = Schema.String.pipe(Schema.brand("Shelfmark"));

export type Shelfmark = typeof Shelfmark.Type;

const folderOf = (name: string): string =>
	name
		.replaceAll(":", " -")
		.replaceAll(/[/\\*?"<>|]/gu, "")
		.replaceAll(/\s+/gu, " ")
		.trim();

export const shelfmarkOf = (author: string, title: string): Shelfmark =>
	Shelfmark.make(`${folderOf(author)}/${folderOf(title)}`);
