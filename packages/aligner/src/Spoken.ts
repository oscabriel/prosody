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
		const rest = n % 100;

		return [
			ONES[Math.floor(n / 100)] ?? "",
			"hundred",
			...(rest === 0 ? [] : cardinal(rest)),
		];
	}

	for (const [size, name] of SCALES) {
		if (n >= size) {
			const rest = n % size;

			return [
				...cardinal(Math.floor(n / size)),
				name,
				...(rest === 0 ? [] : cardinal(rest)),
			];
		}
	}

	return [];
};

const ORDINAL_ENDINGS: Record<string, string> = {
	one: "first",
	two: "second",
	three: "third",
	five: "fifth",
	eight: "eighth",
	nine: "ninth",
	twelve: "twelfth",
};

/** 21 as "twenty first". */
export const ordinal = (n: number): Array<string> => {
	const words = cardinal(n);
	const last = words.at(-1) ?? "";

	const ending =
		ORDINAL_ENDINGS[last] ??
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

	if (low === 0) {
		return [...cardinal(high), "hundred"];
	}

	return [...cardinal(high), ...(low < 10 ? ["oh"] : []), ...cardinal(low)];
};

/** Abbreviations a narrator expands, by their written form without the full stop, lower case. */
const ABBREVIATIONS: Record<string, string> = {
	mr: "mister",
	mrs: "missus",
	ms: "miz",
	dr: "doctor",
	prof: "professor",
	st: "saint",
	jr: "junior",
	sr: "senior",
	vs: "versus",
	etc: "et cetera",
	"e.g": "for example",
	"i.e": "that is",
	approx: "approximately",
};

const SYMBOLS: Record<string, string> = {
	"&": " and ",
	"%": " percent ",
	"+": " plus ",
	"=": " equals ",
	"@": " at ",
	"#": " number ",
};

/** One written token as spoken words. */
const say = (token: string): Array<string> => {
	const bare = token.replaceAll(/^'+|'+$/gu, "");

	if (bare === "") {
		return [];
	}

	const abbreviation = ABBREVIATIONS[bare.replace(/\.$/u, "")];

	if (abbreviation !== undefined && token.endsWith(".")) {
		return abbreviation.split(" ");
	}

	// 1980s
	const decade = /^(\d{4})'?s$/u.exec(bare);

	if (decade) {
		const words = year(Number(decade[1]));
		const last = words.at(-1) ?? "";

		return [
			...words.slice(0, -1),
			last.endsWith("y") ? `${last.slice(0, -1)}ies` : `${last}s`,
		];
	}

	// 21st, 2nd, 3rd, 4th
	const nth = /^(\d+)(st|nd|rd|th)$/u.exec(bare);

	if (nth) {
		return ordinal(Number(nth[1]));
	}

	// 2:23
	const clock = /^(\d{1,2}):(\d{2})$/u.exec(bare);

	if (clock) {
		const minutes = Number(clock[2]);

		return [
			...cardinal(Number(clock[1])),
			...(minutes === 0
				? []
				: minutes < 10
					? ["oh", ...cardinal(minutes)]
					: cardinal(minutes)),
		];
	}

	// 3.5
	const decimal = /^(\d+)\.(\d+)$/u.exec(bare);

	if (decimal) {
		return [
			...cardinal(Number(decimal[1])),
			"point",
			...[...(decimal[2] ?? "")].flatMap((digit) => cardinal(Number(digit))),
		];
	}

	// 1,234,567
	if (/^\d{1,3}(,\d{3})+$/u.test(bare)) {
		return cardinal(Number(bare.replaceAll(",", "")));
	}

	if (/^\d+$/u.test(bare)) {
		const n = Number(bare);

		if (bare.length > 1 && bare.startsWith("0")) {
			return [...bare].flatMap((digit) => cardinal(Number(digit)));
		}

		if (bare.length === 4 && n >= 1100 && n < 2100) {
			return year(n);
		}

		if (n < 1_000_000_000_000) {
			return cardinal(n);
		}

		return [...bare].flatMap((digit) => cardinal(Number(digit)));
	}

	// Letters and digits mixed (a code, a model number): letters as words, digits one by one.
	return bare
		.split(/(\d+)/u)
		.flatMap((part) =>
			/^\d+$/u.test(part)
				? cardinal(Number(part))
				: part
						.replaceAll(".", " ")
						.split(" ")
						.map((word) => word.replaceAll(/^'+|'+$/gu, ""))
		)
		.filter((word) => /[a-z]/u.test(word));
};

/** A sentence's spoken words. */
export const spoken = (text: string): Array<string> => {
	let plain = text
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[‘’ʼ`´]/gu, "'")
		// Dashes and slashes join words without being said.
		.replaceAll(/[-‐‑‒–—―/\\_]/gu, " ");

	for (const [symbol, word] of Object.entries(SYMBOLS)) {
		plain = plain.replaceAll(symbol, word);
	}

	// $5 is "five dollars".
	plain = plain.replaceAll(
		/[$£€](\d[\d,.]*)/gu,
		(_, amount: string, offset: number, all: string) =>
			`${amount} ${all[offset] === "$" ? "dollars" : all[offset] === "£" ? "pounds" : "euros"}`
	);

	return plain
		.split(/\s+/u)
		.map((token) =>
			token.replaceAll(/[^a-z0-9'.:,]/gu, "").replace(/[,:]+$/u, "")
		)
		.map((token) =>
			// A full stop ends a word unless it belongs to an abbreviation or a number.
			ABBREVIATIONS[token.replace(/\.$/u, "")] !== undefined ||
			/^\d+\.\d+$/u.test(token)
				? token
				: token.replace(/\.+$/u, "")
		)
		.flatMap(say)
		.filter((word) => word !== "");
};
