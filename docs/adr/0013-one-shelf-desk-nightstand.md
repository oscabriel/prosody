# There is one shelf, one desk and one nightstand, and the app joins their parts

The `Shelf`, `Wanted` and `Nightstand` views are each one instance under one key, fed by several aggregates. Events from different aggregates have no order between them, so each view keeps its parts apart (works, syncs and copies; wants, catalogue entries and grabs) and the app joins them when it draws.
