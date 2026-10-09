// Todos os limiares do classificador ficam aqui. Mexer em qualquer valor
// muda as taxas medidas por `npm run dataset`; o teste de coerência do README
// falha até que as taxas sejam regeneradas e revisadas.

/** Abaixo disso não há histórico para julgar: resposta `inconclusive`. */
export const MIN_SERIES_LENGTH = 24;

/** Máximo de pontos aceitos pela API (30 dias de horas). */
export const MAX_SERIES_LENGTH = 24 * 30;

// --- step_spike: pico em degrau, sem rampa e sem decaimento ---
/** Janela (horas) usada para a mediana "normal" antes do salto. */
export const STEP_BASELINE_WINDOW = 24;
/** Mínimo de pontos na janela para a mediana valer. */
export const STEP_MIN_BASELINE_POINTS = 6;
/** Salto: valor da hora >= este múltiplo da mediana da janela. */
export const STEP_JUMP_RATIO = 5;
/** Salto também precisa somar pelo menos tantas views/h acima da base (evita acusar ruído de canal pequeno). */
export const STEP_MIN_ABSOLUTE_JUMP = 50;
/** Rampa: quantas horas antes do salto procuramos subida gradual. */
export const STEP_RAMP_LOOKBACK = 3;
/** Rampa: algum ponto prévio >= este múltiplo da mediana significa subida gradual. */
export const STEP_RAMP_RATIO = 2;
/** Sem decaimento: quantas horas depois do pico precisam ficar altas. */
export const STEP_HOLD_HOURS = 6;
/** Sem decaimento: fração do pico que as horas seguintes devem manter. */
export const STEP_HOLD_FRACTION = 0.8;
/** Sem decaimento (variante): volta à base em 1 h = próximo ponto <= este múltiplo da mediana. */
export const STEP_RETURN_RATIO = 2;

// --- mechanical_repeat: repetição mecânica ---
/** Horas seguidas necessárias. */
export const MECH_MIN_HOURS = 8;
/** Coeficiente de variação (desvio/média) abaixo disso aparece como evidência FRACA (não conta para acusar). */
export const MECH_MAX_CV = 0.02;
/**
 * Abaixo disso (ou com diferenças consecutivas exatamente constantes) a evidência é FORTE e
 * pode contar como evento. Escolha do autor, após o revisor mostrar que 2% gera falso positivo
 * por acaso em canais estáveis: contagem puramente aleatória (Poisson) já varia 1/raiz(média),
 * ou seja, 0,5% só seria "natural" acima de ~40 mil views/h; abaixo disso, 0,5% é menos ruído
 * do que o sorteio sozinho produziria. Não foi ajustado olhando o dataset.
 */
export const MECH_STRONG_CV = 0.005;
/** Média mínima (views/h) na janela; abaixo disso contagem baixa repete por acaso (ex.: 0 views). */
export const MECH_MIN_MEAN = 50;

// --- abrupt_drop: queda abrupta depois de platô ---
/** Horas de platô alto antes da queda. */
export const DROP_PLATEAU_HOURS = 3;
/** Platô: cada hora > este múltiplo da mediana da série. */
export const DROP_PLATEAU_RATIO = 3;
/** Queda: valor da hora <= esta fração da hora anterior (queda >= 80%). */
export const DROP_MAX_REMAINING = 0.2;
/** Queda também precisa perder pelo menos tantas views/h. */
export const DROP_MIN_ABSOLUTE = 50;

// --- decisão ---
/** Salto e queda só contam como o MESMO platô se a queda vem depois do salto, a no máximo tantas horas. */
export const PLATEAU_MAX_HOURS = 48;
/**
 * Eventos independentes necessários para `suspicious`. Os sinais step_spike e abrupt_drop
 * descrevem o mesmo platô e contam como UM evento (`plateau_event`); mechanical_repeat é
 * o outro. Com 1 evento a resposta é `inconclusive`.
 */
export const MIN_GROUPS_TO_ACCUSE = 2;
