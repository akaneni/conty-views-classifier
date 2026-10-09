import { createRng } from "./rng.ts";
import { mechanicalRepeat } from "./signals.ts";

// Sensibilidade da repetição FORTE a séries puramente aleatórias (contagem de Poisson, aproximada
// por normal com variância = média), por volume. Não é dataset de classificação: mede quantas
// séries "naturais" teriam ao menos uma janela deslizante de 8 h com variação < 0,5% por acaso.
export const SENSITIVITY_SEED = 777;
export const SENSITIVITY_SERIES = 200;

interface Scenario { label: string; hours: number; mean: number; cycle: boolean }
export const SENSITIVITY_SCENARIOS: Scenario[] = [
  { label: "plana, 96 h", hours: 96, mean: 2000, cycle: false },
  { label: "plana, 96 h", hours: 96, mean: 5000, cycle: false },
  { label: "plana, 96 h", hours: 96, mean: 10000, cycle: false },
  { label: "plana, 96 h", hours: 96, mean: 20000, cycle: false },
  { label: "plana, 720 h", hours: 720, mean: 5000, cycle: false },
  { label: "ciclo dia/noite de ±30%, 96 h", hours: 96, mean: 5000, cycle: true },
  { label: "ciclo dia/noite de ±30%, 96 h", hours: 96, mean: 20000, cycle: true },
];

export function poissonSensitivity(): Array<Scenario & { total: number; strong: number }> {
  return SENSITIVITY_SCENARIOS.map((sc, si) => {
    const r = createRng(SENSITIVITY_SEED + si * 7919);
    let strong = 0;
    for (let i = 0; i < SENSITIVITY_SERIES; i++) {
      const phase = r.uniform(0, 24);
      const views = Array.from({ length: sc.hours }, (_, h) => {
        const mu = sc.mean * (sc.cycle ? 1 + 0.3 * Math.sin((2 * Math.PI * (h - phase)) / 24) : 1);
        return Math.max(0, Math.round(mu + Math.sqrt(mu) * r.gauss()));
      });
      if (mechanicalRepeat(views).strength === "strong") strong++;
    }
    return { ...sc, total: SENSITIVITY_SERIES, strong };
  });
}

export function sensitivityTable(): string {
  const rows = poissonSensitivity().map(
    (x) => `| ${x.label} | ${x.mean} | ${x.total} | ${x.strong} (${((100 * x.strong) / x.total).toFixed(1).replace(".", ",")}%) |`,
  );
  return ["", "| série | views/h (média) | séries | com ao menos uma janela forte por acaso |", "|---|---|---|---|", ...rows, ""].join("\n");
}
