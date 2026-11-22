import { ReaderId } from "@prosody/domain/Reader.id";
import type { Role } from "@prosody/domain/Reader.id";
import { Clock, Effect, Layer, Option } from "effect";

import type {
	OidcState,
	PublicInvite,
	PublicUser,
	SessionInfo,
} from "../src/AuthStore.ts";
import {
	AuthStore,
	INVITE_LIFETIME,
	InvalidInvite,
	LastAdmin,
	NotFound,
	roleFromGroups,
	sanitizeUsername,
	SESSION_LIFETIME,
	SetupAlreadyDone,
	shouldSlide,
	TOUCH_AFTER,
	usernameCandidate,
	UsernameTaken,
} from "../src/AuthStore.ts";
import { sha256Hex } from "../src/Crypto.ts";

interface FakeUser extends PublicUser {
	readonly passwordHash: string | null;
	readonly oidc: string | null;
}

interface FakeSession extends SessionInfo {
	readonly tokenHash: string;
}

interface FakeInvite extends PublicInvite {
	readonly tokenHash: string;
	readonly usedAt: number | null;
}

const hex = (count: number) => count.toString(16).padStart(12, "0");

const makeFake = () => {
	const users = new Map<string, FakeUser>();
	const sessions = new Map<string, FakeSession>();
	const invites = new Map<string, FakeInvite>();
	const states = new Map<string, OidcState>();
	let made = 0;

	const mint = () => {
		made += 1;

		return hex(made);
	};

	const publicOf = (user: FakeUser): PublicUser => ({
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		role: user.role,
		createdAt: user.createdAt,
	});

	const sessionOf = (session: FakeSession): SessionInfo => ({
		id: session.id,
		userId: session.userId,
		device: session.device,
		createdAt: session.createdAt,
		lastSeenAt: session.lastSeenAt,
		expiresAt: session.expiresAt,
	});

	const inviteOf = (invite: FakeInvite): PublicInvite => ({
		id: invite.id,
		role: invite.role,
		note: invite.note,
		createdBy: invite.createdBy,
		createdAt: invite.createdAt,
		expiresAt: invite.expiresAt,
	});

	const admins = () =>
		[...users.values()].filter((user) => user.role === "admin").length;

	const byUsername = (username: string) =>
		[...users.values()].find((user) => user.username === username);

	const insert = (
		user: Omit<FakeUser, "id" | "createdAt">,
		now: number
	): PublicUser => {
		const stored = {
			...user,
			id: ReaderId.make(`u-${mint()}`),
			createdAt: now,
		};

		users.set(stored.id, stored);

		return publicOf(stored);
	};

	const freeUsername = (hint: string) => {
		const base = sanitizeUsername(hint);

		for (let attempt = 1; ; attempt += 1) {
			const candidate = usernameCandidate(base, attempt);

			if (byUsername(candidate) === undefined) {
				return candidate;
			}
		}
	};

	const validInvite = (rawToken: string, now: number) =>
		[...invites.values()].find(
			(invite) =>
				invite.tokenHash === sha256Hex(rawToken) &&
				invite.usedAt === null &&
				invite.expiresAt > now
		);

	return AuthStore.of({
		userCount: Effect.sync(() => users.size),
		createFirstAdmin: (user) =>
			Effect.gen(function* () {
				if (users.size > 0) {
					return yield* new SetupAlreadyDone();
				}

				return insert(
					{
						username: user.username,
						displayName: user.displayName,
						role: "admin",
						passwordHash: user.passwordHash,
						oidc: null,
					},
					yield* Clock.currentTimeMillis
				);
			}),
		findUserByUsername: (username) =>
			Effect.sync(() =>
				Option.map(Option.fromUndefinedOr(byUsername(username)), (user) => ({
					...publicOf(user),
					passwordHash: Option.fromNullOr(user.passwordHash),
				}))
			),
		findUserById: (id) =>
			Effect.sync(() =>
				Option.map(Option.fromUndefinedOr(users.get(id)), publicOf)
			),
		upsertOidcUser: (user) =>
			Effect.gen(function* () {
				const key = `${user.issuer} ${user.subject}`;

				const existing = [...users.values()].find(
					(found) => found.oidc === key
				);

				if (existing !== undefined) {
					const wanted = Option.match(user.groups, {
						onNone: () => existing.role,
						onSome: (groups) => roleFromGroups(groups, user.adminGroup),
					});

					const role: Role =
						wanted === "reader" && existing.role === "admin" && admins() <= 1
							? "admin"
							: wanted;

					const updated = { ...existing, role, displayName: user.displayName };

					users.set(existing.id, updated);

					return publicOf(updated);
				}

				const first = users.size === 0;

				const role = Option.match(user.groups, {
					onNone: (): Role => (first ? "admin" : "reader"),
					onSome: (groups): Role =>
						first ? "admin" : roleFromGroups(groups, user.adminGroup),
				});

				return insert(
					{
						username: freeUsername(user.usernameHint),
						displayName: user.displayName,
						role,
						passwordHash: null,
						oidc: key,
					},
					yield* Clock.currentTimeMillis
				);
			}),
		listUsers: Effect.sync(() =>
			[...users.values()]
				.toSorted((a, b) => a.createdAt - b.createdAt)
				.map(publicOf)
		),
		updateUserRole: (id, role) =>
			Effect.gen(function* () {
				const found = users.get(id);

				if (found === undefined) {
					return yield* new NotFound();
				}

				if (found.role === "admin" && role === "reader" && admins() <= 1) {
					return yield* new LastAdmin();
				}

				const updated = { ...found, role };

				users.set(id, updated);

				return publicOf(updated);
			}),
		deleteUser: (id) =>
			Effect.gen(function* () {
				const found = users.get(id);

				if (found === undefined) {
					return yield* new NotFound();
				}

				if (found.role === "admin" && admins() <= 1) {
					return yield* new LastAdmin();
				}

				users.delete(id);

				for (const [key, session] of sessions) {
					if (session.userId === id) {
						sessions.delete(key);
					}
				}

				return yield* Effect.void;
			}),
		createSession: ({ userId, deviceName }) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const rawToken = `token-${mint()}`;

				const session: FakeSession = {
					id: `s-${mint()}`,
					userId,
					device: deviceName,
					createdAt: now,
					lastSeenAt: now,
					expiresAt: now + SESSION_LIFETIME,
					tokenHash: sha256Hex(rawToken),
				};

				sessions.set(session.id, session);

				return { session: sessionOf(session), rawToken };
			}),
		authenticateSession: (rawToken) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;

				const session = [...sessions.values()].find(
					(found) =>
						found.tokenHash === sha256Hex(rawToken) && found.expiresAt > now
				);

				const user =
					session === undefined ? undefined : users.get(session.userId);

				if (session === undefined || user === undefined) {
					return Option.none();
				}

				const slid = shouldSlide(session.expiresAt, now);

				const touched =
					slid || now - session.lastSeenAt > TOUCH_AFTER
						? {
								...session,
								lastSeenAt: now,
								expiresAt: slid ? now + SESSION_LIFETIME : session.expiresAt,
							}
						: session;

				sessions.set(session.id, touched);

				return Option.some({
					user: publicOf(user),
					session: sessionOf(touched),
				});
			}),
		listSessions: (userId) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;

				return [...sessions.values()]
					.filter(
						(session) => session.userId === userId && session.expiresAt > now
					)
					.toSorted((a, b) => b.lastSeenAt - a.lastSeenAt)
					.map(sessionOf);
			}),
		renameSession: (userId, sessionId, deviceName) =>
			Effect.sync(() => {
				const found = sessions.get(sessionId);

				if (found === undefined || found.userId !== userId) {
					return false;
				}

				sessions.set(sessionId, { ...found, device: deviceName });

				return true;
			}),
		deleteSession: (userId, sessionId) =>
			Effect.sync(() => {
				const found = sessions.get(sessionId);

				return (
					found !== undefined &&
					found.userId === userId &&
					sessions.delete(sessionId)
				);
			}),
		deleteSessionByToken: (rawToken) =>
			Effect.sync(() => {
				for (const [key, session] of sessions) {
					if (session.tokenHash === sha256Hex(rawToken)) {
						sessions.delete(key);
					}
				}
			}),
		createInvite: ({ createdBy, role, note }) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const rawToken = `invite-${mint()}`;

				const invite: FakeInvite = {
					id: `inv-${mint()}`,
					role,
					note,
					createdBy,
					createdAt: now,
					expiresAt: now + INVITE_LIFETIME,
					tokenHash: sha256Hex(rawToken),
					usedAt: null,
				};

				invites.set(invite.id, invite);

				return { invite: inviteOf(invite), rawToken };
			}),
		listInvites: Effect.gen(function* () {
			const now = yield* Clock.currentTimeMillis;

			return [...invites.values()]
				.filter((invite) => invite.usedAt === null && invite.expiresAt > now)
				.toSorted((a, b) => b.createdAt - a.createdAt)
				.map(inviteOf);
		}),
		findValidInvite: (rawToken) =>
			Effect.map(Clock.currentTimeMillis, (now) =>
				Option.map(Option.fromUndefinedOr(validInvite(rawToken, now)), inviteOf)
			),
		deleteInvite: (id) =>
			Effect.sync(() => invites.get(id)?.usedAt === null && invites.delete(id)),
		registerWithInvite: (registration) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const invite = validInvite(registration.inviteToken, now);

				if (invite === undefined) {
					return yield* new InvalidInvite();
				}

				if (byUsername(registration.username) !== undefined) {
					return yield* new UsernameTaken({ username: registration.username });
				}

				const user = insert(
					{
						username: registration.username,
						displayName: registration.displayName,
						role: invite.role,
						passwordHash: registration.passwordHash,
						oidc: null,
					},
					now
				);

				invites.set(invite.id, { ...invite, usedAt: now });

				return user;
			}),
		saveOidcState: (record) =>
			Effect.sync(() => {
				states.set(record.state, record);
			}),
		consumeOidcState: (state) =>
			Effect.gen(function* () {
				const now = yield* Clock.currentTimeMillis;
				const found = states.get(state);

				states.delete(state);

				return Option.filter(
					Option.fromUndefinedOr(found),
					(record) => record.expiresAt > now
				);
			}),
	});
};

export const FakeAuthStore = Layer.sync(AuthStore, makeFake);
