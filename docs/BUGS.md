# DriftJS Bug Tracking & Resolution Log

## Fixed Defects

### BUG-001: Scope Prototype Mutation in Variable Declarations Causing Nested Component/Router Blank View
- **Severity:** High
- **Packages Affected:** `driftjs-compiler` (`generator.ts`), `driftjs-router` (`RouterView.drift`), `driftjs-dom` (`index.ts`)
- **Symptoms:** After rendering 1–3 routes, subsequent route clicks resulted in blank views.
- **Root Cause:** `astToJS` emitted `setScopeValue` for `VariableDeclaration`, mutating ancestor component scopes on the prototype chain.
- **Resolution:** Updated `astToJS` in `DriftGenerator` to assign declared variables and functions as own properties on `scope` (`scope[varName] = ...`).

### BUG-002: Dynamic Expression Props Passed to Components Not Evaluated (Rendered as [object Object])
- **Severity:** Medium
- **Packages Affected:** `driftjs-compiler` (`generator.ts`), `driftjs-dom` (`index.ts`, `evaluator.ts`)
- **Symptoms:** Dynamic expression props passed to components (e.g. `<RouterLink to={'/pioneers/' + p.id} label={'View Profile →'} />`) rendered as literal `[object Object]` string instead of the evaluated string.
- **Root Cause:** When building `propsSpec` in `compileElement` (`generator.ts`), interpolation attribute values (`attr.value.type === ASTNodeType.Interpolation`) stored the raw Acorn AST node without converting it into a precompiled `{ __drift_fn__: ... }` executable function. At runtime, `evaluatePropsSpec` returned the raw Acorn AST object, which stringified to `[object Object]`.
- **Resolution:** Updated `compileElement` in `DriftGenerator` to transform interpolation expressions into precompiled `{ __drift_fn__: ... }` closures using `astToJS`, allowing `evaluatePropsSpec` to evaluate the dynamic JavaScript expression against scope at runtime.
