import * as T from "./thresholds.ts";
import type { Signal } from "./types.ts";

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const round = (n: number) => Math.round(n);

function notTriggered(name: Signal["name"]): Signal {
  return { name, triggered: false, description: "", evidence: null };
}

/** Pico em degrau: salto brusco, sem subida gradual antes e sem decaimento depois. */
export function stepSpike(views: number[]): Signal {
  for (let i = 1; i < views.length; i++) {
    const window = views.slice(Math.max(0, i - T.STEP_BASELINE_WINDOW), i);
    if (window.length < T.STEP_MIN_BASELINE_POINTS) continue;
    const baseline = Math.max(median(window), 1);
    const value = views[i]!;
    if (value < T.STEP_JUMP_RATIO * baseline || value - baseline < T.STEP_MIN_ABSOLUTE_JUMP) continue;

    const before = views.slice(Math.max(0, i - T.STEP_RAMP_LOOKBACK), i);
    if (before.some((v) => v >= T.STEP_RAMP_RATIO * baseline)) continue; // houve rampa

    const after = views.slice(i + 1, i + 1 + T.STEP_HOLD_HOURS);
    const holds = after.length === T.STEP_HOLD_HOURS && after.every((v) => v >= T.STEP_HOLD_FRACTION * value);
    const returnsToBase = after.length > 0 && after[0]! <= T.STEP_RETURN_RATIO * baseline;
    if (!holds && !returnsToBase) continue; // há decaimento gradual

    const ratio = Math.round((value / baseline) * 10) / 10;
    return {
      name: "step_spike",
      triggered: true,
      description:
        `salto de ${ratio}x na hora ${i} (de cerca de ${round(baseline)} para ${value} views/h) ` +
        `sem subida gradual antes e ${holds ? "sem queda gradual depois (o patamar se manteve)" : "com volta imediata ao normal na hora seguinte"}`,
      evidence: { hour_index: i, value, baseline: round(baseline) },
    };
  }
  return notTriggered("step_spike");
}

function windowStats(w: number[]): { mean: number; cv: number } {
  const mean = w.reduce((a, b) => a + b, 0) / w.length;
  if (mean === 0) return { mean, cv: Infinity };
  const variance = w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length;
  return { mean, cv: Math.sqrt(variance) / mean };
}

/** Repetição mecânica: horas seguidas idênticas demais (ou crescendo sempre o mesmo tanto). */
export function mechanicalRepeat(views: number[]): Signal {
  const n = T.MECH_MIN_HOURS;
  const seriesMedian = round(median(views));
  for (let s = 0; s + n <= views.length; s++) {
    const w = views.slice(s, s + n);
    const { mean, cv } = windowStats(w);
    if (mean < T.MECH_MIN_MEAN) continue;
    const step = w[1]! - w[0]!;
    const linear = step !== 0 && w.every((v, k) => k === 0 || v - w[k - 1]! === step);
    if (cv < T.MECH_MAX_CV || linear) {
      const what = linear
        ? `crescendo exatamente ${Math.abs(step)} views a cada hora`
        : `com variação de apenas ${(cv * 100).toFixed(1)}% (audiência humana oscila bem mais)`;
      return {
        name: "mechanical_repeat",
        triggered: true,
        description: `${n} horas seguidas a partir da hora ${s} com cerca de ${round(mean)} views/h, ${what}`,
        evidence: { hour_index: s, value: round(mean), baseline: seriesMedian },
      };
    }
  }
  return notTriggered("mechanical_repeat");
}

/** Queda abrupta: platô alto por algumas horas e depois perda de >= 80% em 1 hora. */
export function abruptDrop(views: number[]): Signal {
  const baseline = Math.max(median(views), 1);
  const need = T.DROP_PLATEAU_HOURS;
  for (let i = need; i < views.length; i++) {
    const plateau = views.slice(i - need, i);
    if (!plateau.every((v) => v > T.DROP_PLATEAU_RATIO * baseline)) continue;
    const prev = views[i - 1]!;
    const value = views[i]!;
    if (value > T.DROP_MAX_REMAINING * prev || prev - value < T.DROP_MIN_ABSOLUTE) continue;
    const pct = Math.round((1 - value / prev) * 100);
    return {
      name: "abrupt_drop",
      triggered: true,
      description:
        `queda de ${pct}% em 1 hora na hora ${i} (de ${prev} para ${value} views/h) ` +
        `depois de pelo menos ${need} horas em patamar acima de ${T.DROP_PLATEAU_RATIO}x o normal (${round(baseline)} views/h)`,
      evidence: { hour_index: i, value, baseline: round(baseline) },
    };
  }
  return notTriggered("abrupt_drop");
}
