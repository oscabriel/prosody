import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { CatalogueWork, WorkCatalogued } from "./CatalogueWork.command.ts";
import {
  AlreadyShelved,
  EditionShelved,
  NotCatalogued,
  ShelveEdition,
} from "./ShelveEdition.command.ts";
import { WorkId } from "./Work.id.ts";

const State = Schema.Struct({
  catalogued: Schema.Boolean,
  text: Schema.NullOr(Schema.String),
  audio: Schema.NullOr(Schema.String),
});

export class Work extends Domain.Aggregate("Work", {
  id: WorkId,
  state: State,
  initial: { catalogued: false, text: null, audio: null },
  commands: [CatalogueWork, ShelveEdition],
  decide: {
    CatalogueWork: (work, cmd) =>
      work.catalogued
        ? []
        : [new WorkCatalogued({ title: cmd.title, author: cmd.author, shelfmark: cmd.shelfmark })],
    ShelveEdition: (work, cmd) => {
      if (!work.catalogued) return new NotCatalogued();
      const shelved = work[cmd.kind];
      if (shelved === cmd.file) return [];
      if (shelved !== null) return new AlreadyShelved({ kind: cmd.kind, file: shelved });
      return [new EditionShelved({ kind: cmd.kind, file: cmd.file, bytes: cmd.bytes })];
    },
  },
  evolve: {
    WorkCatalogued: (work) => ({ ...work, catalogued: true }),
    EditionShelved: (work, e) => ({ ...work, [e.kind]: e.file }),
  },
}) {}
