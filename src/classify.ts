import { abruptDrop, mechanicalRepeat, stepSpike } from "./signals.ts";
import * as T from "./thresholds.ts";
import type { Group, Signal, Verdict } from "./types.ts";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const NOT_ENOUGH =
  `Só marco como suspeito com pelo menos ${T.MIN_GROUPS_TO_ACCUSE} eventos independentes ` +
  `(por exemplo, um platô e também repetição mecânica).`;

/** Salto e queda são o mesmo platô: a queda vem depois do salto e a até PLATEAU_MAX_HOURS dele. */
function samePlateau(step: Signal, drop: Signal): boolean {
  if (!step.triggered || !drop.triggered) return false;
  const gap = drop.evidence!.hour_index - step.evidence!.hour_index;
  return gap > 0 && gap <= T.PLATEAU_MAX_HOURS;
}

function buildGroups(step: Signal, mech: Signal, drop: Signal): Group[] {
  const plateauSignals = [step, drop].filter((s) => s.triggered);
  const both = step.triggered && drop.triggered;
  const merged = samePlateau(step, drop);
  return [
    {
      name: "plateau_event",
      triggered: plateauSignals.length > 0,
      signals: plateauSignals.map((s) => s.name),
      // Com dois sinais que não são do mesmo platô, não afirmamos início nem fim.
      start_hour: both && !merged ? null : (step.evidence?.hour_index ?? null),
      end_hour: both && !merged ? null : (drop.evidence?.hour_index ?? null),
    },
    {
      name: "mechanical_repeat",
      triggered: mech.triggered,
      signals: mech.triggered ? ["mechanical_repeat"] : [],
      start_hour: mech.evidence?.hour_index ?? null,
      end_hour: null,
    },
  ];
}

/** Frase única que descreve o evento do platô (um ou dois sinais do mesmo fenômeno). */
function plateauText(step: Signal, drop: Signal): string {
  if (step.triggered && drop.triggered) {
    if (samePlateau(step, drop)) {
      return `um platô: ${step.description}; e ${drop.description}. O salto e a queda são o mesmo platô e contam como um evento só`;
    }
    return (
      `dois platôs separados (a queda não vem logo depois do salto, então não formam um único platô): ` +
      `${step.description}; e, em outro trecho, ${drop.description}. ` +
      `Para não acusar a mais, os dois contam como um evento só`
    );
  }
  return `um platô: ${(step.triggered ? step : drop).description}`;
}

function eventTexts(groups: Group[], step: Signal, mech: Signal, drop: Signal): string[] {
  const out: string[] = [];
  if (groups[0]!.triggered) out.push(plateauText(step, drop));
  if (groups[1]!.triggered) out.push(mech.description);
  return out;
}

export function classify(views: number[]): Verdict {
  if (views.length < T.MIN_SERIES_LENGTH) {
    const none = (name: Signal["name"]): Signal => ({ name, triggered: false, description: "", evidence: null });
    const signals = [none("step_spike"), none("mechanical_repeat"), none("abrupt_drop")];
    return {
      classification: "inconclusive",
      reason:
        `Série curta: recebi ${plural(views.length, "hora", "horas")} e preciso de pelo menos ${T.MIN_SERIES_LENGTH} ` +
        `para saber o que é normal nesse vídeo. Sem isso prefiro não acusar nem liberar.`,
      signals,
      groups: buildGroups(signals[0]!, signals[1]!, signals[2]!),
    };
  }

  const step = stepSpike(views);
  const mech = mechanicalRepeat(views);
  const drop = abruptDrop(views);
  const signals: Signal[] = [step, mech, drop];
  const groups = buildGroups(step, mech, drop);
  const hit = groups.filter((g) => g.triggered);
  const texts = eventTexts(groups, step, mech, drop);

  if (hit.length >= T.MIN_GROUPS_TO_ACCUSE) {
    return {
      classification: "suspicious",
      reason:
        `Suspeita: ${hit.length} eventos independentes de audiência não humana apareceram juntos. ` +
        texts.map((t, i) => `(${i + 1}) ${t}.`).join(" "),
      signals,
      groups,
    };
  }
  if (hit.length === 1) {
    const g = hit[0]!;
    const why =
      g.name === "plateau_event"
        ? `Um platô isolado também acontece em casos legítimos (uma live, destaque na página inicial, divulgação por conta grande, newsletter semanal), então não basta para acusar.`
        : `Repetição mecânica isolada também pode vir de um canal grande e estável ou de dados arredondados pela plataforma, então não basta para acusar.`;
    return {
      classification: "inconclusive",
      reason: `Prefiro não acusar: apareceu só um evento, ${texts[0]}. ${why} ${NOT_ENOUGH}`,
      signals,
      groups,
    };
  }
  return {
    classification: "organic",
    reason:
      `Nenhum dos três sinais procurados apareceu (salto brusco sem subida gradual, ` +
      `${T.MECH_MIN_HOURS} horas seguidas idênticas, queda seca depois de patamar alto). ` +
      `A curva é compatível com audiência humana, dentro do que este classificador consegue checar.`,
    signals,
    groups,
  };
}
