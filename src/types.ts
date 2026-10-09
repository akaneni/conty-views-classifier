export type SignalName = "step_spike" | "mechanical_repeat" | "abrupt_drop";

export interface Evidence {
  hour_index: number;
  value: number;
  baseline: number;
}

export interface Signal {
  name: SignalName;
  triggered: boolean;
  /** Frase em PT-BR descrevendo o que foi visto (vazia se não disparou). */
  description: string;
  evidence: Evidence | null;
}

export type Classification = "organic" | "suspicious" | "inconclusive";

export interface Verdict {
  classification: Classification;
  reason: string;
  signals: Signal[];
}
