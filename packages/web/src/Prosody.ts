import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";

/** The connection to the model that commands and live reads need. */
export type Reader = Domain.Api.ClientKey<"ReaderApi">;

/** Foldkit Commands and Subscriptions for everything on the reader's Api. */
export const Prosody = DomainFoldkit.make(ReaderApi);
