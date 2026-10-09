# Tasks

| ID | Tarefa | Depende | Verificação | Feito |
| --- | --- | --- | --- | --- |
| T1 | Scaffold + spec + tasks | - | `npm install` | [x] |
| T| `thresholds.ts` + detectores puros (`signals.ts`), testes primeiro | T1 | test/signals | [x] |
| T| `classify.ts` decisão + motivo PT-BR, testes primeiro | T2 | test/classify | [x] |
| T| API Hono (`app.ts`, `index.ts`), testes primeiro | T3 | test/api | [x] |
| T| PRNG + geradores do dataset (`rng.ts`, `dataset.ts`) | T1 | test/dataset reprodutibilidade | [x] |
| T| Avaliação + `npm run dataset` + marcadores no README + teste de coerência | T3,T5 | test/readme | [x] |
| T| README, verificação (mutações, curl) | T4,T6 | relatório | [x] |

## Revisão pós-revisão independente

| ID | Tarefa | Verificação | Feito |
| --- | --- | --- | --- |
| R1 | Testes vermelhos: mesmo platô conta como um evento + sondas do revisor | test/classify | [x] |
| R2 | `groups`/`plateau_event`, decisão por eventos, plural da série curta | test/classify | [x] |
| R3 | Testes de fronteira dos limiares + mutações | test/signals | [x] |
| R4 | Famílias legítimas de platô no dataset, taxas regeneradas | npm run dataset | [x] |
| R5 | Teste de coerência cobre tabela por família + recontagem independente | test/readme | [x] |
| R6 | README e .specs atualizados | revisão | [x] |

## Segunda revisão independente

| ID | Tarefa | Verificação | Feito |
| --- | --- | --- | --- |
| S1 | Dataset: platôs legítimos com ruído 2/3/4%, FP por ruído e lista de famílias verificados | test/readme | [x] |
| S2 | Fusão só no mesmo platô (queda depois do salto, <= 48 h) | test/classify | [x] |
| S3 | `isSafeInteger` na validação | test/api | [x] |
| S4 | Mecânica fora do platô como segundo evento; famílias suspeitas com dois trechos | test/classify, npm run dataset | [x] |
| S5 | README, engines >= 22.13 e .specs | revisão | [x] |

## Terceira revisão independente

| ID | Tarefa | Verificação | Feito |
| --- | --- | --- | --- |
| U1 | Texto do platô longo; bordas da exclusão do platô | test/classify, test/signals | [x] |
| U2 | Cenários legítimos `risk_*` no dataset | npm run dataset | [x] |
| U3 | Repetição forte x fraca (`MECH_STRONG_CV`) | test/signals, test/classify | [x] |
| U4 | Tabela antes/depois por cenário e globais no README, verificadas por teste | test/readme | [x] |

## Ajustes finais (revisão final)

| ID | Tarefa | Verificação | Feito |
| --- | --- | --- | --- |
| V1 | Teste da fronteira exata de 48 h | test/classify + mutação | [x] |
| V2 | Sensibilidade a Poisson, decomposição do FP, cenários de dois platôs | npm run dataset, test/readme | [x] |
| V3 | README: justificativa do 0,5%, limites, histórico por commit | revisão | [x] |
