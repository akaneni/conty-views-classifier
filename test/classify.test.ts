import { describe, expect, it } from "vitest";
import { classify } from "../src/classify.ts";

// Série humana de referência: ~120 views/h com oscilação diária e ruído determinístico.
const human = (n: number, base = 120): number[] =>
  Array.from({ length: n }, (_, i) =>
    Math.round(base * (1 + 0.35 * Math.sin((2 * Math.PI * i) / 24)) * (1 + 0.07 * Math.sin(i * 7.31))),
  );

// Patamar com oscilação de ~8%: alto, mas ainda não "idêntico demais".
const noisy = (n: number, level: number): number[] =>
  Array.from({ length: n }, (_, i) => Math.round(level * (1 + 0.08 * Math.sin(i * 2.9 + 1))));

const names = (v: ReturnType<typeof classify>) => v.signals.filter((s) => s.triggered).map((s) => s.name);

describe("classify: casos óbvios", () => {
  it("série estável com oscilação diária é organic", () => {
    const v = classify(human(96));
    expect(v.classification).toBe("organic");
    expect(names(v)).toEqual([]);
    expect(v.reason).toMatch(/nenhum dos três sinais/i);
  });

  it("salto e queda seca do mesmo platô contam como UM evento: sozinho é inconclusive", () => {
    const s = [...human(40), ...noisy(12, 1500), ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["step_spike", "abrupt_drop"]);
    expect(v.groups.filter((g) => g.triggered).map((g) => g.name)).toEqual(["plateau_event"]);
    expect(v.groups[0]).toMatchObject({ name: "plateau_event", start_hour: 40, end_hour: 52 });
    expect(v.reason).toMatch(/mesmo platô/i);
    expect(v.reason).toMatch(/não basta/i);
    expect(v.reason).not.toMatch(/step_spike|abrupt_drop|mechanical_repeat/);
  });

  it("platô de taxa fixa (salto + repetição mecânica + queda) é suspicious, com motivo legível", () => {
    const s = [...human(40), ...Array(12).fill(1500), ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(v.groups.filter((g) => g.triggered).map((g) => g.name)).toEqual(["plateau_event", "mechanical_repeat"]);
    expect(v.reason).toContain("hora 40");
    expect(v.reason).toMatch(/salto de .*x/);
    expect(v.reason).toMatch(/queda de \d+%/);
    expect(v.reason).toMatch(/2 eventos independentes/);
    expect(v.reason).not.toMatch(/step_spike|abrupt_drop|mechanical_repeat/);
  });

  it("repetição mecânica após salto é suspicious", () => {
    const s = [...human(40), ...Array(10).fill(900), 700, 500, 350, 260, 200, ...human(10)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(names(v)).toContain("mechanical_repeat");
    expect(names(v)).toContain("step_spike");
  });

  it("platô alto com queda abrupta e ruído natural é inconclusive", () => {
    const s = [...human(30), ...noisy(8, 800), 30, 25, ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["step_spike", "abrupt_drop"]);
  });
});

describe("classify: regressão, platôs legítimos nunca viram suspicious", () => {
  // Sondas do revisor independente: live, front page, newsletter semanal, canal pequeno.
  const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const withNoise = (n: number, level: number, sd: number, seed: number) => {
    const r = lcg(seed);
    return Array.from({ length: n }, () => Math.round(level * (1 + sd * (r() + r() + r() - 1.5) * 2)));
  };
  const cases: Record<string, number[]> = {
    "base 120, 1500 por 8 h com ruído de 8%": [...withNoise(48, 120, 0.1, 1), ...withNoise(8, 1500, 0.08, 2), ...withNoise(40, 120, 0.1, 3)],
    "base 120, 2000 por 12 h com ruído de 5%": [...withNoise(48, 120, 0.1, 4), ...withNoise(12, 2000, 0.05, 5), ...withNoise(40, 120, 0.1, 6)],
    "semana com segunda a 1800/h por 24 h e resto a 150/h": [...withNoise(48, 150, 0.1, 7), ...withNoise(24, 1800, 0.08, 8), ...withNoise(96, 150, 0.1, 9)],
    "canal pequeno: 3/h para 60/h por 8 h": [...withNoise(48, 3, 0.3, 10), ...Array(8).fill(60).map((v, i) => v + (i % 3)), ...withNoise(40, 3, 0.3, 11)],
    "live com platô de ~1000 por 8 h com variação de 0,3%": [...withNoise(48, 120, 0.1, 12), ...withNoise(8, 1000, 0.003, 13), ...withNoise(40, 120, 0.1, 14)],
  };
  for (const [name, series] of Object.entries(cases)) {
    it(`não acusa: ${name}`, () => {
      expect(classify(series).classification).not.toBe("suspicious");
    });
  }
});

describe("classify: pico orgânico plausível x pico comprado", () => {
  // Mesma altura de pico (cerca de 1500 views/h), caminhos diferentes.
  const viral = [...human(30), 200, 350, 600, 1000, 1500, 1450, 1300, 1100, 900, 700, 550, 430, 340, 270, 220, 180, ...human(30)];
  const bought = [...human(30), ...noisy(8, 1500), ...human(30)];

  it("viral com rampa e cauda longa é organic", () => {
    const v = classify(viral);
    expect(v.classification).toBe("organic");
    expect(names(v)).toEqual([]);
  });

  it("o mesmo pico máximo, sem rampa e com queda seca, não é tratado como o viral (fica inconclusive)", () => {
    const v = classify(bought);
    expect(v.classification).toBe("inconclusive");
    expect(v.classification).not.toBe(classify(viral).classification);
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
