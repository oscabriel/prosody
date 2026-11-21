import * as Domain from "@alchemy.run/domain";
import { Schema } from "effect";

import { WorkId } from "../Library/Work.id.ts";
import { Release } from "./Release.ts";

export class ReleasesOffered extends Domain.Event("ReleasesOffered", {
	releases: Schema.Array(Release),
}) {}

export class OfferReleases extends Domain.Command("OfferReleases", {
	target: WorkId,
	input: { search: Schema.Int, releases: Schema.Array(Release) },
	events: [ReleasesOffered],
}) {}
