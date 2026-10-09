import { classify } from "./classify.ts";
import { FAMILIES, generateDataset, DATASET_SEED, type Sample } from "./dataset.ts";
import type { Classification } from "./types.ts";

export interface Counts { total: number; organic: number; suspicious: number; inconclusive: number }
export interface Report {
  seed: number;
  legit: Counts;
  suspicious: Counts;
  false_positive_rate: number;
  legit_inconclusive_rate: number;
  detection_rate: number;
  suspicious_inconclusive_rate: number;
  suspicious_missed_as_organic_rate: number;
  families: Record<string, Counts & { label: string }>;
  /** Mesma avaliação com a regra antiga (repetição fraca, CV < 2%, também conta). Só para comparação. */
  legacy: { legit: Counts; suspicious: Counts; families: Record<string, Counts> };
}

const empty = (): Counts => ({ total: 0, organic: 0, suspicious: 0, inconclusive: 0 });
const add = (c: Counts, k: Classification) => { c.total++; c[k]++; };

export function evaluate(samples: Sample[] = generateDataset(DATASET_SEED), seed = DATASET_SEED): Report {
  const legit = empty(), sus = empty();
  const families: Report["families"] = {};
  const legacy: Report["legacy"] = { legit: empty(), suspicious: empty(), families: {} };
  for (const f of FAMILIES) {
    families[f.name] = { ...empty(), label: f.label };
    legacy.families[f.name] = empty();
  }
  for (const s of samples) {
    const k = classify(s.views).classification;
    add(s.label === "legit" ? legit : sus, k);
    add(families[s.family]!, k);
    const old = classify(s.views, { countWeakMechanical: true }).classification;
    add(s.label === "legit" ? legacy.legit : legacy.suspicious, old);
    add(legacy.families[s.family]!, old);
  }
  return {
    seed,
    legit,
    suspicious: sus,
    false_positive_rate: legit.suspicious / legit.total,
    legit_inconclusive_rate: legit.inconclusive / legit.total,
    detection_rate: sus.suspicious / sus.total,
    suspicious_inconclusive_rate: sus.inconclusive / sus.total,
    suspicious_missed_as_organic_rate: sus.organic / sus.total,
    families,
    legacy,
  };
}

const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(2).replace(".", ",")}%`;

/** Texto que vai entre os marcadores do README. Única fonte do formato. */
export function readmeBlocks(r: Report): Record<string, string> {
  return {
    "fp-rate": `${r.legit.suspicious} de ${r.legit.total} legítimos classificados como suspicious (${pct(r.legit.suspicious, r.legit.total)})`,
    "legit-inconclusive": `${r.legit.inconclusive} de ${r.legit.total} legítimos classificados como inconclusive (${pct(r.legit.inconclusive, r.legit.total)})`,
    "noise-fp": noiseTable(r),
    "scenarios": scenarioTable(r),
    "before-after": beforeAfter(r),
    "families-list": familiesList(),
    "families": `\n${familyTable(r)}\n`,
    "detection": `${r.suspicious.suspicious} de ${r.suspicious.total} suspeitos classificados como suspicious (${pct(r.suspicious.suspicious, r.suspicious.total)}); ${r.suspicious.inconclusive} inconclusive (${pct(r.suspicious.inconclusive, r.suspicious.total)}); ${r.suspicious.organic} passaram como organic (${pct(r.suspicious.organic, r.suspicious.total)})`,
  };
}

export function marker(name: string, text: string): string {
  return `<!-- ${name}:start -->${text}<!-- ${name}:end -->`;
}

export function extractMarker(readme: string, name: string): string | null {
  const m = readme.match(new RegExp(`<!-- ${name}:start -->([\\s\\S]*?)<!-- ${name}:end -->`));
  return m ? m[1]! : null;
}

export function familyTable(r: Report): string {
  const rows = FAMILIES.map((f) => {
    const c = r.families[f.name]!;
    return `| ${f.name} | ${f.label === "legit" ? "legítimo" : "suspeito"} | ${c.total} | ${c.organic} | ${c.inconclusive} | ${c.suspicious} |`;
  });
  return ["| família | tipo | total | organic | inconclusive | suspicious |", "|---|---|---|---|---|---|", ...rows].join("\n");
}

/** Falso positivo por nível de ruído do platô legítimo (famílias plateau_noise_*). */
export function noiseTable(r: Report): string {
  const rows = [2, 3, 4].map((pct) => {
    const c = r.families[`plateau_noise_${pct}pct`]!;
    return `| ${pct}% | ${c.total} | ${c.suspicious} (${pct2(c.suspicious, c.total)}) | ${c.inconclusive} | ${c.organic} |`;
  });
  return ["", "| ruído do platô | total | suspicious (falso positivo) | inconclusive | organic |", "|---|---|---|---|---|", ...rows, ""].join("\n");
}
const pct2 = (n: number, d: number) => `${((100 * n) / d).toFixed(2).replace(".", ",")}%`;

/** Lista das famílias do dataset (nome e tamanho) para o README não divergir do código. */
export function familiesList(): string {
  const fmt = (label: string) =>
    FAMILIES.filter((f) => f.label === label).map((f) => `\`${f.name}\` (${f.count})`).join(", ");
  return `\n- Legítimas: ${fmt("legit")}.\n- Suspeitas: ${fmt("suspicious")}.\n`;
}

/** Falso positivo por cenário de risco, antes (regra de 2%) e depois (regra atual). */
export function scenarioTable(r: Report): string {
  const rows = FAMILIES.filter((f) => f.name.startsWith("risk_")).map((f) => {
    const now = r.families[f.name]!;
    const old = r.legacy.families[f.name]!;
    return `| ${f.name} | ${now.total} | ${old.suspicious} (${pct2(old.suspicious, old.total)}) | ${now.suspicious} (${pct2(now.suspicious, now.total)}) | ${now.inconclusive} | ${now.organic} |`;
  });
  return ["", "| cenário legítimo | total | acusados antes (regra de 2%) | acusados depois (regra atual) | inconclusive depois | organic depois |", "|---|---|---|---|---|---|", ...rows, ""].join("\n");
}

/** Taxas globais antes (regra de 2%) e depois, para o README mostrar a mudança sem esconder. */
export function beforeAfter(r: Report): string {
  const L = r.legacy;
  const line = (tag: string, legit: Counts, sus: Counts) =>
    `${tag}: FP ${legit.suspicious}/${legit.total} (${pct2(legit.suspicious, legit.total)}), ` +
    `inconclusive entre legítimos ${legit.inconclusive}/${legit.total} (${pct2(legit.inconclusive, legit.total)}), ` +
    `detecção ${sus.suspicious}/${sus.total} (${pct2(sus.suspicious, sus.total)})`;
  return `\n- ${line("Antes (repetição de CV < 2% conta)", L.legit, L.suspicious)}\n- ${line("Depois (só CV < 0,5% ou diferença constante)", r.legit, r.suspicious)}\n`;
}
