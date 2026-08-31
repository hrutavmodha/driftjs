export interface SSRExecutionOptions {
  readonly scope?: Record<string, any>;
}

export interface StreamOptions extends SSRExecutionOptions {
  readonly onShellReady?: (() => void) | undefined;
  readonly onAllReady?: (() => void) | undefined;
  readonly onError?: ((error: unknown) => void) | undefined;
  readonly timeoutMs?: number | undefined;
  readonly nonce?: string | undefined;
}

export interface DriftStream extends ReadableStream<Uint8Array> {
  pipe<T>(destination: T): T;
  abort(reason?: any): void;
}

export interface ServerNode {
  type: "element" | "text" | "comment" | "fragment";
  tag?: string;
  attrs?: Map<string, string | boolean | null>;
  children: (ServerNode | string)[];
  content?: string;
}

export interface IslandRenderOptions extends SSRExecutionOptions {
  /** Hydration trigger strategy ('eager' | 'idle' | 'visible' | 'interaction' | 'media') */
  readonly trigger?: 'eager' | 'idle' | 'visible' | 'interaction' | 'media';
  /** Idle or interaction timeout in milliseconds */
  readonly timeout?: number;
  /** CSS media query (for 'media' trigger) */
  readonly media?: string;
  /** Viewport root margin (for 'visible' trigger) */
  readonly rootMargin?: string;
  /** HTML wrapper element tag (default: 'div') */
  readonly islandTag?: string;
  /** Additional props serialized into data-drift-props */
  readonly props?: Record<string, any>;
}
