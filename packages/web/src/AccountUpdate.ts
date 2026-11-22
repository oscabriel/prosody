import { Role } from "@prosody/domain/Reader.id";
import { Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { load } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";

import {
	createInvite,
	deleteUserById,
	fetchInvites,
	fetchSessions,
	fetchUsers,
	forgetReader,
	reasonOf,
	renameCurrentSession,
	revokeInviteById,
	revokeSessionById,
	updateUserRole,
} from "./AuthApi.ts";
import type { AuthFailure } from "./AuthApi.ts";
import { AuthState, Message } from "./Model.ts";
import type { Account, AccountMessage, AuthSession, Model } from "./Model.ts";
import { loginRouter } from "./Route.ts";
import type { Return } from "./Steps.ts";
import { showToast } from "./Ui.ts";

const failed = (error: AuthFailure) =>
	Effect.succeed(Message.FailedAccount({ reason: reasonOf(error) }));

export const leaveSignedOut = forgetReader.pipe(
	Effect.andThen(load(loginRouter())),
	Effect.as(Message.CompletedNavigate())
);

const afterRevoking = (
	id: string,
	isCurrent: boolean
): Effect.Effect<
	typeof Message.CompletedNavigate.Type | typeof Message.RevokedSession.Type
> =>
	isCurrent ? leaveSignedOut : Effect.succeed(Message.RevokedSession({ id }));

export const FetchSessions = Command.define("FetchSessions", {
	messages: [Message.ReceivedSessions, Message.FailedAccount],
	execute: fetchSessions.pipe(
		Effect.map((sessions) => Message.ReceivedSessions({ sessions })),
		Effect.catch(failed)
	),
});

export const FetchInvites = Command.define("FetchInvites", {
	messages: [Message.ReceivedInvites, Message.FailedAccount],
	execute: fetchInvites.pipe(
		Effect.map((invites) => Message.ReceivedInvites({ invites })),
		Effect.catch(failed)
	),
});

export const FetchUsers = Command.define("FetchUsers", {
	messages: [Message.ReceivedUsers, Message.FailedAccount],
	execute: fetchUsers.pipe(
		Effect.map((users) => Message.ReceivedUsers({ users })),
		Effect.catch(failed)
	),
});

const RenameSession = Command.define("RenameSession", {
	args: { deviceName: Schema.String },
	messages: [Message.RenamedDevice, Message.FailedAccount],
	execute: ({ deviceName }) =>
		renameCurrentSession(deviceName).pipe(
			Effect.map((session) => Message.RenamedDevice({ session })),
			Effect.catch(failed)
		),
});

const RevokeSession = Command.define("RevokeSession", {
	args: { id: Schema.String, isCurrent: Schema.Boolean },
	messages: [
		Message.RevokedSession,
		Message.CompletedNavigate,
		Message.FailedAccount,
	],
	execute: ({ id, isCurrent }) =>
		revokeSessionById(id).pipe(
			Effect.andThen(afterRevoking(id, isCurrent)),
			Effect.catch(failed)
		),
});

const CreateInvite = Command.define("CreateInvite", {
	args: { role: Role, note: Schema.String },
	messages: [Message.CreatedInvite, Message.FailedAccount],
	execute: ({ role, note }) =>
		createInvite(role, note).pipe(
			Effect.map(({ invite, path }) =>
				Message.CreatedInvite({ invite, url: `${location.origin}${path}` })
			),
			Effect.catch(failed)
		),
});

const RevokeInvite = Command.define("RevokeInvite", {
	args: { id: Schema.String },
	messages: [Message.RevokedInvite, Message.FailedAccount],
	execute: ({ id }) =>
		revokeInviteById(id).pipe(
			Effect.as(Message.RevokedInvite({ id })),
			Effect.catch(failed)
		),
});

const ChangeRole = Command.define("ChangeRole", {
	args: { id: Schema.String, role: Role },
	messages: [Message.ChangedRole, Message.FailedAccount],
	execute: ({ id, role }) =>
		updateUserRole(id, role).pipe(
			Effect.map((user) => Message.ChangedRole({ user })),
			Effect.catch(failed)
		),
});

const RemoveReader = Command.define("RemoveReader", {
	args: { id: Schema.String },
	messages: [Message.RemovedReader, Message.FailedAccount],
	execute: ({ id }) =>
		deleteUserById(id).pipe(
			Effect.as(Message.RemovedReader({ id })),
			Effect.catch(failed)
		),
});

const CopyInvite = Command.define("CopyInvite", {
	args: { url: Schema.String },
	messages: [Message.CopiedInvite],
	execute: ({ url }) =>
		Effect.tryPromise({
			try: async () => {
				await navigator.clipboard.writeText(url);
			},
			catch: () => "not copied",
		}).pipe(
			Effect.as(Message.CopiedInvite({ isCopied: true })),
			Effect.orElseSucceed(() => Message.CopiedInvite({ isCopied: false }))
		),
});

const changeAccount = (
	model: Model,
	change: (account: Account) => Account
): Model => modifyFields(model, { account: change });

const currentSessionOf = (model: Model): Option.Option<AuthSession> =>
	Option.orElse(
		Option.flatMap(model.account.sessions, (sessions) =>
			Option.fromUndefinedOr(sessions.find((session) => session.current))
		),
		() =>
			AuthState.guards.SignedIn(model.auth) ? model.auth.session : Option.none()
	);

export const deviceNameIn = (model: Model): string =>
	Option.getOrElse(model.account.deviceName, () =>
		Option.match(currentSessionOf(model), {
			onNone: () => "",
			onSome: (session) => session.deviceName,
		})
	);

export const revokeSession = (model: Model, id: string): Return => ({
	model,
	commands: [
		RevokeSession({
			id,
			isCurrent: Option.exists(
				currentSessionOf(model),
				(session) => session.id === id
			),
		}),
	],
});

export const revokeInvite = (model: Model, id: string): Return => ({
	model,
	commands: [RevokeInvite({ id })],
});

export const removeReader = (model: Model, id: string): Return => ({
	model,
	commands: [RemoveReader({ id })],
});

const renamed = (model: Model, session: AuthSession): Model =>
	modifyFields(model, {
		auth: (auth) =>
			AuthState.guards.SignedIn(auth)
				? AuthState.SignedIn({ user: auth.user, session: Option.some(session) })
				: auth,
		account: (account) => ({
			...account,
			deviceName: Option.none(),
			problem: Option.none(),
			sessions: Option.map(account.sessions, (sessions) =>
				sessions.map((other) =>
					other.id === session.id ? { ...other, ...session } : other
				)
			),
		}),
	});

const offline = (model: Model): Return => ({
	model: changeAccount(model, (account) => ({
		...account,
		problem: Option.some("Can't reach Prosody while offline."),
	})),
});

const online = (model: Model, act: () => Return): Return =>
	model.isOnline ? act() : offline(model);

export const updateAccount = (model: Model, message: AccountMessage): Return =>
	Match.value(message).pipe(
		Match.tagsExhaustive({
			ReceivedSessions: ({ sessions }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					sessions: Option.some(sessions),
				})),
			}),
			ReceivedInvites: ({ invites }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					invites: Option.some(invites),
				})),
			}),
			ReceivedUsers: ({ users }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					users: Option.some(users),
				})),
			}),
			FailedAccount: ({ reason }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					isCreating: false,
					problem: Option.some(reason),
				})),
			}),
			ChangedDeviceName: ({ value }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					deviceName: Option.some(value),
					problem: Option.none(),
				})),
			}),
			SubmittedDeviceName: (): Return => {
				const deviceName = deviceNameIn(model).trim();

				if (deviceName === "") {
					return {
						model: changeAccount(model, (account) => ({
							...account,
							problem: Option.some("A device needs a name."),
						})),
					};
				}

				return online(model, () => ({
					model,
					commands: [RenameSession({ deviceName })],
				}));
			},
			RenamedDevice: ({ session }): Return => ({
				model: showToast(renamed(model, session), "Device renamed"),
			}),
			SelectedInviteRole: ({ role }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					inviteRole: role,
				})),
			}),
			ChangedInviteNote: ({ value }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					inviteNote: value,
				})),
			}),
			SubmittedInvite: (): Return =>
				model.account.isCreating
					? { model }
					: online(model, () => ({
							model: changeAccount(model, (account) => ({
								...account,
								isCreating: true,
								created: Option.none(),
								problem: Option.none(),
							})),
							commands: [
								CreateInvite({
									role: model.account.inviteRole,
									note: model.account.inviteNote.trim(),
								}),
							],
						})),
			CreatedInvite: ({ invite, url }): Return => ({
				model: changeAccount(model, (account) => ({
					...account,
					isCreating: false,
					inviteNote: "",
					created: Option.some(url),
					invites: Option.some([
						invite,
						...Option.getOrElse(account.invites, () => []),
					]),
				})),
			}),
			ClickedCopyInvite: ({ url }): Return => ({
				model,
				commands: [CopyInvite({ url })],
			}),
			CopiedInvite: ({ isCopied }): Return => ({
				model: showToast(
					model,
					isCopied
						? "Invite link copied"
						: "Could not copy the link. Select it and copy it by hand."
				),
			}),
			ClickedChangeRole: ({ id, role }): Return =>
				online(model, () => ({ model, commands: [ChangeRole({ id, role })] })),
			ChangedRole: ({ user }): Return => ({
				model: showToast(
					changeAccount(model, (account) => ({
						...account,
						users: Option.map(account.users, (users) =>
							users.map((other) => (other.id === user.id ? user : other))
						),
					})),
					user.role === "admin"
						? `${user.displayName} is now an admin`
						: `${user.displayName} is now a reader`
				),
			}),
			RevokedSession: ({ id }): Return => ({
				model: showToast(
					changeAccount(model, (account) => ({
						...account,
						sessions: Option.map(account.sessions, (sessions) =>
							sessions.filter((session) => session.id !== id)
						),
					})),
					"Signed out of that device"
				),
			}),
			RevokedInvite: ({ id }): Return => ({
				model: showToast(
					changeAccount(model, (account) => ({
						...account,
						invites: Option.map(account.invites, (invites) =>
							invites.filter((invite) => invite.id !== id)
						),
					})),
					"Invite revoked"
				),
			}),
			RemovedReader: ({ id }): Return => ({
				model: showToast(
					changeAccount(model, (account) => ({
						...account,
						users: Option.map(account.users, (users) =>
							users.filter((user) => user.id !== id)
						),
					})),
					"Reader removed"
				),
			}),
		})
	);
