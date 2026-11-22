import { Effect, Match, Option, Schema } from "effect";
import { Command } from "foldkit";
import { load, replaceUrl } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";

import {
	FetchInvites,
	FetchSessions,
	FetchUsers,
	leaveSignedOut,
} from "./AccountUpdate.ts";
import {
	checkInviteToken,
	fetchMe,
	forgetReader,
	reasonOf,
	saveReader,
	submitLogin,
	submitLogout,
	submitRegister,
	submitSetup,
} from "./AuthApi.ts";
import type { AuthFailure } from "./AuthApi.ts";
import { lostConnection } from "./Connection.ts";
import {
	AuthState,
	AuthUser,
	EMPTY_AUTH_FORM,
	InviteCheck,
	Message,
} from "./Model.ts";
import type { AuthForm, AuthMessage, Me, Model } from "./Model.ts";
import { LoadPlaces, sendWaiting } from "./Places.ts";
import { isAdmin, readerIn } from "./Readers.ts";
import { reopen } from "./Rooms.ts";
import {
	AppRoute,
	loginPathFor,
	loginRouter,
	pathOf,
	setupRouter,
	shelfRouter,
} from "./Route.ts";
import { andThen } from "./Steps.ts";
import type { Return } from "./Steps.ts";
import { showToast } from "./Ui.ts";

export const MIN_PASSWORD = 8;

const failedMe = (error: AuthFailure) =>
	Effect.succeed(Message.FailedMe({ reason: reasonOf(error) }));

const failedForm = (error: AuthFailure) =>
	Effect.succeed(Message.FailedAuthForm({ reason: reasonOf(error) }));

const failedSignOut = (error: AuthFailure) =>
	Effect.succeed(Message.FailedSignOut({ reason: reasonOf(error) }));

const failedInvite = (token: string) => (error: AuthFailure) =>
	Effect.succeed(Message.FailedInvite({ token, reason: reasonOf(error) }));

export const FetchMe = Command.define("FetchMe", {
	messages: [Message.ReceivedMe, Message.FailedMe],
	execute: fetchMe.pipe(
		Effect.map((me) => Message.ReceivedMe({ me })),
		Effect.catch(failedMe)
	),
});

const SaveReader = Command.define("SaveReader", {
	args: { user: AuthUser },
	messages: [Message.SavedReader],
	execute: ({ user }) =>
		saveReader(user).pipe(Effect.as(Message.SavedReader())),
});

const ForgetReader = Command.define("ForgetReader", {
	messages: [Message.SavedReader],
	execute: forgetReader.pipe(Effect.as(Message.SavedReader())),
});

const Reload = Command.define("Reload", {
	args: { user: AuthUser, href: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ user, href }) =>
		saveReader(user).pipe(
			Effect.andThen(load(href)),
			Effect.as(Message.CompletedNavigate())
		),
});

const Redirect = Command.define("Redirect", {
	args: { url: Schema.String },
	messages: [Message.CompletedNavigate],
	execute: ({ url }) =>
		replaceUrl(url).pipe(Effect.as(Message.CompletedNavigate())),
});

const signedInThen = <R>(
	attempt: Effect.Effect<unknown, AuthFailure, R>,
	target: string
) =>
	attempt.pipe(
		Effect.andThen(load(target)),
		Effect.as(Message.CompletedNavigate()),
		Effect.catch(failedForm)
	);

const SignIn = Command.define("SignIn", {
	args: {
		username: Schema.String,
		password: Schema.String,
		redirect: Schema.String,
	},
	messages: [Message.CompletedNavigate, Message.FailedAuthForm],
	execute: ({ username, password, redirect }) =>
		signedInThen(submitLogin({ username, password }), redirect),
});

const SetUp = Command.define("SetUp", {
	args: {
		displayName: Schema.String,
		username: Schema.String,
		password: Schema.String,
	},
	messages: [Message.CompletedNavigate, Message.FailedAuthForm],
	execute: (account) => signedInThen(submitSetup(account), shelfRouter()),
});

const Register = Command.define("Register", {
	args: {
		token: Schema.String,
		displayName: Schema.String,
		username: Schema.String,
		password: Schema.String,
	},
	messages: [Message.CompletedNavigate, Message.FailedAuthForm],
	execute: ({ token, ...account }) =>
		signedInThen(submitRegister(token, account), shelfRouter()),
});

const SignOut = Command.define("SignOut", {
	messages: [Message.CompletedNavigate, Message.FailedSignOut],
	execute: submitLogout.pipe(
		Effect.andThen(leaveSignedOut),
		Effect.catch(failedSignOut)
	),
});

const CheckInvite = Command.define("CheckInvite", {
	args: { token: Schema.String },
	messages: [Message.CheckedInvite, Message.FailedInvite],
	execute: ({ token }) =>
		checkInviteToken(token).pipe(
			Effect.map(({ invite, localAuth }) =>
				Message.CheckedInvite({
					token,
					role: invite.role,
					expiresAt: invite.expiresAt,
					localAuth,
				})
			),
			Effect.catch(failedInvite(token))
		),
});

const needsSignIn = (model: Model): boolean =>
	AppRoute.match(model.route, {
		Shelf: () => true,
		Desk: () => true,
		Account: () => true,
		Room: ({ work }) => model.isOnline || model.copies[work] === undefined,
		Login: () => false,
		Setup: () => false,
		Invite: () => false,
		NotFound: () => false,
	});

export const signInRedirect = (model: Model): string =>
	AppRoute.guards.Login(model.route)
		? model.login.redirect
		: pathOf(model.route);

const redirect = (model: Model, url: string): Return => ({
	model,
	commands: [Redirect({ url })],
});

const tokenOf = (invite: InviteCheck): Option.Option<string> =>
	InviteCheck.match(invite, {
		Idle: () => Option.none(),
		Checking: ({ token }) => Option.some(token),
		Valid: ({ token }) => Option.some(token),
		Invalid: ({ token }) => Option.some(token),
	});

const checkInvite = (model: Model, token: string): Return =>
	Option.exists(tokenOf(model.invite), (known) => known === token)
		? { model }
		: {
				model: modifyFields(model, {
					invite: () => InviteCheck.Checking({ token }),
					authForm: () => EMPTY_AUTH_FORM,
				}),
				commands: [CheckInvite({ token })],
			};

const accountFetches = (model: Model) => {
	if (!model.isOnline) {
		return [];
	}

	const adminFetches = isAdmin(model) ? [FetchInvites(), FetchUsers()] : [];

	return [FetchSessions(), ...adminFetches];
};

const refreshAccount = (model: Model): Return => ({
	model,
	commands: accountFetches(model),
});

export const loadAccount = (model: Model): Return => ({
	model: modifyFields(model, {
		account: (account) => ({
			...account,
			deviceName: Option.none(),
			created: Option.none(),
			isCreating: false,
			problem: Option.none(),
		}),
	}),
	commands: accountFetches(model),
});

export const guard = (model: Model): Return =>
	AuthState.match<Return>(model.auth, {
		Checking: () => ({ model }),
		SignedOut: ({ setupRequired }) => {
			const { route } = model;

			if (
				setupRequired &&
				!AppRoute.guards.Setup(route) &&
				!AppRoute.guards.Invite(route)
			) {
				return redirect(model, setupRouter());
			}

			if (!setupRequired && AppRoute.guards.Setup(route)) {
				return redirect(model, loginRouter());
			}

			if (needsSignIn(model)) {
				return redirect(model, loginPathFor(pathOf(route)));
			}

			return AppRoute.guards.Invite(route)
				? checkInvite(model, route.token)
				: { model };
		},
		SignedIn: () =>
			AppRoute.match<Return>(model.route, {
				Login: () => redirect(model, model.login.redirect),
				Setup: () => redirect(model, shelfRouter()),
				Account: () => loadAccount(model),
				Shelf: () => ({ model }),
				Room: () => ({ model }),
				Desk: () => ({ model }),
				Invite: () => ({ model }),
				NotFound: () => ({ model }),
			}),
	});

export const recheck = (model: Model): Return => ({
	model: modifyFields(model, { socketStale: () => true }),
	commands: [FetchMe()],
});

const isSomeoneElse = (model: Model, user: AuthUser): boolean =>
	[readerIn(model), model.placesReader].some((known) =>
		Option.exists(known, (reader) => reader !== user.id)
	);

const reload = (model: Model, user: AuthUser): Return => ({
	model,
	commands: [Reload({ user, href: pathOf(model.route) })],
});

const settleSignedIn = (model: Model, wasSignedIn: boolean): Return =>
	wasSignedIn && AppRoute.guards.Account(model.route)
		? refreshAccount(model)
		: guard(model);

const signedIn = (model: Model, me: Me, user: AuthUser): Return => {
	if (model.socketStale || isSomeoneElse(model, user)) {
		return reload(model, user);
	}

	const wasSignedIn = AuthState.guards.SignedIn(model.auth);

	const next = modifyFields(model, {
		auth: () => AuthState.SignedIn({ user, session: me.session }),
		savedReader: () => Option.some(user),
	});

	const isOwnPlaces = Option.exists(
		next.placesReader,
		(reader) => reader === user.id
	);

	const placesCommands = isOwnPlaces
		? sendWaiting(next)
		: [LoadPlaces({ reader: user.id })];

	const settled = andThen(
		{
			model: next,
			commands: [SaveReader({ user }), ...placesCommands],
		},
		(signed) => settleSignedIn(signed, wasSignedIn)
	);

	return wasSignedIn ? settled : andThen(settled, reopen);
};

const signedOut = (model: Model, me: Me): Return =>
	andThen(
		{
			model: modifyFields(model, {
				auth: () =>
					AuthState.SignedOut({
						setupRequired: me.setupRequired,
						localAuth: me.localAuth,
						oidc: me.oidc,
					}),
				savedReader: () => Option.none(),
				placesReader: () => Option.none(),
				places: () => ({}),
				nightstand: () => Option.none(),
				wanted: () => Option.none(),
			}),
			commands: [ForgetReader()],
		},
		guard
	);

export const receivedMe = (model: Model, me: Me): Return =>
	Option.match(me.user, {
		onNone: () => signedOut(model, me),
		onSome: (user) => signedIn(model, me, user),
	});

const fellBack = (model: Model): Return =>
	AuthState.guards.Checking(model.auth)
		? Option.match(model.savedReader, {
				onNone: () => ({ model }),
				onSome: (user) =>
					guard(
						modifyFields(model, {
							auth: () => AuthState.SignedIn({ user, session: Option.none() }),
						})
					),
			})
		: { model };

const changeForm = (model: Model, change: (form: AuthForm) => AuthForm) =>
	modifyFields(model, { authForm: change });

const refuse = (model: Model, problem: string): Return => ({
	model: changeForm(model, (form) => ({
		...form,
		problem: Option.some(problem),
	})),
});

const submitting = (model: Model): Model =>
	changeForm(model, (form) => ({
		...form,
		isSubmitting: true,
		problem: Option.none(),
	}));

const OFFLINE = "Can't reach Prosody. Check your connection and try again.";

const credentialsOf = (form: AuthForm) => ({
	displayName: form.displayName.trim(),
	username: form.username.trim().toLowerCase(),
	password: form.password,
});

const newAccountProblem = (model: Model): Option.Option<string> => {
	const { username, password } = credentialsOf(model.authForm);

	if (!model.isOnline) {
		return Option.some(OFFLINE);
	}

	if (username === "") {
		return Option.some("Choose a username.");
	}

	return password.length < MIN_PASSWORD
		? Option.some(`A password is at least ${MIN_PASSWORD} characters.`)
		: Option.none();
};

const submitLoginForm = (model: Model): Return => {
	const { username, password } = credentialsOf(model.authForm);

	if (!model.isOnline) {
		return refuse(model, OFFLINE);
	}

	if (username === "" || password === "") {
		return refuse(model, "Give your username and password.");
	}

	return {
		model: submitting(model),
		commands: [SignIn({ username, password, redirect: signInRedirect(model) })],
	};
};

const submitSetupForm = (model: Model): Return =>
	Option.match(newAccountProblem(model), {
		onSome: (problem) => refuse(model, problem),
		onNone: () => ({
			model: submitting(model),
			commands: [SetUp(credentialsOf(model.authForm))],
		}),
	});

const submitRegisterForm = (model: Model): Return => {
	if (!InviteCheck.guards.Valid(model.invite)) {
		return { model };
	}

	const { token } = model.invite;

	return Option.match(newAccountProblem(model), {
		onSome: (problem) => refuse(model, problem),
		onNone: () => ({
			model: submitting(model),
			commands: [Register({ token, ...credentialsOf(model.authForm) })],
		}),
	});
};

const isCurrentInvite = (model: Model, token: string): boolean =>
	Option.exists(tokenOf(model.invite), (known) => known === token);

export const updateAuth = (model: Model, message: AuthMessage): Return =>
	Match.value(message).pipe(
		Match.tagsExhaustive({
			ReceivedMe: ({ me }): Return => receivedMe(model, me),
			FailedMe: (): Return => andThen(lostConnection(model), fellBack),
			LoadedPlaces: ({ reader, places }): Return => {
				const isSignedIn = AuthState.guards.SignedIn(model.auth);

				if (!isSignedIn || model.auth.user.id !== reader) {
					return { model };
				}

				const next = modifyFields(model, {
					places: () => places,
					placesReader: () => Option.some(reader),
				});

				return { model: next, commands: sendWaiting(next) };
			},
			SavedReader: (): Return => ({ model }),
			ChangedAuthField: ({ field, value }): Return => ({
				model: changeForm(model, (form) => ({
					...form,
					[field]: value,
					problem: Option.none(),
				})),
			}),
			SubmittedLogin: (): Return => submitLoginForm(model),
			SubmittedSetup: (): Return => submitSetupForm(model),
			SubmittedRegister: (): Return => submitRegisterForm(model),
			FailedAuthForm: ({ reason }): Return => ({
				model: changeForm(model, (form) => ({
					...form,
					password: "",
					isSubmitting: false,
					problem: Option.some(reason),
				})),
			}),
			CheckedInvite: ({ token, role, expiresAt, localAuth }): Return =>
				isCurrentInvite(model, token)
					? {
							model: modifyFields(model, {
								invite: () =>
									InviteCheck.Valid({ token, role, expiresAt, localAuth }),
							}),
						}
					: { model },
			FailedInvite: ({ token, reason }): Return =>
				isCurrentInvite(model, token)
					? {
							model: modifyFields(model, {
								invite: () => InviteCheck.Invalid({ token, reason }),
							}),
						}
					: { model },
			ClickedSignOut: (): Return =>
				model.isOnline
					? { model, commands: [SignOut()] }
					: {
							model: showToast(
								model,
								"Can't sign out while offline. Try again once Prosody answers."
							),
						},
			FailedSignOut: ({ reason }): Return => ({
				model: showToast(model, `Could not sign out. ${reason}`),
			}),
		})
	);
