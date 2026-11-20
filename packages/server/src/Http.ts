import * as DomainHttp from "@alchemy.run/domain/Http";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";
import * as Http from "alchemy/Http";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder } from "effect/http-api";

/**
 * The reader's Api as plain HTTP, for curl and scripts: a view read is `GET /<View>/<key>`, a
 * command is a `POST`, and `/openapi.json` describes every route.
 */
export const ReaderHttp = DomainHttp.toHttpApi(ReaderApi, {
	expose: [
		"Wanted.get",
		"Shelf.get",
		"Place.get",
		"Nightstand.get",
		"WantBook",
		"WithdrawWant",
		"SearchAgain",
		"RealignNarration",
		"RemakeCopy",
		"KeepPlace",
		"OpenBook",
		"FinishBook",
		"SetAside",
	],
});

export const plainFetch = HttpRouter.toHttpEffect(
	HttpApiBuilder.layer(ReaderHttp.api, { openapiPath: "/openapi.json" }).pipe(
		Layer.provide(ReaderHttp.layer),
		Layer.provide(Http.Platform)
	)
);
