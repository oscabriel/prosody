import { Config, Context, Effect, Layer, Redacted } from "effect";

export const AuthConfig = Config.all({
	publicUrl: Config.String("PROSODY_PUBLIC_URL").pipe(Config.withDefault("")),
	issuer: Config.String("OIDC_ISSUER_URL").pipe(Config.withDefault("")),
	internalUrl: Config.String("OIDC_INTERNAL_URL").pipe(Config.withDefault("")),
	clientId: Config.String("OIDC_CLIENT_ID").pipe(Config.withDefault("")),
	clientSecret: Config.Redacted("OIDC_CLIENT_SECRET").pipe(
		Config.withDefault(Redacted.make(""))
	),
	displayName: Config.String("OIDC_DISPLAY_NAME").pipe(Config.withDefault("")),
	adminGroup: Config.String("OIDC_ADMIN_GROUP").pipe(Config.withDefault("")),
	scopes: Config.String("OIDC_SCOPES").pipe(Config.withDefault("")),
	localAuth: Config.String("PROSODY_LOCAL_AUTH").pipe(Config.withDefault("")),
});

export interface Settings {
	readonly publicUrl: string;
	readonly issuer: string;
	readonly internalUrl: string;
	readonly clientId: string;
	readonly clientSecret: Redacted.Redacted;
	readonly displayName: string;
	readonly adminGroup: string;
	readonly scopes: string;
	readonly localAuth: boolean;
	readonly oidcEnabled: boolean;
}

const OFF = new Set(["false", "0", "no", "off"]);

export const withoutTrailingSlash = (url: string): string =>
	url.trim().replace(/\/+$/u, "");

const orElse = (value: string, otherwise: string): string =>
	value.trim() === "" ? otherwise : value.trim();

export const settingsOf = (
	raw: Config.Success<typeof AuthConfig>
): Settings => {
	const issuer = withoutTrailingSlash(raw.issuer);
	const clientId = raw.clientId.trim();

	return {
		publicUrl: withoutTrailingSlash(raw.publicUrl),
		issuer,
		internalUrl: withoutTrailingSlash(raw.internalUrl),
		clientId,
		clientSecret: raw.clientSecret,
		displayName: orElse(raw.displayName, "Single sign-on"),
		adminGroup: orElse(raw.adminGroup, "admins"),
		scopes: orElse(raw.scopes, "openid profile email groups"),
		localAuth: !OFF.has(raw.localAuth.trim().toLowerCase()),
		oidcEnabled: issuer !== "" && clientId !== "",
	};
};

export class AuthSettings extends Context.Service<AuthSettings, Settings>()(
	"@prosody/server/AuthSettings",
	{
		make: Effect.gen(function* () {
			return settingsOf(yield* AuthConfig);
		}),
	}
) {
	static readonly layer = Layer.effect(this, this.make);
}
