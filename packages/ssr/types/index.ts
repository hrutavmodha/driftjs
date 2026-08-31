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

