# Stored state is read with defaults and stored names never change

Nothing in the event history or on disk is migrated. A field added later decodes with a default when it is missing (a place kept before there were pages has no page; a grab kept before shelving has no note), and a name that was stored keeps its name: a reading copy's contents still say `pages` for a text's sections, mapped by `Schema.encodeKeys`. This keeps every old event, view and reading copy readable without a migration step.
