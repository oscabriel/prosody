import { Option } from "effect";
import type { Document, Html, HtmlBuilder } from "foldkit/html";

import { MIN_PASSWORD } from "./AuthUpdate.ts";
import { AuthState, InviteCheck, Message } from "./Model.ts";
import type { AuthField, Model, SingleSignOn } from "./Model.ts";
import { userOf } from "./Readers.ts";
import { loginRouter, shelfRouter } from "./Route.ts";
import { badgeView, themeButtonView } from "./Ui.ts";

export interface SignInOptions {
	readonly localAuth: boolean;
	readonly oidc: Option.Option<SingleSignOn>;
}

const optionsOf = (model: Model): SignInOptions =>
	AuthState.guards.SignedOut(model.auth)
		? { localAuth: model.auth.localAuth, oidc: model.auth.oidc }
		: { localAuth: true, oidc: Option.none() };

export const authShellView = (
	model: Model,
	children: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[h.Class("auth-page")],
		[
			h.header(
				[h.Class("auth-header")],
				[
					h.a([h.Class("wordmark"), h.Href(shelfRouter())], ["Prosody"]),
					themeButtonView(model, h),
				]
			),
			h.main([h.Class("auth-main"), h.Id("main")], children),
		]
	);

const cardView = (
	title: string,
	lede: string,
	children: ReadonlyArray<Html>,
	h: HtmlBuilder<Message>
): Html => {
	const ledes = lede === "" ? [] : [h.p([h.Class("auth-lede")], [lede])];

	return h.section(
		[h.Class("auth-card"), h.AriaLabelledBy("auth-title")],
		[
			h.h1([h.Class("auth-title"), h.Id("auth-title")], [title]),
			...ledes,
			...children,
		]
	);
};

const bannerView = (
	text: string,
	tone: "danger" | "warn",
	h: HtmlBuilder<Message>
): Html =>
	h.div(
		[
			h.Class(
				tone === "danger" ? "banner banner-danger" : "banner banner-warn"
			),
			h.Role(tone === "danger" ? "alert" : "status"),
		],
		[h.span([], [text])]
	);

const problemView = (model: Model, h: HtmlBuilder<Message>) =>
	Option.match(model.authForm.problem, {
		onNone: () => [],
		onSome: (problem) => [bannerView(problem, "danger", h)],
	});

const offlineView = (model: Model, h: HtmlBuilder<Message>) =>
	model.isOnline
		? []
		: [
				bannerView(
					"You are offline. Signing in needs Prosody to answer.",
					"warn",
					h
				),
			];

interface FieldSpec {
	readonly field: AuthField;
	readonly label: string;
	readonly type: "text" | "password";
	readonly autocomplete: string;
	readonly hint: string;
	readonly isRequired: boolean;
}

const fieldId = (form: string, field: AuthField): string => `${form}-${field}`;

const fieldView = (
	model: Model,
	form: string,
	spec: FieldSpec,
	h: HtmlBuilder<Message>
): Html => {
	const id = fieldId(form, spec.field);
	const hintId = `${id}-hint`;
	const hasHint = spec.hint !== "";

	const typing =
		spec.field === "username"
			? [h.Autocapitalize("none"), h.Spellcheck(false)]
			: [];

	const described = hasHint ? [h.AriaDescribedBy(hintId)] : [];

	const hints = hasHint
		? [h.p([h.Class("field-hint"), h.Id(hintId)], [spec.hint])]
		: [];

	return h.div(
		[h.Class("field-group")],
		[
			h.label([h.Class("field-label"), h.For(id)], [spec.label]),
			h.input([
				h.Id(id),
				h.Class("input"),
				h.Name(spec.field),
				h.Type(spec.type),
				h.Value(model.authForm[spec.field]),
				h.Autocomplete(spec.autocomplete),
				h.Required(spec.isRequired),
				h.Disabled(model.authForm.isSubmitting),
				...typing,
				...described,
				h.OnInput((value) =>
					Message.ChangedAuthField({ field: spec.field, value })
				),
			]),
			...hints,
		]
	);
};

const DISPLAY_NAME: FieldSpec = {
	field: "displayName",
	label: "Display name",
	type: "text",
	autocomplete: "name",
	hint: "How Prosody greets you. Leave it empty to use your username.",
	isRequired: false,
};

const NEW_USERNAME: FieldSpec = {
	field: "username",
	label: "Username",
	type: "text",
	autocomplete: "username",
	hint: "Lowercase letters, digits, dots, dashes or underscores.",
	isRequired: true,
};

const NEW_PASSWORD: FieldSpec = {
	field: "password",
	label: "Password",
	type: "password",
	autocomplete: "new-password",
	hint: `At least ${MIN_PASSWORD} characters.`,
	isRequired: true,
};

const submitView = (
	model: Model,
	label: string,
	busy: string,
	isPrimary: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.button(
		[
			h.Type("submit"),
			h.Class(
				isPrimary ? "btn btn-primary btn-block" : "btn btn-secondary btn-block"
			),
			h.Disabled(model.authForm.isSubmitting || !model.isOnline),
			h.AriaBusy(model.authForm.isSubmitting),
		],
		[model.authForm.isSubmitting ? busy : label]
	);

const oidcHref = (redirect: string): string =>
	`/auth/oidc/start?${new URLSearchParams({ redirect }).toString()}`;

const oidcButtonView = (
	model: Model,
	oidc: SingleSignOn,
	redirect: string,
	isPrimary: boolean,
	h: HtmlBuilder<Message>
): Html => {
	const look = isPrimary
		? "btn btn-primary btn-block"
		: "btn btn-secondary btn-block";

	const label = `Sign in with ${oidc.displayName}`;

	return model.isOnline
		? h.a([h.Class(look), h.Href(oidcHref(redirect))], [label])
		: h.button([h.Type("button"), h.Class(look), h.Disabled(true)], [label]);
};

const dividerView = (h: HtmlBuilder<Message>): Html =>
	h.div([h.Class("auth-divider"), h.Role("separator")], [h.span([], ["or"])]);

const loginFormView = (
	model: Model,
	isPrimary: boolean,
	h: HtmlBuilder<Message>
): Html =>
	h.form(
		[
			h.Class("auth-form"),
			h.Novalidate(true),
			h.AriaLabel("Sign in with a password"),
			h.OnSubmit(Message.SubmittedLogin()),
		],
		[
			fieldView(
				model,
				"login",
				{
					field: "username",
					label: "Username",
					type: "text",
					autocomplete: "username",
					hint: "",
					isRequired: true,
				},
				h
			),
			fieldView(
				model,
				"login",
				{
					field: "password",
					label: "Password",
					type: "password",
					autocomplete: "current-password",
					hint: "",
					isRequired: true,
				},
				h
			),
			submitView(model, "Sign in", "Signing in…", isPrimary, h),
		]
	);

export const loginView = (
	model: Model,
	options: SignInOptions,
	redirect: string,
	h: HtmlBuilder<Message>
): Document => {
	const oidc = Option.map(options.oidc, (sso) =>
		oidcButtonView(model, sso, redirect, true, h)
	);

	const hasOidc = Option.isSome(oidc);

	const dividers = hasOidc ? [dividerView(h)] : [];

	const local = options.localAuth
		? [...dividers, loginFormView(model, !hasOidc, h)]
		: [];

	const ssoProblems = model.login.ssoFailed
		? [
				bannerView(
					"Single sign-on did not finish. Try again, or sign in another way.",
					"danger",
					h
				),
			]
		: [];

	const unavailable =
		!hasOidc && !options.localAuth
			? [
					h.p(
						[h.Class("auth-lede")],
						["Sign-in is not set up on this host yet. Ask whoever runs it."]
					),
				]
			: [];

	return {
		title: "Sign in · Prosody",
		body: authShellView(
			model,
			[
				cardView(
					"Sign in",
					"Your shelf, your places and the books kept on this device.",
					[
						...ssoProblems,
						...offlineView(model, h),
						...problemView(model, h),
						...Option.toArray(oidc),
						...local,
						...unavailable,
					],
					h
				),
			],
			h
		),
	};
};

export const setupView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const options = optionsOf(model);

	return {
		title: "Set up Prosody",
		body: authShellView(
			model,
			[
				cardView(
					"Set up Prosody",
					"Make the first account. It is an admin, so it can invite readers and run the desk.",
					[
						...offlineView(model, h),
						...problemView(model, h),
						h.form(
							[
								h.Class("auth-form"),
								h.Novalidate(true),
								h.AriaLabel("Make the first account"),
								h.OnSubmit(Message.SubmittedSetup()),
							],
							[
								fieldView(model, "setup", DISPLAY_NAME, h),
								fieldView(model, "setup", NEW_USERNAME, h),
								fieldView(model, "setup", NEW_PASSWORD, h),
								submitView(model, "Set up Prosody", "Setting up…", true, h),
							]
						),
						...Option.match(options.oidc, {
							onNone: () => [],
							onSome: (sso) => [
								dividerView(h),
								oidcButtonView(model, sso, shelfRouter(), false, h),
							],
						}),
					],
					h
				),
			],
			h
		),
	};
};

export const checkingView = (
	model: Model,
	h: HtmlBuilder<Message>
): Document => ({
	title: "Prosody",
	body: authShellView(
		model,
		[
			h.div(
				[h.Class("auth-checking"), h.Role("status"), h.AriaBusy(true)],
				[h.span([h.Class("sr-only")], ["Opening Prosody"])]
			),
		],
		h
	),
});

const roleLabel = (role: "admin" | "reader"): string =>
	role === "admin" ? "Admin" : "Reader";

const expiryOf = (at: number): string =>
	new Date(at).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
	});

const signInInsteadView = (h: HtmlBuilder<Message>): Html =>
	h.p(
		[h.Class("auth-foot")],
		[
			"Already have an account? ",
			h.a([h.Class("text-link"), h.Href(loginRouter())], ["Sign in"]),
		]
	);

const registerView = (
	model: Model,
	role: "admin" | "reader",
	expiresAt: number,
	localAuth: boolean,
	h: HtmlBuilder<Message>
): ReadonlyArray<Html> => {
	const options = optionsOf(model);

	const head = h.div(
		[h.Class("auth-invite-meta")],
		[
			badgeView(
				roleLabel(role),
				role === "admin" ? "ink" : "neutral",
				false,
				h
			),
			h.span([], [`Expires ${expiryOf(expiresAt)}`]),
		]
	);

	if (!localAuth) {
		return [
			head,
			h.p(
				[h.Class("auth-lede")],
				[
					"Password accounts are turned off on this host, so this invite cannot make one.",
				]
			),
			...Option.match(options.oidc, {
				onNone: () => [],
				onSome: (sso) => [oidcButtonView(model, sso, shelfRouter(), true, h)],
			}),
		];
	}

	return [
		head,
		...offlineView(model, h),
		...problemView(model, h),
		h.form(
			[
				h.Class("auth-form"),
				h.Novalidate(true),
				h.AriaLabel("Make your account"),
				h.OnSubmit(Message.SubmittedRegister()),
			],
			[
				fieldView(model, "invite", DISPLAY_NAME, h),
				fieldView(model, "invite", NEW_USERNAME, h),
				fieldView(model, "invite", NEW_PASSWORD, h),
				submitView(model, "Make my account", "Making it…", true, h),
			]
		),
		signInInsteadView(h),
	];
};

const signedInInviteView = (
	model: Model,
	displayName: string,
	h: HtmlBuilder<Message>
): Html =>
	cardView(
		"You are already signed in",
		`You are signed in as ${displayName}. Sign out first to use this invite for a new account.`,
		[
			h.div(
				[h.Class("auth-actions")],
				[
					h.a(
						[h.Class("btn btn-primary btn-block"), h.Href(shelfRouter())],
						["Go to the shelf"]
					),
					h.button(
						[
							h.Type("button"),
							h.Class("btn btn-secondary btn-block"),
							h.Disabled(!model.isOnline),
							h.OnClick(Message.ClickedSignOut()),
						],
						["Sign out"]
					),
				]
			),
		],
		h
	);

export const inviteView = (model: Model, h: HtmlBuilder<Message>): Document => {
	const card = Option.match(userOf(model), {
		onSome: (user) => signedInInviteView(model, user.displayName, h),
		onNone: () =>
			InviteCheck.match(model.invite, {
				Idle: () => cardView("You are invited", "Checking your invite…", [], h),
				Checking: () =>
					cardView("You are invited", "Checking your invite…", [], h),
				Invalid: ({ reason }) =>
					cardView(
						"This invite can't be used",
						reason,
						[
							h.p(
								[h.Class("auth-lede")],
								["Ask whoever sent it for a new link."]
							),
							signInInsteadView(h),
						],
						h
					),
				Valid: ({ role, expiresAt, localAuth }) =>
					cardView(
						"You are invited",
						"Make an account to open the shelf, keep your place and read on any device.",
						registerView(model, role, expiresAt, localAuth, h),
						h
					),
			}),
	});

	return {
		title: "Join Prosody",
		body: authShellView(model, [card], h),
	};
};
