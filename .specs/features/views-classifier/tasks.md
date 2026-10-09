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
