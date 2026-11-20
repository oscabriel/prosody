import { GrabId } from "@prosody/domain/Acquisition/Grab.id";
import { Config, Effect, Match, Option, Redacted, Schema } from "effect";
import {
	Cookies,
	HttpBody,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";

/**
 * Where qBittorrent's Web UI answers, with no slash at the end, and the user and password it signs
 * in with: `DOWNLOADS_URL`, `DOWNLOADS_USERNAME` and `DOWNLOADS_PASSWORD`, read from `.env`
 * or the shell where the stack is deployed. The runner reads them to start and stop downloads, and
 * the press to watch them.
 */
export const QBittorrentSettings = Config.all({
	url: Config.String("DOWNLOADS_URL"),
	username: Config.String("DOWNLOADS_USERNAME"),
	password: Config.Redacted("DOWNLOADS_PASSWORD"),
});

/** The category every grab is filed under: it saves into the books downloads. */
export const CATEGORY = "books";

/** How long qBittorrent has to answer one request. */
const ANSWER_TIME = "15 seconds";

/** How long a torrent may go with nothing coming before its grab is stalled. */
const STALL_TIME = 30 * 60;

/** One torrent as qBittorrent lists it: the fields Prosody reads. Times are in seconds. */
export const Torrent = Schema.Struct({
	hash: Schema.String,
	state: Schema.String,
	progress: Schema.Finite,
	/** Its tags, joined by commas. */
	tags: Schema.String,
	save_path: Schema.String,
	content_path: Schema.String,
	seeding_time: Schema.Int,
	last_activity: Schema.Int,
	added_on: Schema.Int,
});

export type Torrent = typeof Torrent.Type;

/** qBittorrent could not do what was asked, for this reason. */
export class QBittorrentFailed extends Schema.TaggedError<QBittorrentFailed>()(
	"QBittorrentFailed",
	{ reason: Schema.String }
) {}

const failed = (reason: string) => new QBittorrentFailed({ reason });

const unreachable = () => failed("qBittorrent did not answer");

/** The grab a torrent was added for: the tag that is a grab id. */
export const grabOf = (torrent: Torrent): Option.Option<GrabId> =>
	Option.fromUndefinedOr(
		torrent.tags
			.split(",")
			.map((tag) => tag.trim())
			.find(Schema.is(GrabId))
	);

/** How a grab's download stands, as its torrent shows it. */
export interface Progress {
	readonly percent: number;
	/** Why it is stalled, when it is. */
	readonly stall: Option.Option<string>;
	/** Its file or folder in the books downloads, once it has all come. Empty when it is elsewhere. */
	readonly payload: Option.Option<string>;
	/** Whole hours seeded. */
	readonly hours: number;
}

/** Why a torrent still coming is stalled, at `now` in seconds, if it is. */
const stallOf = (torrent: Torrent, now: number): Option.Option<string> => {
	const lastCame = Math.max(torrent.last_activity, torrent.added_on);

	return Match.value(torrent.state).pipe(
		Match.when("error", () =>
			Option.some("qBittorrent reports an error with it")
		),
		Match.when("missingFiles", () =>
			Option.some("qBittorrent can't find its files")
		),
		Match.whenOr("stoppedDL", "pausedDL", () =>
			Option.some("It was stopped in qBittorrent")
		),
		Match.whenOr("stalledDL", "metaDL", "forcedMetaDL", () =>
			now - lastCame >= STALL_TIME
				? Option.some("Nothing has come for half an hour")
				: Option.none()
		),
		Match.orElse(() => Option.none())
	);
};

/** Where its content is, inside the folder it saves to. */
const payloadOf = (torrent: Torrent): string => {
	const folder = torrent.save_path.endsWith("/")
		? torrent.save_path
		: `${torrent.save_path}/`;

	return torrent.content_path.startsWith(folder)
		? torrent.content_path.slice(folder.length)
		: "";
};

/** How a torrent's download stands at `now`, in seconds. */
export const progressOf = (torrent: Torrent, now: number): Progress => {
	const isCome = torrent.progress >= 1;

	return {
		percent: Math.floor(torrent.progress * 100),
		stall: isCome ? Option.none() : stallOf(torrent, now),
		payload: isCome ? Option.some(payloadOf(torrent)) : Option.none(),
		hours: Math.floor(torrent.seeding_time / 3600),
	};
};

/**
 * qBittorrent's Web UI, signed in: what Prosody asks of it. Each use signs in afresh, so nothing is
 * kept between a minute's watch and the next.
 */
export const signIn = Effect.fn("QBittorrent.signIn")(function* () {
	const { url, username, password } = yield* Effect.orDie(QBittorrentSettings);

	// qBittorrent 5 refuses a request whose origin it can't see, as a guard against other sites.
	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest((request) =>
			request.pipe(
				HttpClientRequest.prependUrl(url),
				HttpClientRequest.setHeaders({ Origin: url, Referer: url })
			)
		)
	);

	/** Send a request and take its answer, or say qBittorrent did not answer. */
	const answerTo = (request: HttpClientRequest.HttpClientRequest) =>
		client
			.execute(request)
			.pipe(Effect.timeout(ANSWER_TIME), Effect.mapError(unreachable));

	const login = yield* answerTo(
		HttpClientRequest.post("/api/v2/auth/login").pipe(
			HttpClientRequest.bodyUrlParams({
				username,
				password: Redacted.value(password),
			})
		)
	);

	// qBittorrent 4 answers "Ok." and 5 answers with no body, each with the session's cookie; a
	// wrong password is "Fails.", with none.
	if (login.status >= 300 || Cookies.isEmpty(login.cookies)) {
		return yield* failed(
			login.status === 403
				? "qBittorrent refused the sign-in, after too many tries"
				: "qBittorrent refused its user and password"
		);
	}

	const session = Cookies.toCookieHeader(login.cookies);

	const signed = (request: HttpClientRequest.HttpClientRequest) =>
		HttpClientRequest.setHeader(request, "Cookie", session);

	/** Send a form to qBittorrent, and fail with what it answered unless it took it. */
	const send = (path: string, form: Record<string, string>) =>
		answerTo(
			signed(
				HttpClientRequest.post(path).pipe(HttpClientRequest.bodyUrlParams(form))
			)
		).pipe(
			Effect.filterOrFail(
				(response) => response.status === 200,
				(response) => failed(`qBittorrent answered ${response.status}`)
			),
			Effect.asVoid
		);

	return {
		/** The torrents in a category, or with a tag. */
		torrents: Effect.fn("QBittorrent.torrents")(function* (filter: {
			readonly category?: string;
			readonly tag?: string;
		}) {
			const response = yield* answerTo(
				signed(
					HttpClientRequest.get("/api/v2/torrents/info").pipe(
						HttpClientRequest.setUrlParams(filter)
					)
				)
			);

			return yield* HttpClientResponse.schemaBodyJson(Schema.Array(Torrent))(
				response
			).pipe(
				Effect.mapError(() => failed("qBittorrent's answer could not be read"))
			);
		}),

		/** Add a torrent file under the category, tagged with its grab. */
		add: Effect.fn("QBittorrent.add")(function* (
			torrent: Uint8Array<ArrayBuffer>,
			grab: GrabId
		) {
			const form = new FormData();

			form.append("torrents", new Blob([torrent]), `${grab}.torrent`);
			form.append("category", CATEGORY);
			form.append("tags", grab);

			const response = yield* answerTo(
				signed(
					HttpClientRequest.post("/api/v2/torrents/add").pipe(
						HttpClientRequest.setBody(HttpBody.formData(form))
					)
				)
			);

			const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));

			// qBittorrent 4 answers "Fails." with 200 for a torrent it already has; 5 answers 409.
			return yield* response.status === 200 && text !== "Fails."
				? Effect.void
				: failed(
						"qBittorrent would not add it: it may have this torrent already"
					);
		}),

		send,
	};
});
