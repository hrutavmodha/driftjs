// Ambient module declaration — lets TypeScript understand *.drift imports.
// The actual module is synthesised at build/serve time by driftjs-vite-plugin.

declare module '*.drift' {
  const component: import('driftjs-compiler').CompiledModule;
  export default component;
}
