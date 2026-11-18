/**
 * Text as a narrator says it: lower case words the speech model could have written. "20 years" is
 * "twenty years", "Dr." is "doctor", "skirt-like" is "skirt like", "café" is "cafe".
 */

const ONES = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
];

const TENS = [
	"",
	"",
	"twenty",
	"thirty",
	"forty",
	"fifty",
	"sixty",
	"seventy",
	"eighty",
	"ninety",
];

const SCALES: ReadonlyArray<readonly [number, string]> = [
	[1_000_000_000, "billion"],
	[1_000_000, "million"],
	[1000, "thousand"],
];

/** A whole number in words: 1,234 is "one thousand two hundred thirty four". */
export const cardinal = (n: number): Array<string> => {
	if (n < 20) {
		return [ONES[n] ?? ""];
	}

	if (n < 100) {
		const tens = TENS[Math.floor(n / 10)] ?? "";

		return n % 10 === 0 ? [tens] : [tens, ONES[n % 10] ?? ""];
	}

	if (n < 1000) {
		const words = [ONES[Math.floor(n / 100)] ?? "", "hundred"];
		const rest = n % 100;

		if (rest !== 0) {
			words.push(...cardinal(rest));
		}

		return words;
	}

	for (const [size, name] of SCALES) {
		if (n >= size) {
			const words = [...cardinal(Math.floor(n / size)), name];
			const rest = n % size;

			if (rest !== 0) {
				words.push(...cardinal(rest));
			}

			return words;
		}
	}

	return [];
};

const ORDINAL_ENDINGS = new Map([
	["one", "first"],
	["two", "second"],
	["three", "third"],
	["five", "fifth"],
	["eight", "eighth"],
	["nine", "ninth"],
	["twelve", "twelfth"],
]);

/** 21 as "twenty first". */
export const ordinal = (n: number): Array<string> => {
	const words = cardinal(n);
	const last = words.at(-1) ?? "";

	const ending =
		ORDINAL_ENDINGS.get(last) ??
		(last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);

	return [...words.slice(0, -1), ending];
};

/** 1984 as "nineteen eighty four", 2005 as "two thousand five", 1900 as "nineteen hundred". */
export const year = (n: number): Array<string> => {
	if (n >= 2000 && n < 2010) {
		return cardinal(n);
	}

	const high = Math.floor(n / 100);
	const low = n % 100;
	const words = [...cardinal(high)];

	if (low === 0) {
		words.push("hundred");

		return words;
	}

	if (low < 10) {
		words.push("oh");
	}

	words.push(...cardinal(low));

	return words;
};

/** Abbreviations a narrator expands, by their written form without the full stop, lower case. */
const ABBREVIATIONS = new Map([
	["mr", "mister"],
	["mrs", "missus"],
	["ms", "miz"],
	["dr", "doctor"],
	["prof", "professor"],
	["st", "saint"],
	["jr", "junior"],
	["sr", "senior"],
	["vs", "versus"],
	["etc", "et cetera"],
	["e.g", "for example"],
	["i.e", "that is"],
	["approx", "approximately"],
]);

const SYMBOLS = new Map([
	["&", " and "],
	["%", " percent "],
	["+", " plus "],
	["=", " equals "],
	["@", " at "],
	["#", " number "],
]);

/** Digits said one by one: "007" is "zero zero seven". */
const oneByOne = (digits: string): Array<string> => {
	const words: Array<string> = [];

	for (const digit of digits) {
		words.push(...cardinal(Number(digit)));
	}

	return words;
};

/** 1980s as "nineteen eighties". */
const decade = (digits: string): Array<string> => {
	const words = year(Number(digits));
	const last = words.at(-1) ?? "";

	return [
		...words.slice(0, -1),
		last.endsWith("y") ? `${last.slice(0, -1)}ies` : `${last}s`,
	];
};

/** 2:23 as "two twenty three", 2:05 as "two oh five", 2:00 as "two". */
const clock = (hours: string, minutes: string): Array<string> => {
	const words = [...cardinal(Number(hours))];
	const past = Number(minutes);

	if (past === 0) {
		return words;
	}

	if (past < 10) {
		words.push("oh");
	}

	words.push(...cardinal(past));

	return words;
};

/** A plain run of digits: a year when it looks like one, read digit by digit when a number can't be. */
const number = (digits: string): Array<string> => {
	const n = Number(digits);

	if (digits.length > 1 && digits.startsWith("0")) {
		return oneByOne(digits);
	}

	if (digits.length === 4 && n >= 1100 && n < 2100) {
		return year(n);
	}

	if (n < 1_000_000_000_000) {
		return cardinal(n);
	}

	return oneByOne(digits);
};

/** A written number of any kind as spoken words, or `undefined` when the token is not one. */
const sayNumber = (bare: string): Array<string> | undefined => {
	// 1980s
	const decadeMatch = /^(?<digits>\d{4})'?s$/u.exec(bare);

	if (decadeMatch) {
		return decade(decadeMatch.groups?.digits ?? "");
	}

	// '90s
	const shortDecade = /^(?<digits>\d0)'?s$/u.exec(bare);

	if (shortDecade) {
		const [tens = ""] = cardinal(Number(shortDecade.groups?.digits));

		return [`${tens.slice(0, -1)}ies`];
	}

	// 21st, 2nd, 3rd, 4th
	const nth = /^(?<digits>\d+)(?:st|nd|rd|th)$/u.exec(bare);

	if (nth) {
		return ordinal(Number(nth.groups?.digits));
	}

	// 2:23
	const time = /^(?<hours>\d{1,2}):(?<minutes>\d{2})$/u.exec(bare);

	if (time) {
		return clock(time.groups?.hours ?? "", time.groups?.minutes ?? "");
	}

	// 3.5
	const decimal = /^(?<whole>\d+)\.(?<fraction>\d+)$/u.exec(bare);

	if (decimal) {
		return [
			...cardinal(Number(decimal.groups?.whole)),
			"point",
			...oneByOne(decimal.groups?.fraction ?? ""),
		];
	}

	// 1,234,567 and 1,234.50
	if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(bare)) {
		return sayNumber(bare.replaceAll(",", ""));
	}

	if (/^\d+$/u.test(bare)) {
		return number(bare);
	}

	return undefined;
};

/**
 * Letters, digits and marks mixed (a code, a model number, "key:value"): each run of letters is a
 * word and each run of digits a number. Nothing but letters and apostrophes comes out, since the
 * model has no token for anything else.
 */
const sayMixed = (bare: string): Array<string> =>
	(bare.match(/\d+|[a-z']+/gu) ?? [])
		.flatMap((part) =>
			/^\d+$/u.test(part)
				? cardinal(Number(part))
				: [part.replaceAll(/^'+|'+$/gu, "")]
		)
		.filter((word) => /[a-z]/u.test(word));

/** One written token as spoken words. */
const say = (token: string): Array<string> => {
	const bare = token.replaceAll(/^'+|'+$/gu, "");

	if (bare === "") {
		return [];
	}

	const abbreviation = ABBREVIATIONS.get(bare.replace(/\.$/u, ""));

	if (abbreviation !== undefined && token.endsWith(".")) {
		return abbreviation.split(" ");
	}

	return sayNumber(bare) ?? sayMixed(bare);
};

/** What a currency's sign is said as, after the amount. */
const currency = (sign: string): string => {
	if (sign === "$") {
		return "dollars";
	}

	if (sign === "£") {
		return "pounds";
	}

	return "euros";
};

/** Where quoted speech meets the narration around it: after a closing quote, before an opening one. */
const SPEECH_EDGE = /(?<=[”"])\s+|\s+(?=[“"])/u;

/**
 * A sentence's spoken words, phrase by phrase: each run of quoted speech, and each run of narration
 * between. A dramatised reading says "No" and leaves "he said" out, so the two are placed apart.
 * Finer phrases (at every comma) were tried and placed scraps of code listings on chance matches.
 */
export const phrases = (text: string): Array<Array<string>> =>
	text
		.split(SPEECH_EDGE)
		.map(spoken)
		.filter((words) => words.length > 0);

/** The index of the first word of each phrase after the first, as the alignment wants them. */
export const phraseStarts = (
	parts: ReadonlyArray<ReadonlyArray<string>>
): Array<number> => {
	const starts: Array<number> = [];
	let at = 0;

	for (const part of parts.slice(0, -1)) {
		at += part.length;
		starts.push(at);
	}

	return starts;
};

/** A sentence's spoken words. */
export const spoken = (text: string): Array<string> => {
	let plain = text
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[‘’ʼ`´]/gu, "'")
		// Dashes and slashes join words without being said.
		.replaceAll(/[-‐‑‒–—―/\\_⁄]/gu, " ");

	for (const [symbol, word] of SYMBOLS) {
		plain = plain.replaceAll(symbol, word);
	}

	// $5 is "five dollars".
	plain = plain.replaceAll(
		/(?<sign>[$£€])(?<amount>\d[\d,.]*)/gu,
		(_, sign: string, amount: string) => `${amount} ${currency(sign)}`
	);

	return plain
		.split(/\s+/u)
		.map((token) =>
			token.replaceAll(/[^a-z0-9'.:,]/gu, "").replace(/[,:]+$/u, "")
		)
		.map((token) =>
			// A full stop ends a word unless it belongs to an abbreviation or a number.
			ABBREVIATIONS.has(token.replace(/\.$/u, "")) || /^\d+\.\d+$/u.test(token)
				? token
				: token.replace(/\.+$/u, "")
		)
		.flatMap(say)
		.filter((word) => word !== "");
};
