import type { Role } from "@prosody/domain/Reader.id";
import { Duration, Effect, Option, Predicate, Schema } from "effect";
import type { Cause } from "effect";
import type { HttpBody, HttpClientError } from "effect/http";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { AuthSession, AuthUser, Invite, SingleSignOn } from "./Model.ts";
import type { Me } from "./Model.ts";

export class AuthRefused extends Schema.TaggedError<AuthRefused>()(
	"AuthRefused",
	{ status: Schema.Int, reason: Schema.String }
) {}

export const READER_STORE = "prosody:reader";

export const ANSWER_WITHIN = Duration.seconds(5);

const UNREACHABLE = "Can't reach Prosody. Check your connection and try again.";

const Refusal = Schema.Struct({ error: Schema.String });

const MeWire = Schema.Struct({
	user: Schema.NullOr(AuthUser),
	session: Schema.NullOr(AuthSession),
	setupRequired: Schema.Boolean,
	localAuth: Schema.Boolean,
	oidc: Schema.NullOr(SingleSignOn),
});

const SignedInWire = Schema.Struct({ user: AuthUser });

const SessionsWire = Schema.Struct({ sessions: Schema.Array(AuthSession) });

const SessionWire = Schema.Struct({ session: AuthSession });

const InvitesWire = Schema.Struct({ invites: Schema.Array(Invite) });

const CreatedWire = Schema.Struct({ invite: Invite, path: Schema.String });

const InviteCheckWire = Schema.Struct({
	invite: Schema.Struct({
		role: Schema.Literals(["admin", "reader"]),
		expiresAt: Schema.Finite,
	}),
	localAuth: Schema.Boolean,
});

const UsersWire = Schema.Struct({ users: Schema.Array(AuthUser) });

const UserWire = Schema.Struct({ user: AuthUser });

const isOk = (response: HttpClientResponse.HttpClientResponse): boolean =>
	response.status >= 200 && response.status < 300;

const refused = (response: HttpClientResponse.HttpClientResponse) =>
	HttpClientResponse.schemaBodyJson(Refusal)(response).pipe(
		Effect.map(({ error }) => error),
		Effect.orElseSucceed(() => `Prosody answered ${response.status}`),
		Effect.flatMap((reason) =>
			Effect.fail(new AuthRefused({ status: response.status, reason }))
		)
	);

const execute = (request: HttpClientRequest.HttpClientRequest) =>
	Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(request));

const withJson = (
	request: HttpClientRequest.HttpClientRequest,
	body: Schema.Json
) => Effect.flatMap(HttpClientRequest.bodyJson(request, body), execute);

const accepted = (
	response: HttpClientResponse.HttpClientResponse
): Effect.Effect<HttpClientResponse.HttpClientResponse, AuthRefused> =>
	isOk(response) ? Effect.succeed(response) : refused(response);

const answer =
	<S extends Schema.Constraint>(schema: S) =>
	(response: HttpClientResponse.HttpClientResponse) =>
		Effect.flatMap(
			accepted(response),
			HttpClientResponse.schemaBodyJson(schema)
		);

const nothing = (response: HttpClientResponse.HttpClientResponse) =>
	Effect.asVoid(accepted(response));

const segment = (value: string): string => encodeURIComponent(value);

export type AuthFailure =
	| AuthRefused
	| Cause.TimeoutError
	| HttpClientError.HttpClientError
	| HttpBody.HttpBodyError
	| Schema.SchemaError;

export const reasonOf = (error: AuthFailure): string =>
	Predicate.isTagged(error, "AuthRefused") ? error.reason : UNREACHABLE;

export const fetchMe = execute(HttpClientRequest.get("/auth/me")).pipe(
	Effect.flatMap(answer(MeWire)),
	Effect.timeout(ANSWER_WITHIN),
	Effect.map((wire): Me => ({
		user: Option.fromNullishOr(wire.user),
		session: Option.fromNullishOr(wire.session),
		setupRequired: wire.setupRequired,
		localAuth: wire.localAuth,
		oidc: Option.fromNullishOr(wire.oidc),
	}))
);

export interface Credentials {
	readonly username: string;
	readonly password: string;
}

export interface NewAccount extends Credentials {
	readonly displayName: string;
}

export const submitSetup = (account: NewAccount) =>
	withJson(HttpClientRequest.post("/auth/setup"), { ...account }).pipe(
		Effect.flatMap(answer(SignedInWire)),
		Effect.map(({ user }) => user)
	);

export const submitLogin = (credentials: Credentials) =>
	withJson(HttpClientRequest.post("/auth/login"), { ...credentials }).pipe(
		Effect.flatMap(answer(SignedInWire)),
		Effect.map(({ user }) => user)
	);

export const submitRegister = (token: string, account: NewAccount) =>
	withJson(HttpClientRequest.post("/auth/register"), {
		token,
		...account,
	}).pipe(
		Effect.flatMap(answer(SignedInWire)),
		Effect.map(({ user }) => user)
	);

export const submitLogout = execute(
	HttpClientRequest.post("/auth/logout")
).pipe(Effect.flatMap(nothing));

export const fetchSessions = execute(
	HttpClientRequest.get("/auth/sessions")
).pipe(
	Effect.flatMap(answer(SessionsWire)),
	Effect.map(({ sessions }) => sessions)
);

export const renameCurrentSession = (deviceName: string) =>
	withJson(HttpClientRequest.patch("/auth/session"), { deviceName }).pipe(
		Effect.flatMap(answer(SessionWire)),
		Effect.map(({ session }) => session)
	);

export const revokeSessionById = (id: string) =>
	execute(HttpClientRequest.delete(`/auth/sessions/${segment(id)}`)).pipe(
		Effect.flatMap(nothing)
	);

export const fetchInvites = execute(
	HttpClientRequest.get("/auth/invites")
).pipe(
	Effect.flatMap(answer(InvitesWire)),
	Effect.map(({ invites }) => invites)
);

export const createInvite = (role: Role, note: string) =>
	withJson(HttpClientRequest.post("/auth/invites"), { role, note }).pipe(
		Effect.flatMap(answer(CreatedWire))
	);

export const revokeInviteById = (id: string) =>
	execute(HttpClientRequest.delete(`/auth/invites/${segment(id)}`)).pipe(
		Effect.flatMap(nothing)
	);

export const checkInviteToken = (token: string) =>
	execute(HttpClientRequest.get(`/auth/invites/${segment(token)}`)).pipe(
		Effect.flatMap(answer(InviteCheckWire))
	);

export const fetchUsers = execute(HttpClientRequest.get("/auth/users")).pipe(
	Effect.flatMap(answer(UsersWire)),
	Effect.map(({ users }) => users)
);

export const updateUserRole = (id: string, role: Role) =>
	withJson(HttpClientRequest.patch(`/auth/users/${segment(id)}`), {
		role,
	}).pipe(
		Effect.flatMap(answer(UserWire)),
		Effect.map(({ user }) => user)
	);

export const deleteUserById = (id: string) =>
	execute(HttpClientRequest.delete(`/auth/users/${segment(id)}`)).pipe(
		Effect.flatMap(nothing)
	);

const ReaderJson = Schema.fromJsonString(AuthUser);

export const savedReader = Effect.sync(() =>
	Schema.decodeOption(ReaderJson)(localStorage.getItem(READER_STORE) ?? "")
);

export const saveReader = (user: AuthUser) =>
	Effect.sync(() => {
		const json = Schema.encodeOption(ReaderJson)(user);

		if (Option.isSome(json)) {
			localStorage.setItem(READER_STORE, json.value);
		}
	});

export const forgetReader = Effect.sync(() => {
	localStorage.removeItem(READER_STORE);
});
