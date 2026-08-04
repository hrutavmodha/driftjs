import type { CompiledModule } from '@driftjs/compiler';

declare module '*.drift' {
  const component: CompiledModule;
  export default component;
}
