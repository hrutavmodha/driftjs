// Ambient module declaration — lets TypeScript understand *.drift imports.
// The actual module is synthesised at build/serve time by @driftjs/vite-plugin.

import type { CompiledModule } from '@driftjs/compiler';

declare module '*.drift' {
  const component: CompiledModule;
  export default component;
}
