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
