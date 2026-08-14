# driftjs-vite-plugin

> Build-time Vite plugin for compiling **DriftJS** `.drift` Single File Components (SFCs).

Transforms `.drift` component files at build time directly into ES modules exporting compiled register VM bytecode and execution render functions.

## Installation

```bash
pnpm add -D driftjs-vite-plugin vite
# or
npm install -D driftjs-vite-plugin vite
```

## Configuration (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import { driftPlugin } from 'driftjs-vite-plugin';

export default defineConfig({
  plugins: [
    driftPlugin({
      include: /\.drift$/,
    }),
  ],
});
```

## How It Works

1. Intercepts import requests for `.drift` files during Vite's `transform` hook.
2. Invokes `driftjs-compiler` to parse, analyze, and generate VM bytecode.
3. Serializes the `Uint32Array` bytecode stream and executable JavaScript thunks.
4. Outputs an ESM module exporting `{ program, render, default: component }`.

## TypeScript Support

Add module declaration for `.drift` files in your `env.d.ts` or `drift.d.ts`:

```typescript
declare module '*.drift' {
  import type { DriftComponent } from 'driftjs-dom';
  const component: DriftComponent;
  export default component;
}
```

## License

MIT © [Hrutav Modha](https://github.com/hrutavmodha)
