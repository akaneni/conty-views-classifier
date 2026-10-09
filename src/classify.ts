import { abruptDrop, mechanicalRepeat, stepSpike } from "./signals.ts";
import * as T from "./thresholds.ts";
import type { Signal, SignalName, Verdict } from "./types.ts";

// Por que cada sinal sozinho não basta: o que de legítimo também produz aquilo.
const LEGIT_CAUSE: Record<SignalName, string> = {
  step_spike: "um vídeo divulgado de repente por uma conta grande também pode dar um salto assim",
  mechanical_repeat: "tráfego estável de um canal grande, ou uma série arredondada pela plataforma, pode ficar muito parecido de uma hora para outra",
  abrupt_drop: "a plataforma pode ter retirado o vídeo de uma recomendação ou recontado views, o que também derruba a audiência de uma vez",
};

export function classify(views: number[]): Verdict {
  if (views.length < T.MIN_SERIES_LENGTH) {
    return {
      classification: "inconclusive",
      reason:
        `Série curta: recebi ${views.length} horas e preciso de pelo menos ${T.MIN_SERIES_LENGTH} para saber o que é normal nesse vídeo. ` +
        `Sem isso prefiro não acusar nem liberar.`,
      signals: (["step_spike", "mechanical_repeat", "abrupt_drop"] as const).map((name) => ({
        name,
        triggered: false,
        description: "",
        evidence: null,
      })),
    };
  }

  const signals: Signal[] = [stepSpike(views), mechanicalRepeat(views), abruptDrop(views)];
  const hit = signals.filter((s) => s.triggered);

  if (hit.length >= T.MIN_SIGNALS_TO_ACCUSE) {
    return {
      classification: "suspicious",
      reason:
        `Suspeita: ${hit.length} sinais de audiência não humana apareceram juntos. ` +
        hit.map((s, i) => `${i + 1}) ${s.description}`).join("; ") +
        `.`,
      signals,
    };
  }
  if (hit.length === 1) {
    const s = hit[0]!;
    return {
      classification: "inconclusive",
      reason:
        `Prefiro não acusar: apareceu só um sinal (${s.description}). ` +
        `Um sinal isolado não prova nada, porque ${LEGIT_CAUSE[s.name]}. ` +
        `Só marco como suspeito com pelo menos ${T.MIN_SIGNALS_TO_ACCUSE} sinais concordantes.`,
      signals,
    };
  }
  return {
    classification: "organic",
    reason:
      `Nenhum dos três sinais procurados apareceu (salto brusco sem subida gradual, ` +
      `${T.MECH_MIN_HOURS} horas seguidas idênticas, queda seca depois de patamar alto). ` +
      `A curva é compatível com audiência humana, dentro do que este classificador consegue checar.`,
    signals,
  };
}
