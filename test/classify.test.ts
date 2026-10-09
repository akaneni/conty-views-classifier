import { describe, expect, it } from "vitest";
import { classify } from "../src/classify.ts";

// Série humana de referência: ~120 views/h com oscilação diária e ruído determinístico.
const human = (n: number, base = 120): number[] =>
  Array.from({ length: n }, (_, i) =>
    Math.round(base * (1 + 0.35 * Math.sin((2 * Math.PI * i) / 24)) * (1 + 0.07 * Math.sin(i * 7.31))),
  );

const names = (v: ReturnType<typeof classify>) => v.signals.filter((s) => s.triggered).map((s) => s.name);

describe("classify: casos óbvios", () => {
  it("série estável com oscilação diária é organic", () => {
    const v = classify(human(96));
    expect(v.classification).toBe("organic");
    expect(names(v)).toEqual([]);
    expect(v.reason).toMatch(/nenhum dos três sinais/i);
  });

  it("pico comprado em degrau que termina em queda seca é suspicious, com motivo legível", () => {
    const s = [...human(40), ...Array(12).fill(1500), ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(names(v)).toEqual(["step_spike", "abrupt_drop"]);
    expect(v.reason).toContain("hora 40");
    expect(v.reason).toMatch(/salto de .*x/);
    expect(v.reason).toMatch(/queda de \d+%/);
    expect(v.reason).not.toMatch(/step_spike|abrupt_drop|mechanical_repeat/);
  });

  it("repetição mecânica após salto é suspicious", () => {
    const s = [...human(40), ...Array(10).fill(900), 700, 500, 350, 260, 200, ...human(10)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(names(v)).toContain("mechanical_repeat");
    expect(names(v)).toContain("step_spike");
  });

  it("platô alto seguido de queda abrupta junto de degrau é suspicious", () => {
    const s = [...human(30), ...[800, 810, 790, 805, 795, 800], 30, 25, ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(names(v)).toContain("abrupt_drop");
  });
});

describe("classify: pico orgânico plausível x pico comprado", () => {
  // Mesma altura de pico (cerca de 1500 views/h), caminhos diferentes.
  const viral = [...human(30), 200, 350, 600, 1000, 1500, 1450, 1300, 1100, 900, 700, 550, 430, 340, 270, 220, 180, ...human(30)];
  const bought = [...human(30), ...Array(8).fill(1500), ...human(30)];

  it("viral com rampa e cauda longa é organic", () => {
    const v = classify(viral);
    expect(v.classification).toBe("organic");
    expect(names(v)).toEqual([]);
  });

  it("o mesmo pico máximo, sem rampa e com queda seca, é suspicious", () => {
    const v = classify(bought);
    expect(v.classification).toBe("suspicious");
  });

  it("compartilhamento súbito por conta grande (salto de 1 hora com cauda) não é acusado", () => {
    const s = [...human(30), 1200, 900, 650, 480, 350, 260, 200, 170, 150, ...human(30)];
    const v = classify(s);
    expect(v.classification).toBe("organic");
  });
});

describe("classify: prefere não acusar", () => {
  it("um único sinal (pico de 1 hora que some) é inconclusive e o motivo explica por quê", () => {
    const s = [...human(40), 1800, ...human(30)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["step_spike"]);
    expect(v.reason).toMatch(/prefiro não acusar/i);
    expect(v.reason).toMatch(/só um sinal/i);
    expect(v.reason).toMatch(/2 sinais/);
  });

  it("repetição mecânica isolada também é inconclusive", () => {
    const s = [...human(30), ...Array(10).fill(150), ...human(30)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["mechanical_repeat"]);
  });

  it("série curta é inconclusive com motivo de série curta", () => {
    const v = classify(human(10));
    expect(v.classification).toBe("inconclusive");
    expect(v.reason).toMatch(/série curta/i);
    expect(v.reason).toContain("10");
    expect(v.signals).toHaveLength(3);
  });
});

describe("classify: forma da resposta", () => {
  it("devolve os três sinais sempre, com evidência nos que dispararam", () => {
    const v = classify([...human(40), 1800, ...human(30)]);
    expect(v.signals.map((s) => s.name)).toEqual(["step_spike", "mechanical_repeat", "abrupt_drop"]);
    const step = v.signals[0]!;
    expect(step.triggered).toBe(true);
    expect(step.evidence).toMatchObject({ hour_index: 40, value: 1800 });
    expect(v.signals[1]!.evidence).toBeNull();
  });
});
