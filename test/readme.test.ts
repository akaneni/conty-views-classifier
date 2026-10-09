import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../src/classify.ts";
import { DATASET_SEED, generateDataset } from "../src/dataset.ts";
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

  it("o número de falsos positivos escrito no README bate com uma contagem independente (classify direto, sem evaluate)", () => {
    const legit = generateDataset(DATASET_SEED).filter((x) => x.label === "legit");
    const fp = legit.filter((x) => classify(x.views).classification === "suspicious").length;
    const m = extractMarker(readme, "fp-rate")!.match(/^(\d+) de (\d+) legítimos/);
    expect(m, "formato do marcador fp-rate").not.toBeNull();
    expect(Number(m![1])).toBe(fp);
    expect(Number(m![2])).toBe(legit.length);
  });

  it("a tabela por família está entre marcadores no README", () => {
    expect(extractMarker(readme, "families")).toContain("| plateau_live_frontpage |");
  });
});
