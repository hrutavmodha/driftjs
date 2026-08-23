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
});
