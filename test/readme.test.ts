import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, extractMarker, readmeBlocks } from "../src/evaluate.ts";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const measured = readmeBlocks(evaluate());

describe("coerência do README com o dataset medido", () => {
  for (const [name, expected] of Object.entries(measured)) {
    it(`o número entre os marcadores ${name} é o medido por npm run dataset`, () => {
      const written = extractMarker(readme, name);
      expect(written, `marcador ${name} ausente no README`).not.toBeNull();
      expect(written).toBe(expected);
    });
  }

  it("a taxa de falso positivo do README é derivada de legítimos classificados suspicious / total de legítimos", () => {
    const r = evaluate();
    expect(r.false_positive_rate).toBe(r.legit.suspicious / r.legit.total);
    expect(r.legit.total).toBe(600);
  });
});
