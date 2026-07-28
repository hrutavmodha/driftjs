# TODO

## Reactive binding update optimization

Currently `triggerUpdates()` re-evaluates **every** reactive binding on every event handler call, regardless of which variables actually changed.

**Proposed fix**: Pass the set of changed variable names through the arrow fn wrapper → `triggerUpdates(changedVars: Set<string>)` → only call `updateAt` for bindings whose `variable` is in `changedVars`.
