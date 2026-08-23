import { describe, it, expect } from "vitest";
import { extractScriptVars } from "../src/server.js";

describe("VSCode Language Server - extractScriptVars", () => {
  it("extracts comma-separated variable declarations, destructuring patterns, and functions", () => {
    const sfc = `
      <script>
        let a = 1, b = 2, c = 3;
        const { count, total } = props;
        const [ item, setItem ] = useItem();
        function handleClick() {}
      </script>
      <div>{a} {b} {c} {count} {total} {item}</div>
    `;

    const items = extractScriptVars(sfc);
    const labels = items.map((i) => i.label);

    expect(labels).toContain("a");
    expect(labels).toContain("b");
    expect(labels).toContain("c");
    expect(labels).toContain("count");
    expect(labels).toContain("total");
    expect(labels).toContain("item");
    expect(labels).toContain("setItem");
    expect(labels).toContain("handleClick");
  });

  it("extractScriptVars does not experience catastrophic backtracking on multiline text (BUG-016)", () => {
    const sfc = `
      <script>
        let longUnfinished = "some unclosed string with lots of words and lines
        let another = 123;
      </script>
      <div>test</div>
    `;

    const start = Date.now();
    const items = extractScriptVars(sfc);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
    expect(items.some((i) => i.label === "another")).toBe(true);
  });
});
