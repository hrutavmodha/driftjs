export * from '../../compiler/types/opcodes.js';

export interface VMExecutionOptions {
  readonly scope?: Record<string, any>;
  readonly document?: Document;
  readonly container?: HTMLElement;
  readonly hydrate?: boolean;
}



/** A self-contained reactive region that re-renders its DOM subtree when deps change. */
export interface ReactiveRegion {
  readonly deps: ReadonlySet<string>;
  readonly reRender: () => void;
  childRegions?: ReactiveRegion[];
}

