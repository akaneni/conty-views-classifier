import { describe, expect, it } from "vitest";
import { DATASET_SEED, FAMILIES, generateDataset } from "../src/dataset.ts";

describe("dataset sintético", () => {
  it("mesmo seed gera exatamente o mesmo dataset", () => {
    expect(generateDataset(DATASET_SEED)).toEqual(generateDataset(DATASET_SEED));
  });

  it("seed diferente gera dataset diferente", () => {
    expect(generateDataset(DATASET_SEED + 1)).not.toEqual(generateDataset(DATASET_SEED));
  });

  it("tem tamanhos fixos por família, todos inteiros >= 0 e com pelo menos 24 horas", () => {
    const data = generateDataset(DATASET_SEED);
    for (const f of FAMILIES) {
      const items = data.filter((d) => d.family === f.name);
      expect(items).toHaveLength(f.count);
      for (const it of items) {
        expect(it.label).toBe(f.label);
        expect(it.views.length).toBeGreaterThanOrEqual(24);
        expect(it.views.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
      }
    }
  });

  it("tem famílias legítimas e suspeitas", () => {
    expect(FAMILIES.some((f) => f.label === "legit")).toBe(true);
    expect(FAMILIES.some((f) => f.label === "suspicious")).toBe(true);
  });
});
