import { PgClient } from "@effect/sql-pg";
import { ReaderId, Role } from "@prosody/domain/Reader.id";
import {
	Clock,
	Config,
	Context,
	Duration,
	Effect,
	Exit,
	Layer,
	Option,
	Schema,
	SchemaGetter,
	Scope,
	SynchronizedRef,
} from "effect";
import type { Redacted } from "effect";
import { SecureRandom } from "effect/crypto";
import { SqlClient } from "effect/sql";
import type { SqlError } from "effect/sql";

import { base64UrlOf, hexOf, sha256Hex } from "./Crypto.ts";

export class AuthStoreError extends Schema.TaggedError<AuthStoreError>()(
	"AuthStoreError",
	{ reason: Schema.String, cause: Schema.optionalKey(Schema.Defect()) }
) {}

export class UsernameTaken extends Schema.TaggedError<UsernameTaken>()(
	"UsernameTaken",
	{ username: Schema.String }
) {}

export class SetupAlreadyDone extends Schema.TaggedError<SetupAlreadyDone>()(
	"SetupAlreadyDone",
	{}
) {}

export class InvalidInvite extends Schema.TaggedError<InvalidInvite>()(
	"InvalidInvite",
	{}
) {}

export class LastAdmin extends Schema.TaggedError<LastAdmin>()(
	"LastAdmin",
	{}
) {}

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

export const PublicUser = Schema.Struct({
	id: ReaderId,
	username: Schema.String,
	displayName: Schema.String,
	role: Role,
	createdAt: Schema.Finite,
});

export type PublicUser = typeof PublicUser.Type;

export interface StoredUser extends PublicUser {
	readonly passwordHash: Option.Option<string>;
}

export const SessionInfo = Schema.Struct({
	id: Schema.String,
	userId: ReaderId,
	device: Schema.String,
	createdAt: Schema.Finite,
	lastSeenAt: Schema.Finite,
	expiresAt: Schema.Finite,
});

export type SessionInfo = typeof SessionInfo.Type;

export const PublicInvite = Schema.Struct({
	id: Schema.String,
	role: Role,
	note: Schema.String,
	createdBy: ReaderId,
	createdAt: Schema.Finite,
	expiresAt: Schema.Finite,
});

export type PublicInvite = typeof PublicInvite.Type;

export interface OidcState {
	readonly state: string;
	readonly codeVerifier: string;
	readonly nonce: string;
	readonly redirectTo: string;
	readonly expiresAt: number;
}

export interface Authenticated {
	readonly user: PublicUser;
	readonly session: SessionInfo;
}

export interface NewLocalUser {
	readonly username: string;
	readonly displayName: string;
	readonly passwordHash: string;
}

export interface OidcUser {
	readonly issuer: string;
	readonly subject: string;
	readonly usernameHint: string;
	readonly displayName: string;
	readonly groups: Option.Option<ReadonlyArray<string>>;
	readonly adminGroup: string;
}

export interface NewSession {
	readonly userId: ReaderId;
	readonly deviceName: string;
}

export interface NewInvite {
	readonly createdBy: ReaderId;
	readonly role: Role;
	readonly note: string;
}

export interface Registration {
	readonly inviteToken: string;
	readonly username: string;
	readonly displayName: string;
	readonly passwordHash: string;
}

export const SESSION_LIFETIME = Duration.toMillis(Duration.days(90));

export const TOUCH_AFTER = Duration.toMillis(Duration.minutes(5));

export const SLIDE_AFTER = Duration.toMillis(Duration.days(1));

export const shouldSlide = (expiresAt: number, now: number): boolean =>
	expiresAt - now < SESSION_LIFETIME - SLIDE_AFTER;

export const MAX_DISPLAY_NAME = 64;

const displayNameOf = (name: string): string => {
	const cleaned = name
		.replaceAll(/\s+/gu, " ")
		.trim()
		.slice(0, MAX_DISPLAY_NAME);

	return cleaned === "" ? "Reader" : cleaned;
};

export const INVITE_LIFETIME = Duration.toMillis(Duration.days(7));

const USERNAME = /^[a-z0-9][a-z0-9._-]{0,31}$/u;

export const isValidUsername = (username: string): boolean =>
	USERNAME.test(username);

export const sanitizeUsername = (hint: string): string => {
	const cleaned = hint
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9._-]+/gu, "-")
		.replace(/^[^a-z0-9]+/u, "")
		.slice(0, 32)
		.replace(/[._-]+$/u, "");

	return cleaned === "" ? "reader" : cleaned;
};

export const usernameCandidate = (base: string, attempt: number): string => {
	if (attempt <= 1) {
		return base;
	}

	const suffix = `-${attempt}`;

	return `${base.slice(0, 32 - suffix.length).replace(/[._-]+$/u, "")}${suffix}`;
};

export const roleFromGroups = (
	groups: ReadonlyArray<string>,
	adminGroup: string
): Role => (groups.includes(adminGroup) ? "admin" : "reader");

export const readerIdOf = (bytes: Uint8Array): ReaderId =>
	ReaderId.make(`u-${hexOf(bytes)}`);

const Millis = Schema.Union([
	Schema.Finite,
	Schema.FiniteFromString,
	Schema.BigInt.pipe(
		Schema.decodeTo(Schema.Finite, {
			decode: SchemaGetter.transform<number, bigint>(Number),
			encode: SchemaGetter.transform((value: number) =>
				BigInt(Math.trunc(value))
			),
		})
	),
]);

const UserRow = Schema.Struct({
	id: ReaderId,
	username: Schema.String,
	display_name: Schema.String,
	role: Role,
	password_hash: Schema.NullOr(Schema.String),
	created_at: Millis,
});

type UserRow = typeof UserRow.Type;

const SessionRow = Schema.Struct({
	id: Schema.String,
	user_id: ReaderId,
	device_name: Schema.String,
	created_at: Millis,
	last_seen_at: Millis,
	expires_at: Millis,
});

type SessionRow = typeof SessionRow.Type;

const SignedInRow = Schema.Struct({
	session_id: Schema.String,
	device_name: Schema.String,
	session_created_at: Millis,
	last_seen_at: Millis,
	expires_at: Millis,
	id: ReaderId,
	username: Schema.String,
	display_name: Schema.String,
	role: Role,
	password_hash: Schema.NullOr(Schema.String),
	created_at: Millis,
});

const InviteRow = Schema.Struct({
	id: Schema.String,
	role: Role,
	note: Schema.String,
	created_by: ReaderId,
	created_at: Millis,
	expires_at: Millis,
});

type InviteRow = typeof InviteRow.Type;

const StateRow = Schema.Struct({
	state: Schema.String,
	code_verifier: Schema.String,
	nonce: Schema.String,
	redirect_to: Schema.String,
	expires_at: Millis,
});

const CountRow = Schema.Struct({ count: Millis });

const IdRow = Schema.Struct({ id: Schema.String });

const publicUserOf = (row: UserRow): PublicUser => ({
	id: row.id,
	username: row.username,
	displayName: row.display_name,
	role: row.role,
	createdAt: row.created_at,
});

const storedUserOf = (row: UserRow): StoredUser => ({
	...publicUserOf(row),
	passwordHash: Option.fromNullOr(row.password_hash),
});

const sessionOf = (row: SessionRow): SessionInfo => ({
	id: row.id,
	userId: row.user_id,
	device: row.device_name,
	createdAt: row.created_at,
	lastSeenAt: row.last_seen_at,
	expiresAt: row.expires_at,
});

const inviteOf = (row: InviteRow): PublicInvite => ({
	id: row.id,
	role: row.role,
	note: row.note,
	createdBy: row.created_by,
	createdAt: row.created_at,
	expiresAt: row.expires_at,
});

const rowsOf =
	<S extends Schema.Constraint>(schema: S) =>
	(rows: ReadonlyArray<unknown>) =>
		Schema.decodeEffect(Schema.Array(schema))(rows).pipe(
			Effect.mapError(
				(cause) =>
					new AuthStoreError({
						reason: "The sign-in database returned a row it could not read",
						cause,
					})
			)
		);

const unavailable = (error: SqlError.SqlError) =>
	Effect.fail(
		new AuthStoreError({
			reason: `The sign-in database failed: ${error.message}`,
			cause: error,
		})
	);

const TABLES = [
	`CREATE TABLE IF NOT EXISTS prosody_users (
		id TEXT PRIMARY KEY,
		username TEXT NOT NULL UNIQUE,
		display_name TEXT NOT NULL,
		role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
		password_hash TEXT,
		oidc_issuer TEXT,
		oidc_subject TEXT,
		created_at BIGINT NOT NULL,
		UNIQUE (oidc_issuer, oidc_subject)
	)`,
	`CREATE TABLE IF NOT EXISTS prosody_sessions (
		id TEXT PRIMARY KEY,
		token_hash TEXT NOT NULL UNIQUE,
		user_id TEXT NOT NULL REFERENCES prosody_users(id) ON DELETE CASCADE,
		device_name TEXT NOT NULL,
		created_at BIGINT NOT NULL,
		last_seen_at BIGINT NOT NULL,
		expires_at BIGINT NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS prosody_invites (
		id TEXT PRIMARY KEY,
		token_hash TEXT NOT NULL UNIQUE,
		role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
		created_by TEXT NOT NULL REFERENCES prosody_users(id) ON DELETE CASCADE,
		note TEXT NOT NULL DEFAULT '',
		created_at BIGINT NOT NULL,
		expires_at BIGINT NOT NULL,
		used_by TEXT REFERENCES prosody_users(id) ON DELETE SET NULL,
		used_at BIGINT
	)`,
	`CREATE TABLE IF NOT EXISTS prosody_oidc_states (
		state TEXT PRIMARY KEY,
		code_verifier TEXT NOT NULL,
		nonce TEXT NOT NULL,
		redirect_to TEXT NOT NULL,
		expires_at BIGINT NOT NULL
	)`,
	"CREATE INDEX IF NOT EXISTS prosody_sessions_user ON prosody_sessions (user_id)",
];

const lockUsers = (sql: SqlClient.SqlClient) =>
	sql`LOCK TABLE prosody_users IN SHARE ROW EXCLUSIVE MODE`;

const countUsers = (sql: SqlClient.SqlClient) =>
	sql`SELECT count(*) AS count FROM prosody_users`.pipe(
		Effect.flatMap(rowsOf(CountRow)),
		Effect.map((rows) => rows[0]?.count ?? 0)
	);

const countAdmins = (sql: SqlClient.SqlClient) =>
	sql`SELECT count(*) AS count FROM prosody_users WHERE role = 'admin'`.pipe(
		Effect.flatMap(rowsOf(CountRow)),
		Effect.map((rows) => rows[0]?.count ?? 0)
	);

const userById = (sql: SqlClient.SqlClient, id: string) =>
	sql`SELECT * FROM prosody_users WHERE id = ${id}`.pipe(
		Effect.flatMap(rowsOf(UserRow)),
		Effect.map((rows) => Option.fromUndefinedOr(rows[0]))
	);

const usernameTaken = (sql: SqlClient.SqlClient, username: string) =>
	sql`SELECT id FROM prosody_users WHERE username = ${username}`.pipe(
		Effect.flatMap(rowsOf(IdRow)),
		Effect.map((rows) => rows.length > 0)
	);

export const createTables = Effect.gen(function* () {
	const sql = yield* SqlClient.SqlClient;

	for (const statement of TABLES) {
		yield* sql.unsafe(statement);
	}
});

const tablesAt = (url: Redacted.Redacted) =>
	Layer.effectDiscard(createTables).pipe(
		Layer.provideMerge(PgClient.layer({ url }))
	);

export class AuthDatabase extends Context.Service<
	AuthDatabase,
	{
		readonly sql: Effect.Effect<SqlClient.SqlClient, AuthStoreError>;
	}
>()("@prosody/server/AuthDatabase", {
	make: Effect.gen(function* () {
		const url = yield* Config.option(Config.Redacted("PROSODY_DATABASE_URL"));

		const ready = yield* SynchronizedRef.make(
			Option.none<SqlClient.SqlClient>()
		);

		const connect = Effect.gen(function* () {
			if (Option.isNone(url)) {
				return yield* new AuthStoreError({
					reason: "PROSODY_DATABASE_URL is not set",
				});
			}

			const attempt = yield* Scope.make();

			const context = yield* Layer.buildWithScope(
				tablesAt(url.value),
				attempt
			).pipe(Effect.onError(() => Scope.close(attempt, Exit.void)));

			return Context.get(context, SqlClient.SqlClient);
		});

		const sql = SynchronizedRef.modifyEffect(ready, (current) =>
			Option.match(current, {
				onSome: (client) => Effect.succeed([client, current] as const),
				onNone: () =>
					Effect.map(
						connect,
						(client) => [client, Option.some(client)] as const
					),
			})
		).pipe(
			Effect.tapError((cause) =>
				Effect.logError("the sign-in database is not ready", { cause })
			),
			Effect.catchTag("SqlError", (cause) =>
				Effect.fail(
					new AuthStoreError({
						reason: "The sign-in database is not ready",
						cause,
					})
				)
			),
			Effect.withSpan("AuthDatabase.sql")
		);

		return { sql };
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}

export class AuthStore extends Context.Service<
	AuthStore,
	{
		readonly userCount: Effect.Effect<number, AuthStoreError>;
		readonly createFirstAdmin: (
			user: NewLocalUser
		) => Effect.Effect<PublicUser, AuthStoreError | SetupAlreadyDone>;
		readonly findUserByUsername: (
			username: string
		) => Effect.Effect<Option.Option<StoredUser>, AuthStoreError>;
		readonly findUserById: (
			id: ReaderId
		) => Effect.Effect<Option.Option<PublicUser>, AuthStoreError>;
		readonly upsertOidcUser: (
			user: OidcUser
		) => Effect.Effect<PublicUser, AuthStoreError>;
		readonly listUsers: Effect.Effect<
			ReadonlyArray<PublicUser>,
			AuthStoreError
		>;
		readonly updateUserRole: (
			id: ReaderId,
			role: Role
		) => Effect.Effect<PublicUser, AuthStoreError | LastAdmin | NotFound>;
		readonly deleteUser: (
			id: ReaderId
		) => Effect.Effect<void, AuthStoreError | LastAdmin | NotFound>;
		readonly createSession: (
			session: NewSession
		) => Effect.Effect<
			{ readonly session: SessionInfo; readonly rawToken: string },
			AuthStoreError
		>;
		readonly authenticateSession: (
			rawToken: string
		) => Effect.Effect<Option.Option<Authenticated>, AuthStoreError>;
		readonly listSessions: (
			userId: ReaderId
		) => Effect.Effect<ReadonlyArray<SessionInfo>, AuthStoreError>;
		readonly renameSession: (
			userId: ReaderId,
			sessionId: string,
			deviceName: string
		) => Effect.Effect<boolean, AuthStoreError>;
		readonly deleteSession: (
			userId: ReaderId,
			sessionId: string
		) => Effect.Effect<boolean, AuthStoreError>;
		readonly deleteSessionByToken: (
			rawToken: string
		) => Effect.Effect<void, AuthStoreError>;
		readonly createInvite: (
			invite: NewInvite
		) => Effect.Effect<
			{ readonly invite: PublicInvite; readonly rawToken: string },
			AuthStoreError
		>;
		readonly listInvites: Effect.Effect<
			ReadonlyArray<PublicInvite>,
			AuthStoreError
		>;
		readonly findValidInvite: (
			rawToken: string
		) => Effect.Effect<Option.Option<PublicInvite>, AuthStoreError>;
		readonly deleteInvite: (
			id: string
		) => Effect.Effect<boolean, AuthStoreError>;
		readonly registerWithInvite: (
			registration: Registration
		) => Effect.Effect<
			PublicUser,
			AuthStoreError | InvalidInvite | UsernameTaken
		>;
		readonly saveOidcState: (
			record: OidcState
		) => Effect.Effect<void, AuthStoreError>;
		readonly consumeOidcState: (
			state: string
		) => Effect.Effect<Option.Option<OidcState>, AuthStoreError>;
	}
>()("@prosody/server/AuthStore", {
	make: Effect.gen(function* () {
		const database = yield* AuthDatabase;
		const random = yield* SecureRandom.SecureRandom;

		const insertUser = Effect.fnUntraced(function* (
			sql: SqlClient.SqlClient,
			user: {
				readonly username: string;
				readonly displayName: string;
				readonly role: Role;
				readonly passwordHash: string | null;
				readonly oidcIssuer: string | null;
				readonly oidcSubject: string | null;
			}
		) {
			const id = readerIdOf(yield* random.randomBytes(6));
			const now = yield* Clock.currentTimeMillis;

			yield* sql`INSERT INTO prosody_users (id, username, display_name, role, password_hash, oidc_issuer, oidc_subject, created_at) VALUES (${id}, ${user.username}, ${user.displayName}, ${user.role}, ${user.passwordHash}, ${user.oidcIssuer}, ${user.oidcSubject}, ${now})`;

			return {
				id,
				username: user.username,
				displayName: user.displayName,
				role: user.role,
				createdAt: now,
			};
		});

		const freeUsername = Effect.fnUntraced(function* (
			sql: SqlClient.SqlClient,
			hint: string
		) {
			const base = sanitizeUsername(hint);

			for (let attempt = 1; attempt <= 9; attempt += 1) {
				const candidate = usernameCandidate(base, attempt);

				if (!(yield* usernameTaken(sql, candidate))) {
					return candidate;
				}
			}

			const hex = hexOf(yield* random.randomBytes(3));

			return `${base.slice(0, 25).replace(/[._-]+$/u, "")}-${hex}`;
		});

		const userCount = Effect.gen(function* () {
			return yield* countUsers(yield* database.sql);
		}).pipe(
			Effect.catchTag("SqlError", unavailable),
			Effect.withSpan("AuthStore.userCount")
		);

		const createFirstAdmin = Effect.fn("AuthStore.createFirstAdmin")(
			function* (user: NewLocalUser) {
				const sql = yield* database.sql;

				return yield* sql.withTransaction(
					Effect.gen(function* () {
						yield* lockUsers(sql);

						if ((yield* countUsers(sql)) > 0) {
							return yield* new SetupAlreadyDone();
						}

						return yield* insertUser(sql, {
							username: user.username,
							displayName: user.displayName,
							role: "admin",
							passwordHash: user.passwordHash,
							oidcIssuer: null,
							oidcSubject: null,
						});
					})
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const findUserByUsername = Effect.fn("AuthStore.findUserByUsername")(
			function* (username: string) {
				const sql = yield* database.sql;

				const rows =
					yield* sql`SELECT * FROM prosody_users WHERE username = ${username}`.pipe(
						Effect.flatMap(rowsOf(UserRow))
					);

				return Option.map(Option.fromUndefinedOr(rows[0]), storedUserOf);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const findUserById = Effect.fn("AuthStore.findUserById")(
			function* (id: ReaderId) {
				return Option.map(
					yield* userById(yield* database.sql, id),
					publicUserOf
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const upsertOidcUser = Effect.fn("AuthStore.upsertOidcUser")(
			function* (asserted: OidcUser) {
				const sql = yield* database.sql;

				const user = {
					...asserted,
					displayName: displayNameOf(asserted.displayName),
				};

				return yield* sql.withTransaction(
					Effect.gen(function* () {
						yield* lockUsers(sql);

						const found =
							yield* sql`SELECT * FROM prosody_users WHERE oidc_issuer = ${user.issuer} AND oidc_subject = ${user.subject}`.pipe(
								Effect.flatMap(rowsOf(UserRow))
							);

						const [existing] = found;

						if (existing !== undefined) {
							const wanted = Option.match(user.groups, {
								onNone: () => existing.role,
								onSome: (groups) => roleFromGroups(groups, user.adminGroup),
							});

							const role =
								wanted === "reader" &&
								existing.role === "admin" &&
								(yield* countAdmins(sql)) <= 1
									? "admin"
									: wanted;

							if (
								role !== existing.role ||
								user.displayName !== existing.display_name
							) {
								yield* sql`UPDATE prosody_users SET role = ${role}, display_name = ${user.displayName} WHERE id = ${existing.id}`;
							}

							return {
								...publicUserOf(existing),
								role,
								displayName: user.displayName,
							};
						}

						const first = (yield* countUsers(sql)) === 0;

						const role = Option.match(user.groups, {
							onNone: (): Role => (first ? "admin" : "reader"),
							onSome: (groups): Role =>
								first ? "admin" : roleFromGroups(groups, user.adminGroup),
						});

						return yield* insertUser(sql, {
							username: yield* freeUsername(sql, user.usernameHint),
							displayName: user.displayName,
							role,
							passwordHash: null,
							oidcIssuer: user.issuer,
							oidcSubject: user.subject,
						});
					})
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const listUsers = Effect.gen(function* () {
			const sql = yield* database.sql;

			const rows =
				yield* sql`SELECT * FROM prosody_users ORDER BY created_at ASC, username ASC`.pipe(
					Effect.flatMap(rowsOf(UserRow))
				);

			return rows.map(publicUserOf);
		}).pipe(
			Effect.catchTag("SqlError", unavailable),
			Effect.withSpan("AuthStore.listUsers")
		);

		const updateUserRole = Effect.fn("AuthStore.updateUserRole")(
			function* (id: ReaderId, role: Role) {
				const sql = yield* database.sql;

				return yield* sql.withTransaction(
					Effect.gen(function* () {
						yield* lockUsers(sql);

						const found = yield* userById(sql, id);

						if (Option.isNone(found)) {
							return yield* new NotFound();
						}

						if (
							found.value.role === "admin" &&
							role === "reader" &&
							(yield* countAdmins(sql)) <= 1
						) {
							return yield* new LastAdmin();
						}

						yield* sql`UPDATE prosody_users SET role = ${role} WHERE id = ${id}`;

						return { ...publicUserOf(found.value), role };
					})
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const deleteUser = Effect.fn("AuthStore.deleteUser")(
			function* (id: ReaderId) {
				const sql = yield* database.sql;

				yield* sql.withTransaction(
					Effect.gen(function* () {
						yield* lockUsers(sql);

						const found = yield* userById(sql, id);

						if (Option.isNone(found)) {
							return yield* new NotFound();
						}

						if (
							found.value.role === "admin" &&
							(yield* countAdmins(sql)) <= 1
						) {
							return yield* new LastAdmin();
						}

						return yield* Effect.asVoid(
							sql`DELETE FROM prosody_users WHERE id = ${id}`
						);
					})
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const createSession = Effect.fn("AuthStore.createSession")(
			function* (session: NewSession) {
				const sql = yield* database.sql;
				const rawToken = base64UrlOf(yield* random.randomBytes(32));
				const id = `s-${hexOf(yield* random.randomBytes(6))}`;
				const now = yield* Clock.currentTimeMillis;
				const expiresAt = now + SESSION_LIFETIME;

				yield* sql`INSERT INTO prosody_sessions (id, token_hash, user_id, device_name, created_at, last_seen_at, expires_at) VALUES (${id}, ${sha256Hex(rawToken)}, ${session.userId}, ${session.deviceName}, ${now}, ${now}, ${expiresAt})`;

				return {
					session: {
						id,
						userId: session.userId,
						device: session.deviceName,
						createdAt: now,
						lastSeenAt: now,
						expiresAt,
					},
					rawToken,
				};
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const authenticateSession = Effect.fn("AuthStore.authenticateSession")(
			function* (rawToken: string) {
				const sql = yield* database.sql;
				const now = yield* Clock.currentTimeMillis;

				const rows =
					yield* sql`SELECT s.id AS session_id, s.device_name, s.created_at AS session_created_at, s.last_seen_at, s.expires_at, u.id, u.username, u.display_name, u.role, u.password_hash, u.created_at FROM prosody_sessions s JOIN prosody_users u ON u.id = s.user_id WHERE s.token_hash = ${sha256Hex(rawToken)} AND s.expires_at > ${now}`.pipe(
						Effect.flatMap(rowsOf(SignedInRow))
					);

				const [row] = rows;

				if (row === undefined) {
					return Option.none<Authenticated>();
				}

				const slid = shouldSlide(row.expires_at, now);
				const touched = slid || now - row.last_seen_at > TOUCH_AFTER;
				const expiresAt = slid ? now + SESSION_LIFETIME : row.expires_at;

				if (touched) {
					yield* sql`UPDATE prosody_sessions SET last_seen_at = ${now}, expires_at = ${expiresAt} WHERE id = ${row.session_id}`;
				}

				return Option.some({
					user: {
						id: row.id,
						username: row.username,
						displayName: row.display_name,
						role: row.role,
						createdAt: row.created_at,
					},
					session: {
						id: row.session_id,
						userId: row.id,
						device: row.device_name,
						createdAt: row.session_created_at,
						lastSeenAt: touched ? now : row.last_seen_at,
						expiresAt,
					},
				});
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const listSessions = Effect.fn("AuthStore.listSessions")(
			function* (userId: ReaderId) {
				const sql = yield* database.sql;
				const now = yield* Clock.currentTimeMillis;

				const rows =
					yield* sql`SELECT id, user_id, device_name, created_at, last_seen_at, expires_at FROM prosody_sessions WHERE user_id = ${userId} AND expires_at > ${now} ORDER BY last_seen_at DESC`.pipe(
						Effect.flatMap(rowsOf(SessionRow))
					);

				return rows.map(sessionOf);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const renameSession = Effect.fn("AuthStore.renameSession")(
			function* (userId: ReaderId, sessionId: string, deviceName: string) {
				const sql = yield* database.sql;

				const rows =
					yield* sql`UPDATE prosody_sessions SET device_name = ${deviceName} WHERE id = ${sessionId} AND user_id = ${userId} RETURNING id`.pipe(
						Effect.flatMap(rowsOf(IdRow))
					);

				return rows.length > 0;
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const deleteSession = Effect.fn("AuthStore.deleteSession")(
			function* (userId: ReaderId, sessionId: string) {
				const sql = yield* database.sql;

				const rows =
					yield* sql`DELETE FROM prosody_sessions WHERE id = ${sessionId} AND user_id = ${userId} RETURNING id`.pipe(
						Effect.flatMap(rowsOf(IdRow))
					);

				return rows.length > 0;
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const deleteSessionByToken = Effect.fn("AuthStore.deleteSessionByToken")(
			function* (rawToken: string) {
				const sql = yield* database.sql;

				yield* sql`DELETE FROM prosody_sessions WHERE token_hash = ${sha256Hex(rawToken)}`;
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const createInvite = Effect.fn("AuthStore.createInvite")(
			function* (invite: NewInvite) {
				const sql = yield* database.sql;
				const rawToken = base64UrlOf(yield* random.randomBytes(32));
				const id = `inv-${hexOf(yield* random.randomBytes(6))}`;
				const now = yield* Clock.currentTimeMillis;
				const expiresAt = now + INVITE_LIFETIME;

				yield* sql`INSERT INTO prosody_invites (id, token_hash, role, created_by, note, created_at, expires_at) VALUES (${id}, ${sha256Hex(rawToken)}, ${invite.role}, ${invite.createdBy}, ${invite.note}, ${now}, ${expiresAt})`;

				return {
					invite: {
						id,
						role: invite.role,
						note: invite.note,
						createdBy: invite.createdBy,
						createdAt: now,
						expiresAt,
					},
					rawToken,
				};
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const listInvites = Effect.gen(function* () {
			const sql = yield* database.sql;
			const now = yield* Clock.currentTimeMillis;

			const rows =
				yield* sql`SELECT id, role, note, created_by, created_at, expires_at FROM prosody_invites WHERE used_at IS NULL AND expires_at > ${now} ORDER BY created_at DESC`.pipe(
					Effect.flatMap(rowsOf(InviteRow))
				);

			return rows.map(inviteOf);
		}).pipe(
			Effect.catchTag("SqlError", unavailable),
			Effect.withSpan("AuthStore.listInvites")
		);

		const findValidInvite = Effect.fn("AuthStore.findValidInvite")(
			function* (rawToken: string) {
				const sql = yield* database.sql;
				const now = yield* Clock.currentTimeMillis;

				const rows =
					yield* sql`SELECT id, role, note, created_by, created_at, expires_at FROM prosody_invites WHERE token_hash = ${sha256Hex(rawToken)} AND used_at IS NULL AND expires_at > ${now}`.pipe(
						Effect.flatMap(rowsOf(InviteRow))
					);

				return Option.map(Option.fromUndefinedOr(rows[0]), inviteOf);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const deleteInvite = Effect.fn("AuthStore.deleteInvite")(
			function* (id: string) {
				const sql = yield* database.sql;

				const rows =
					yield* sql`DELETE FROM prosody_invites WHERE id = ${id} AND used_at IS NULL RETURNING id`.pipe(
						Effect.flatMap(rowsOf(IdRow))
					);

				return rows.length > 0;
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const registerWithInvite = Effect.fn("AuthStore.registerWithInvite")(
			function* (registration: Registration) {
				const sql = yield* database.sql;

				return yield* sql.withTransaction(
					Effect.gen(function* () {
						yield* lockUsers(sql);

						const now = yield* Clock.currentTimeMillis;

						const invites =
							yield* sql`SELECT id, role, note, created_by, created_at, expires_at FROM prosody_invites WHERE token_hash = ${sha256Hex(registration.inviteToken)} AND used_at IS NULL AND expires_at > ${now} FOR UPDATE`.pipe(
								Effect.flatMap(rowsOf(InviteRow))
							);

						const [invite] = invites;

						if (invite === undefined) {
							return yield* new InvalidInvite();
						}

						if (yield* usernameTaken(sql, registration.username)) {
							return yield* new UsernameTaken({
								username: registration.username,
							});
						}

						const user = yield* insertUser(sql, {
							username: registration.username,
							displayName: registration.displayName,
							role: invite.role,
							passwordHash: registration.passwordHash,
							oidcIssuer: null,
							oidcSubject: null,
						});

						yield* sql`UPDATE prosody_invites SET used_by = ${user.id}, used_at = ${now} WHERE id = ${invite.id}`;

						return user;
					})
				);
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const saveOidcState = Effect.fn("AuthStore.saveOidcState")(
			function* (record: OidcState) {
				const sql = yield* database.sql;
				const now = yield* Clock.currentTimeMillis;

				yield* sql`DELETE FROM prosody_oidc_states WHERE expires_at <= ${now}`;
				yield* sql`INSERT INTO prosody_oidc_states (state, code_verifier, nonce, redirect_to, expires_at) VALUES (${record.state}, ${record.codeVerifier}, ${record.nonce}, ${record.redirectTo}, ${record.expiresAt})`;
			},
			Effect.catchTag("SqlError", unavailable)
		);

		const consumeOidcState = Effect.fn("AuthStore.consumeOidcState")(
			function* (state: string) {
				const sql = yield* database.sql;
				const now = yield* Clock.currentTimeMillis;

				const rows =
					yield* sql`DELETE FROM prosody_oidc_states WHERE state = ${state} AND expires_at > ${now} RETURNING state, code_verifier, nonce, redirect_to, expires_at`.pipe(
						Effect.flatMap(rowsOf(StateRow))
					);

				return Option.map(Option.fromUndefinedOr(rows[0]), (row) => ({
					state: row.state,
					codeVerifier: row.code_verifier,
					nonce: row.nonce,
					redirectTo: row.redirect_to,
					expiresAt: row.expires_at,
				}));
			},
			Effect.catchTag("SqlError", unavailable)
		);

		return {
			userCount,
			createFirstAdmin,
			findUserByUsername,
			findUserById,
			upsertOidcUser,
			listUsers,
			updateUserRole,
			deleteUser,
			createSession,
			authenticateSession,
			listSessions,
			renameSession,
			deleteSession,
			deleteSessionByToken,
			createInvite,
			listInvites,
			findValidInvite,
			deleteInvite,
			registerWithInvite,
			saveOidcState,
			consumeOidcState,
		};
	}),
}) {
	static readonly layer = Layer.effect(this, this.make);
}
