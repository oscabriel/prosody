import { GrabId } from "@prosody/domain/Acquisition/Grab.id";
import { Config, Effect, Match, Option, Redacted, Schema } from "effect";
import {
	Cookies,
	HttpBody,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/http";

export const QBittorrentSettings = Config.all({
	url: Config.String("DOWNLOADS_URL"),
	username: Config.String("DOWNLOADS_USERNAME"),
	password: Config.Redacted("DOWNLOADS_PASSWORD"),
	category: Config.String("DOWNLOADS_CATEGORY").pipe(
		Config.withDefault("books")
	),
});

const ANSWER_TIME = "15 seconds";

const STALL_TIME = 30 * 60;

export const Torrent = Schema.Struct({
	hash: Schema.String,
	state: Schema.String,
	progress: Schema.Finite,
	tags: Schema.String,
	save_path: Schema.String,
	content_path: Schema.String,
	seeding_time: Schema.Int,
	last_activity: Schema.Int,
	added_on: Schema.Int,
});

export type Torrent = typeof Torrent.Type;

export class QBittorrentFailed extends Schema.TaggedError<QBittorrentFailed>()(
	"QBittorrentFailed",
	{ reason: Schema.String }
) {}

const failed = (reason: string) => new QBittorrentFailed({ reason });

const unreachable = () => failed("qBittorrent did not answer");

export const grabOf = (torrent: Torrent): Option.Option<GrabId> =>
	Option.fromUndefinedOr(
		torrent.tags
			.split(",")
			.map((tag) => tag.trim())
			.find(Schema.is(GrabId))
	);

export interface Progress {
	readonly percent: number;
	readonly stall: Option.Option<string>;
	readonly payload: Option.Option<string>;
	readonly hours: number;
}

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

const payloadOf = (torrent: Torrent): string => {
	const folder = torrent.save_path.endsWith("/")
		? torrent.save_path
		: `${torrent.save_path}/`;

	return torrent.content_path.startsWith(folder)
		? torrent.content_path.slice(folder.length)
		: "";
};

export const progressOf = (torrent: Torrent, now: number): Progress => {
	const isCome = torrent.progress >= 1;

	return {
		percent: Math.floor(torrent.progress * 100),
		stall: isCome ? Option.none() : stallOf(torrent, now),
		payload: isCome ? Option.some(payloadOf(torrent)) : Option.none(),
		hours: Math.floor(torrent.seeding_time / 3600),
	};
};

export const signIn = Effect.fn("QBittorrent.signIn")(function* () {
	const { url, username, password, category } =
		yield* Effect.orDie(QBittorrentSettings);

	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest((request) =>
			request.pipe(
				HttpClientRequest.prependUrl(url),
				HttpClientRequest.setHeaders({ Origin: url, Referer: url })
			)
		)
	);

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
		category,

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

		add: Effect.fn("QBittorrent.add")(function* (
			torrent: Uint8Array<ArrayBuffer>,
			grab: GrabId
		) {
			const form = new FormData();

			form.append("torrents", new Blob([torrent]), `${grab}.torrent`);
			form.append("category", category);
			form.append("tags", grab);

			const response = yield* answerTo(
				signed(
					HttpClientRequest.post("/api/v2/torrents/add").pipe(
						HttpClientRequest.setBody(HttpBody.formData(form))
					)
				)
			);

			const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""));

			return yield* response.status === 200 && text !== "Fails."
				? Effect.void
				: failed(
						"qBittorrent would not add it: it may have this torrent already"
					);
		}),

		send,
	};
});
