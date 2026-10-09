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
  groups: Group[];
}

export type GroupName = "plateau_event" | "mechanical_repeat";

/** Evento independente: sinais que descrevem o mesmo fenômeno contam uma vez só. */
export interface Group {
  name: GroupName;
  triggered: boolean;
  /** Sinais internos que dispararam neste evento. */
  signals: SignalName[];
  /** Hora em que o evento começa (null se não disparou ou não se sabe). */
  start_hour: number | null;
  /** Hora em que o evento termina (null se não disparou ou não se sabe). */
  end_hour: number | null;
}
