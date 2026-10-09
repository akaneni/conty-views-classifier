# Tasks

| ID | Tarefa | Depende | Verificação | Feito |
| --- | --- | --- | --- | --- |
| T1 | Scaffold + spec + tasks | - | `npm install` | [x] |
| T2 | `thresholds.ts` + detectores puros (`signals.ts`), testes primeiro | T1 | test/signals | [ ] |
| T3 | `classify.ts` decisão + motivo PT-BR, testes primeiro | T2 | test/classify | [ ] |
| T4 | API Hono (`app.ts`, `index.ts`), testes primeiro | T3 | test/api | [ ] |
| T5 | PRNG + geradores do dataset (`rng.ts`, `dataset.ts`) | T1 | test/dataset reprodutibilidade | [ ] |
| T6 | Avaliação + `npm run dataset` + marcadores no README + teste de coerência | T3,T5 | test/readme | [ ] |
| T7 | README, verificação (mutações, curl) | T4,T6 | relatório | [ ] |
