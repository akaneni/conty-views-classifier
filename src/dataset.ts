import { createRng, type Rng } from "./rng.ts";

export const DATASET_SEED = 20260101;

export type Label = "legit" | "suspicious";
export interface Sample {
  id: string;
  family: string;
  label: Label;
  views: number[];
}
export interface Family {
  name: string;
  label: Label;
  count: number;
  /** Comentário honesto sobre o que a família representa e o que se espera dela. */
  note: string;
  make: (r: Rng) => number[];
}

const toInts = (xs: number[]) => xs.map((x) => Math.max(0, Math.round(x)));
/** Ruído multiplicativo gaussiano. */
const noisy = (r: Rng, x: number, sd: number) => x * (1 + sd * r.gauss());
/** Fundo humano: base com ciclo diário leve e ruído de ~10%. */
const background = (r: Rng, n: number, base: number, amp = 0.3, sd = 0.1): number[] => {
  const phase = r.uniform(0, 24);
  return Array.from({ length: n }, (_, h) => noisy(r, base * (1 + amp * Math.sin((2 * Math.PI * (h - phase)) / 24)), sd));
};
const smooth = (x: number) => x * x * (3 - 2 * x);

function viralCurve(r: Rng, noiseSd: number): number[] {
  const n = r.int(96, 168);
  const base = r.logUniform(50, 2000);
  const mult = r.uniform(8, 40);
  const t0 = r.int(24, 40);
  const ramp = r.int(4, 12);
  const half = r.uniform(6, 24);
  const bg = background(r, n, base, 0.2, noiseSd);
  return toInts(
    bg.map((v, h) => {
      if (h < t0) return v;
      if (h <= t0 + ramp) return v * (1 + (mult - 1) * smooth((h - t0) / ramp));
      return v * (1 + (mult - 1) * Math.pow(0.5, (h - t0 - ramp) / half));
    }),
  );
}

/** Pico comprado: patamar de `mult`x em `dur` horas a partir de t0, com `level` horas de ruído `sd`. */
function boughtPlateau(r: Rng, opts: { sd: number; mechanical: boolean; endAbrupt: boolean }): number[] {
  const n = r.int(96, 168);
  const base = r.logUniform(50, 1000);
  const bg = background(r, n, base, 0.3, 0.1);
  const t0 = r.int(30, 50);
  const dur = r.int(10, 30);
  const level = base * r.uniform(6, 15);
  const tailHalf = r.uniform(2, 5);
  return toInts(
    bg.map((v, h) => {
      if (h < t0) return v;
      if (h < t0 + dur) return opts.mechanical ? level * (1 + 0.003 * r.gauss()) : noisy(r, level, opts.sd);
      if (opts.endAbrupt) return v;
      return v + level * Math.pow(0.5, (h - t0 - dur) / tailHalf);
    }),
  );
}

export const FAMILIES: Family[] = [
  // --- legítimos ---
  {
    name: "stable", label: "legit", count: 100,
    note: "volume estável com ruído de 6 a 12% (de canal pequeno, ~5 views/h, a grande, ~5000 views/h)",
    make: (r) => { const n = r.int(48, 168), b = r.logUniform(5, 5000), sd = r.uniform(0.06, 0.12); return toInts(Array.from({ length: n }, () => noisy(r, b, sd))); },
  },
  {
    name: "slow_growth", label: "legit", count: 100,
    note: "crescimento lento e contínuo (1,5x a 4x ao longo da série)",
    make: (r) => { const n = r.int(72, 168), b = r.logUniform(20, 2000), g = r.uniform(0.5, 3); return toInts(Array.from({ length: n }, (_, h) => noisy(r, b * (1 + (g * h) / n), 0.1))); },
  },
  {
    name: "viral_ramp_tail", label: "legit", count: 100,
    note: "viral de verdade: subida em rampa de 4 a 12 h, pico de 8x a 40x e cauda longa (meia-vida de 6 a 24 h)",
    make: (r) => viralCurve(r, 0.1),
  },
  {
    name: "seasonal_circadian", label: "legit", count: 100,
    note: "ciclo diário forte (amplitude de 30% a 80%) com fim de semana mais fraco",
    make: (r) => { const n = r.int(72, 168), b = r.logUniform(30, 3000), amp = r.uniform(0.3, 0.8); const bg = background(r, n, b, amp, 0.1); return toInts(bg.map((v, h) => (Math.floor(h / 24) % 7 >= 5 ? v * 0.75 : v))); },
  },
  {
    name: "old_video_decay", label: "legit", count: 100,
    note: "vídeo antigo com queda suave e contínua para 10% a 30% do início",
    make: (r) => { const n = r.int(72, 168), s0 = r.logUniform(100, 5000), end = r.uniform(0.1, 0.3); return toInts(Array.from({ length: n }, (_, h) => noisy(r, s0 * Math.pow(end, h / n), 0.1))); },
  },
  {
    name: "plausible_peak", label: "legit", count: 100,
    note: "pico legítimo plausível: compartilhamento súbito por conta grande (salto de 5x a 12x em 1 h, sem rampa) com cauda de meia-vida 2 a 10 h",
    make: (r) => {
      const n = r.int(72, 120), b = r.logUniform(50, 1500), m = r.uniform(5, 12), t0 = r.int(30, 50), half = r.uniform(2, 10);
      return toInts(background(r, n, b, 0.2, 0.1).map((v, h) => (h < t0 ? v : v + b * m * Math.pow(0.5, (h - t0) / half))));
    },
  },
  // --- suspeitos ---
  {
    name: "bought_step_plateau_drop", label: "suspicious", count: 50,
    note: "pico comprado: degrau de 6x a 15x que se mantém 10 a 30 h e termina em queda seca (esperado: suspicious)",
    make: (r) => boughtPlateau(r, { sd: 0.06, mechanical: false, endAbrupt: true }),
  },
  {
    name: "bought_mechanical_plateau", label: "suspicious", count: 50,
    note: "degrau comprado com taxa fixa (variação de 0,3%) e saída suave (esperado: suspicious por degrau + repetição)",
    make: (r) => boughtPlateau(r, { sd: 0, mechanical: true, endAbrupt: false }),
  },
  {
    name: "combo_all", label: "suspicious", count: 50,
    note: "degrau + taxa fixa + queda seca (esperado: suspicious com 3 sinais)",
    make: (r) => boughtPlateau(r, { sd: 0, mechanical: true, endAbrupt: true }),
  },
  {
    name: "mechanical_only", label: "suspicious", count: 50,
    note: "bloco de 8 a 20 h com taxa fixa no meio de uma curva humana, sem degrau (esperado: inconclusive, sinal isolado)",
    make: (r) => {
      const n = r.int(72, 120), b = r.logUniform(100, 1000), s = r.int(30, 50), d = r.int(8, 20), lvl = b * r.uniform(1, 1.6);
      return toInts(background(r, n, b, 0.3, 0.1).map((v, h) => (h >= s && h < s + d ? lvl * (1 + 0.003 * r.gauss()) : v)));
    },
  },
  {
    name: "ramped_plateau_drop", label: "suspicious", count: 50,
    note: "subida disfarçada em rampa de 6 h até um patamar 4x a 8x, depois queda seca (esperado: inconclusive, só abrupt_drop)",
    make: (r) => {
      const n = r.int(96, 140), b = r.logUniform(100, 1000), s = r.int(30, 40), ramp = 6, dur = r.int(6, 18), m = r.uniform(4, 8);
      return toInts(background(r, n, b, 0.3, 0.1).map((v, h) => {
        if (h < s) return v;
        if (h < s + ramp) return v * (1 + (m - 1) * ((h - s + 1) / ramp));
        if (h < s + ramp + dur) return noisy(r, b * m, 0.06);
        return v;
      }));
    },
  },
  {
    name: "single_hour_spike", label: "suspicious", count: 50,
    note: "pico comprado de 1 hora (6x a 20x) que some na hora seguinte (esperado: inconclusive, só step_spike)",
    make: (r) => {
      const n = r.int(72, 120), b = r.logUniform(100, 1000), t = r.int(30, 60), m = r.uniform(6, 20);
      return toInts(background(r, n, b, 0.3, 0.1).map((v, h) => (h === t ? v * m : v)));
    },
  },
  {
    name: "diluted_spike", label: "suspicious", count: 50,
    note: "EVASIVA: views compradas diluídas em 10 a 24 h com subida e descida suaves (esperado: organic, não detectado)",
    make: (r) => {
      const n = r.int(96, 140), b = r.logUniform(100, 1000), s = r.int(30, 40), d = r.int(10, 24), m = r.uniform(1.5, 3);
      return toInts(background(r, n, b, 0.3, 0.1).map((v, h) => (h >= s && h < s + d ? v * (1 + (m - 1) * Math.sin((Math.PI * (h - s)) / d)) : v)));
    },
  },
  {
    name: "bot_mimics_organic", label: "suspicious", count: 50,
    note: "EVASIVA: bots programados para reproduzir a curva de um viral (rampa e cauda) com ruído (esperado: organic, não detectado)",
    make: (r) => viralCurve(r, 0.12),
  },
];

export function generateDataset(seed: number = DATASET_SEED): Sample[] {
  const out: Sample[] = [];
  for (const [fi, f] of FAMILIES.entries()) {
    // Um PRNG por família: mudar o tamanho de uma família não desloca as outras.
    const r = createRng(seed + fi * 1000003);
    for (let i = 0; i < f.count; i++) {
      out.push({ id: `${f.name}-${String(i).padStart(3, "0")}`, family: f.name, label: f.label, views: f.make(r) });
    }
  }
  return out;
}
