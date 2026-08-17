export interface BaseVMExecutionOptions {
  readonly scope?: Record<string, any>;
}

/**
 * Represents a strongly-typed Context Token in DriftJS.
 */
export interface Context<T> {
  readonly id: symbol;
  readonly name?: string;
  readonly defaultValue?: T;
  provide(value: T | (() => T)): void;
  inject(fallback?: T): T;
}
