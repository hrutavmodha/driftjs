/// <reference types="vite/client" />

declare module '*.drift' {
  const component: {
    program: any;
    mount: (target: HTMLElement) => any;
  };
  export default component;
}
