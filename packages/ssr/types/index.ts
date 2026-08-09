export interface SSRExecutionOptions {
  readonly scope?: Record<string, any>;
}

export interface ServerNode {
  type: "element" | "text" | "comment" | "fragment";
  tag?: string;
  attrs?: Map<string, string | boolean | null>;
  children: (ServerNode | string)[];
  content?: string;
}
