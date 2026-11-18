import { closeSync, openSync, readSync, writeSync } from "node:fs";

import render from "dom-serializer";
import { Element, isTag } from "domhandler";
import type { AnyNode } from "domhandler";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { parseDocument } from "htmlparser2";

import type { Clip } from "./Boundaries.ts";
import { relative } from "./Epub.ts";
import type { Book } from "./Epub.ts";

/** One sentence's place in the book and in the audio. */
export interface Entry {
	/** `<page path>#<span id>`. */
	readonly sentence: string;
	readonly state: "aligned" | "unaligned";
	readonly start?: number;
	readonly end?: number;
}

/** The audio, in play order, with each file's length. */
export interface Track {
	readonly file: string;
	readonly seconds: number;
}

/** `h:mm:ss.fff`, as EPUB's `media:duration` wants it. */
export const clock = (seconds: number): string => {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;

	return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
};

const elements = (nodes: ReadonlyArray<AnyNode>): Array<Element> =>
	nodes.flatMap((node) =>
		isTag(node) ? [node, ...elements(node.children)] : []
	);

const local = (element: Element) =>
	element.name.toLowerCase().replace(/^.*:/u, "");

const MEDIA_TYPES: Record<string, string> = {
	m4b: "audio/mp4",
	m4a: "audio/mp4",
	mp4: "audio/mp4",
	mp3: "audio/mpeg",
};

/** A page's sentences in order, each with its clip in one track's own time. */
interface Pars {
	readonly page: string;
	readonly smil: string;
	readonly id: string;
	readonly pars: Array<{
		id: string;
		track: number;
		begin: number;
		end: number;
	}>;
	seconds: number;
}

/**
 * Write the reading copy: the book with its pages marked, a media overlay (SMIL) for every page with
 * an aligned sentence, the audio, and a package document upgraded to EPUB 3 that ties them
 * together. The audio is streamed into the archive, so a long book never sits in memory.
 */
export const writeReadingCopy = (
	book: Book,
	marked: ReadonlyMap<string, string>,
	entries: ReadonlyArray<Entry>,
	tracks: ReadonlyArray<Track>,
	out: string
): void => {
	const folder = book.packagePath.split("/").slice(0, -1).join("/");

	const inFolder = (path: string) =>
		folder === "" ? path : `${folder}/${path}`;

	const offsets: Array<number> = [];
	let total = 0;

	for (const track of tracks) {
		offsets.push(total);
		total += track.seconds;
	}

	const audioPaths = tracks.map((track, index) =>
		inFolder(
			`Audio/${String(index + 1).padStart(2, "0")}-${track.file.split("/").at(-1) ?? "audio"}`
		)
	);

	// Sentences by page, in the book's order.
	const byPage = new Map<string, Pars>();

	for (const entry of entries) {
		if (
			entry.state !== "aligned" ||
			entry.start === undefined ||
			entry.end === undefined
		) {
			continue;
		}

		const [page = "", id = ""] = entry.sentence.split("#");
		let pars = byPage.get(page);

		if (!pars) {
			const name =
				page
					.split("/")
					.at(-1)
					?.replace(/\.x?html?$/u, "") ?? "page";

			pars = {
				page,
				smil: inFolder(`MediaOverlays/${name}.smil`),
				id: `mo-${byPage.size + 1}`,
				pars: [],
				seconds: 0,
			};
			byPage.set(page, pars);
		}

		let track = 0;

		while (
			track + 1 < offsets.length &&
			(offsets[track + 1] ?? 0) <= entry.start
		) {
			track += 1;
		}

		const begin = entry.start - (offsets[track] ?? 0);

		const end = Math.min(
			entry.end - (offsets[track] ?? 0),
			tracks[track]?.seconds ?? entry.end
		);

		pars.pars.push({ id, track, begin, end });
		pars.seconds += end - begin;
	}

	// The package document, upgraded and extended.
	const opf = parseDocument(book.packageXml, {
		xmlMode: true,
		decodeEntities: false,
	});

	const all = elements(opf.children);
	const pkg = all.find((element) => local(element) === "package");
	const metadata = all.find((element) => local(element) === "metadata");
	const manifest = all.find((element) => local(element) === "manifest");

	if (pkg) {
		pkg.attribs.version = "3.0";
	}

	const append = (parent: Element | undefined, child: Element) => {
		if (parent) {
			child.parent = parent;
			parent.children.push(child);
		}
	};

	const meta = (property: string, value: string, refines?: string) => {
		const element = new Element(
			"meta",
			refines === undefined
				? { property }
				: { property, refines: `#${refines}` },
			[]
		);

		const text = parseDocument(value, { xmlMode: true }).children[0];

		if (text) {
			text.parent = element;
			element.children.push(text);
		}

		return element;
	};

	for (const [index, path] of audioPaths.entries()) {
		const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
		append(
			manifest,
			new Element("item", {
				id: `audio-${index + 1}`,
				href: relative(book.packagePath, path),
				"media-type": MEDIA_TYPES[extension] ?? "audio/mp4",
			})
		);
	}

	for (const pars of byPage.values()) {
		append(
			manifest,
			new Element("item", {
				id: pars.id,
				href: relative(book.packagePath, pars.smil),
				"media-type": "application/smil+xml",
			})
		);
		append(metadata, meta("media:duration", clock(pars.seconds), pars.id));
	}

	const pageItems = all.filter(
		(element) =>
			local(element) === "item" &&
			byPage.has(
				book.pages.find((page) => page.id === element.attribs.id)?.path ?? ""
			)
	);

	for (const item of pageItems) {
		const path =
			book.pages.find((page) => page.id === item.attribs.id)?.path ?? "";

		const pars = byPage.get(path);

		if (pars) {
			item.attribs["media-overlay"] = pars.id;
		}
	}

	append(metadata, meta("media:duration", clock(total)));
	append(metadata, meta("media:active-class", "-epub-media-overlay-active"));

	if (!all.some((element) => element.attribs.property === "dcterms:modified")) {
		append(
			metadata,
			meta("dcterms:modified", `${new Date().toISOString().slice(0, 19)}Z`)
		);
	}

	const smilOf = (pars: Pars) => {
		const textref = relative(pars.smil, pars.page);

		const body = pars.pars
			.map(
				(par, index) =>
					`<par id="par-${index + 1}"><text src="${textref}#${par.id}"/>` +
					`<audio src="${relative(pars.smil, audioPaths[par.track] ?? "")}" clipBegin="${par.begin.toFixed(3)}s" clipEnd="${par.end.toFixed(3)}s"/></par>`
			)
			.join("\n");

		return (
			'<?xml version="1.0" encoding="UTF-8"?>\n' +
			'<smil xmlns="http://www.w3.org/ns/SMIL" xmlns:epub="http://www.idpf.org/2007/ops" version="3.0">\n' +
			`<body><seq id="seq-1" epub:textref="${textref}">\n${body}\n</seq></body></smil>\n`
		);
	};

	// The archive, streamed to disk: mimetype first and stored, as EPUB requires.
	const fd = openSync(out, "w");
	let failure: Error | null = null;

	const zip = new Zip((error, chunk) => {
		if (error) {
			failure = error;

			return;
		}

		writeSync(fd, chunk);
	});

	const add = (path: string, data: Uint8Array, stored: boolean) => {
		const file = stored
			? new ZipPassThrough(path)
			: new ZipDeflate(path, { level: 6 });

		zip.add(file);
		file.push(data, true);
	};

	try {
		add("mimetype", strToU8("application/epub+zip"), true);

		for (const [path, data] of book.files) {
			if (path === "mimetype" || path === book.packagePath) {
				continue;
			}

			const page = marked.get(path);
			add(path, page === undefined ? data : strToU8(page), false);
		}

		add(
			book.packagePath,
			strToU8(render(opf, { xmlMode: true, decodeEntities: false })),
			false
		);

		for (const pars of byPage.values()) {
			add(pars.smil, strToU8(smilOf(pars)), false);
		}

		// Audio is already compressed: stored, and read in pieces.
		for (const [index, track] of tracks.entries()) {
			const file = new ZipPassThrough(audioPaths[index] ?? "");
			zip.add(file);
			const source = openSync(track.file, "r");
			const piece = new Uint8Array(4 << 20);

			try {
				for (;;) {
					const read = readSync(source, piece, 0, piece.length, null);

					if (read === 0) {
						break;
					}

					file.push(piece.slice(0, read));
				}

				file.push(new Uint8Array(0), true);
			} finally {
				closeSync(source);
			}
		}

		zip.end();
	} finally {
		closeSync(fd);
	}

	if (failure) {
		throw failure;
	}
};
