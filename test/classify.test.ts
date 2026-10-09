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

  it("platô de taxa fixa, mas com a repetição só dentro do platô, é UM evento: inconclusive", () => {
    const v = classify([...human(40), ...Array(12).fill(1500), ...human(20)]);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["step_spike", "mechanical_repeat", "abrupt_drop"]);
    expect(v.groups.filter((g) => g.triggered).map((g) => g.name)).toEqual(["plateau_event"]);
    expect(v.reason).toMatch(/repetição mecânica caiu dentro do próprio platô/i);
  });

  it("platô comprado com repetição mecânica ANTES dele (outro trecho da série) é suspicious, com motivo legível", () => {
    const s = [...human(20), ...Array(10).fill(150), ...human(10), ...Array(12).fill(1500), ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(v.groups.filter((g) => g.triggered).map((g) => g.name)).toEqual(["plateau_event", "mechanical_repeat"]);
    expect(v.groups[1]!.start_hour).toBe(20);
    expect(v.reason).toContain("hora 40");
    expect(v.reason).toContain("hora 40");
    expect(v.reason).toMatch(/salto de .*x/);
    expect(v.reason).toMatch(/queda de \d+%/);
    expect(v.reason).toMatch(/2 eventos independentes/);
    expect(v.reason).not.toMatch(/step_spike|abrupt_drop|mechanical_repeat/);
  });

  it("repetição mecânica DEPOIS do platô (outro trecho) é suspicious", () => {
    const s = [...human(40), ...noisy(10, 900), ...human(12), ...Array(10).fill(160), ...human(10)];
    const v = classify(s);
    expect(v.classification).toBe("suspicious");
    expect(v.groups[1]).toMatchObject({ triggered: true, start_hour: 62 });
  });

  it("repetição mecânica que termina 1 hora antes do salto está fora do platô (fronteira)", () => {
    const s = [...human(20), ...Array(8).fill(150), ...noisy(12, 1500), ...human(20)];
    const v = classify(s);
    expect(v.signals.find((x) => x.name === "step_spike")!.evidence!.hour_index).toBe(28);
    expect(v.groups[1]).toMatchObject({ triggered: true, start_hour: 20 });
    expect(v.classification).toBe("suspicious");
  });

  it("repetição mecânica que começa exatamente na hora da queda já é outro trecho (fronteira)", () => {
    const s = [...human(40), ...noisy(10, 1500), ...Array(10).fill(200), ...human(10)];
    const v = classify(s);
    expect(v.signals.find((x) => x.name === "abrupt_drop")!.evidence!.hour_index).toBe(50);
    expect(v.groups[1]).toMatchObject({ triggered: true, start_hour: 50 });
    expect(v.classification).toBe("suspicious");
  });

  it("platô alto com queda abrupta e ruído natural é inconclusive", () => {
    const s = [...human(30), ...noisy(8, 800), 30, 25, ...human(20)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["step_spike", "abrupt_drop"]);
  });
});

describe("classify: salto e queda só se fundem quando são do mesmo platô", () => {
  const group = (v: ReturnType<typeof classify>) => v.groups.find((g) => g.name === "plateau_event")!;

  it("pico de 1 hora na hora 30 e, bem depois, um platô com queda seca: platôs distintos, sem 'mesmo platô'", () => {
    const s = [...human(30), 1800, ...human(49), ...noisy(8, 1500), 20, 18, ...human(10)];
    const v = classify(s);
    expect(names(v)).toEqual(["step_spike", "abrupt_drop"]);
    expect(v.signals[0]!.evidence!.hour_index).toBe(30);
    expect(v.signals[2]!.evidence!.hour_index).toBe(88);
    expect(v.classification).toBe("inconclusive");
    expect(v.reason).not.toMatch(/mesmo platô/i);
    expect(v.reason).toMatch(/distantes demais/i);
    expect(group(v).start_hour).toBeNull();
    expect(group(v).end_hour).toBeNull();
  });

  it("queda na hora 37 e só depois um salto na hora 70: queda vem antes do salto, não é o mesmo platô", () => {
    const s = [...human(30), 250, 450, 700, 900, 880, 910, 890, 30, ...human(32), ...noisy(8, 1500), ...human(20)];
    const v = classify(s);
    expect(v.signals[2]!.evidence!.hour_index).toBe(37);
    expect(v.signals[0]!.evidence!.hour_index).toBe(70);
    expect(v.classification).toBe("inconclusive");
    expect(v.reason).not.toMatch(/mesmo platô/i);
    const g = group(v);
    expect(g.triggered).toBe(true);
    expect(g.start_hour === null || g.end_hour === null || g.start_hour <= g.end_hour).toBe(true);
  });

  it("platô único de 55 h (queda a mais de 48 h do salto) não é descrito como 'dois platôs'", () => {
    const s = [...human(30), ...noisy(55, 1500), ...human(30)];
    const v = classify(s);
    expect(names(v)).toContain("step_spike");
    expect(names(v)).toContain("abrupt_drop");
    expect(v.reason).toMatch(/distantes demais/i);
    expect(v.reason).not.toMatch(/dois platôs|platôs separados|são o mesmo platô/i);
    const g = v.groups[0]!;
    expect(g.start_hour).toBeNull();
    expect(g.end_hour).toBeNull();
    expect(v.classification).toBe("inconclusive");
  });

  it("queda antes do salto: eventos separados, sem afirmar platô único", () => {
    const s = [...human(30), 250, 450, 700, 900, 880, 910, 890, 30, ...human(32), ...noisy(8, 1500), ...human(20)];
    const v = classify(s);
    expect(v.reason).toMatch(/antes do salto/i);
    expect(v.reason).not.toMatch(/são o mesmo platô/i);
  });

  it("fronteira de 48 h: queda a exatamente 48 h do salto funde; a 49 h não funde", () => {
    // Platô de n horas a partir da hora 40: a queda cai na hora 40 + n, ou seja, n horas após o salto.
    const run = (n: number) => classify([...human(40), ...noisy(n, 1500), ...human(20)]);
    const at48 = run(48);
    const g48 = at48.groups[0]!;
    expect(at48.signals[2]!.evidence!.hour_index - at48.signals[0]!.evidence!.hour_index).toBe(48);
    expect(g48).toMatchObject({ start_hour: 40, end_hour: 88 });
    expect(at48.reason).toMatch(/são o mesmo platô/);

    const at49 = run(49);
    const g49 = at49.groups[0]!;
    expect(at49.signals[2]!.evidence!.hour_index - at49.signals[0]!.evidence!.hour_index).toBe(49);
    expect(g49.start_hour).toBeNull();
    expect(g49.end_hour).toBeNull();
    expect(at49.reason).toMatch(/distantes demais/);
    expect(at49.reason).not.toMatch(/são o mesmo platô/);
  });

  it("salto e queda do mesmo platô trazem start_hour <= end_hour", () => {
    const g = group(classify([...human(40), ...noisy(12, 1500), ...human(20)]));
    expect(g.start_hour).toBe(40);
    expect(g.end_hour).toBe(52);
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
    "canal pequeno: 3/h para 60/h por 8 h": [...withNoise(48, 3, 0.3, 10), ...withNoise(8, 60, 0.1, 15), ...withNoise(40, 3, 0.3, 11)],
  };
  for (const [name, series] of Object.entries(cases)) {
    it(`não acusa: ${name}`, () => {
      expect(classify(series).classification).not.toBe("suspicious");
    });
  }
});

describe("classify: repetição fraca não vale como segundo evento", () => {
  // 8 horas com variação de ~1,5%: abaixo de 2%, mas acima do limiar forte de 0,5%.
  const weak = (level: number) => Array.from({ length: 8 }, (_, i) => Math.round(level * (1 + (i % 2 ? 0.015 : -0.015))));
  const plateau = noisy(12, 1500);

  it("platô + repetição fraca fora do platô: inconclusive, com o sinal marcado como fraco", () => {
    const v = classify([...human(20), ...weak(150), ...human(10), ...plateau, ...human(20)]);
    expect(v.classification).toBe("inconclusive");
    expect(v.signals[1]).toMatchObject({ name: "mechanical_repeat", triggered: true, strength: "weak" });
    expect(v.groups.filter((g) => g.triggered).map((g) => g.name)).toEqual(["plateau_event"]);
    expect(v.reason).toMatch(/fraca/i);
  });

  it("a mesma série com repetição forte é suspicious", () => {
    const v = classify([...human(20), ...Array(8).fill(150), ...human(10), ...plateau, ...human(20)]);
    expect(v.classification).toBe("suspicious");
    expect(v.signals[1]!.strength).toBe("strong");
  });

  it("repetição fraca sozinha não conta nenhum evento: organic, mas o motivo cita a evidência fraca", () => {
    const v = classify([...human(30), ...weak(150), ...human(30)]);
    expect(v.classification).toBe("organic");
    expect(v.groups.every((g) => !g.triggered)).toBe(true);
    expect(v.reason).toMatch(/fraca/i);
  });

  it("regra antiga (opção countWeakMechanical) acusaria a mesma série: é só para comparação nas taxas", () => {
    const s = [...human(20), ...weak(150), ...human(10), ...plateau, ...human(20)];
    expect(classify(s, { countWeakMechanical: true }).classification).toBe("suspicious");
  });
});

describe("classify: limite conhecido", () => {
  it("live perfeitamente constante (0,3%) e platô comprado com taxa fixa são indistinguíveis: nenhum dos dois é acusado", () => {
    const g = (() => { let seed = 21; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const live = Array.from({ length: 8 }, () => Math.round(1000 * (1 + 0.003 * (g() - 0.5) * 2)));
    const v = classify([...human(48), ...live, ...human(40)]);
    expect(names(v)).toContain("mechanical_repeat");
    expect(v.groups.filter((x) => x.triggered).map((x) => x.name)).toEqual(["plateau_event"]);
    expect(v.classification).toBe("inconclusive");
    expect(classify([...human(48), ...Array(8).fill(1000), ...human(40)]).classification).toBe("inconclusive");
  });
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
    expect(v.reason).toMatch(/só um evento/i);
    expect(v.reason).toMatch(/2 eventos independentes/);
  });

  it("repetição mecânica isolada também é inconclusive", () => {
    const s = [...human(30), ...Array(10).fill(150), ...human(30)];
    const v = classify(s);
    expect(v.classification).toBe("inconclusive");
    expect(names(v)).toEqual(["mechanical_repeat"]);
  });

  it("série curta usa o plural certo (1 hora, 2 horas)", () => {
    expect(classify([5]).reason).toContain("recebi 1 hora e");
    expect(classify([5, 6]).reason).toContain("recebi 2 horas e");
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
