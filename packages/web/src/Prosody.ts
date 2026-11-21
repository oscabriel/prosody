import type * as Domain from "@alchemy.run/domain";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { ReaderApi } from "@prosody/domain/ReaderApi.api";

export type Reader = Domain.Api.ClientKey<"ReaderApi">;

export const Prosody = DomainFoldkit.make(ReaderApi);
