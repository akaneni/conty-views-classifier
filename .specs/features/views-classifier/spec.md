# Classificador de views por hora: especificação

## Problema
Marca paga criador por alcance. Pico comprado, repetição mecânica e queda abrupta inflam o número. Falso positivo também custa: criador honesto não pode ser punido por vídeo que estourou de verdade. Por isso o classificador é explicável e prefere não acusar quando a evidência é fraca.

## Fora de escopo
| Item | Motivo |
| --- | --- |
| Modelo estatístico/ML | enunciado pede classificador explicável |
| Dados de redes sociais reais | dataset sintético, sem rede |
| Origem das contas, ritmo circadiano | não observáveis numa série de views por hora (circadiano fica fora por decisão do grill)
| Acusar pico comprado em degrau sem repetição mecânica | indistinguível de platô legítimo com views por hora; decisão do autor: não acusar | |
| Persistência / autenticação | API sem estado |

## Requisitos
| ID | Requisito |
| --- | --- |
| VIEW-01 | Entrada: `views_per_hour` = lista de inteiros >= 0. Corpo inválido -> 400 `{error}` PT-BR. |
| VIEW-02 | Série com menos de 24 pontos -> `inconclusive`, motivo "série curta". |
| VIEW-03 | Sinal `step_spike`: salto >= 5x a mediana das 24 h anteriores em 1 h, sem rampa (nenhum dos 3 pontos prévios >= 2x a mediana) e sem decaimento (6 h seguintes >= 80% do pico, ou volta a <= 2x a base em 1 h). |
| VIEW-04 | Sinal `mechanical_repeat`: >= 8 horas seguidas com coeficiente de variação < 2% (ou diferenças consecutivas constantes e não nulas), com média mínima. |
| VIEW-05 | Sinal `abrupt_drop`: queda >= 80% em 1 h depois de >= 3 h em platô acima de 3x a mediana da série. |
| VIEW-06 | Todos os limiares nomeados em um único arquivo `src/thresholds.ts`. |
| VIEW-07 | Decisão por **eventos independentes**: `step_spike` + `abrupt_drop` do mesmo platô contam como 1 evento (`plateau_event`); `mechanical_repeat` é o outro. >= 2 eventos -> `suspicious`; 1 -> `inconclusive`; 0 -> `organic`. (Revisado após revisão independente: antes eram >= 2 sinais.) `step_spike` e `abrupt_drop` só se fundem se a queda vier depois do salto e a <= `PLATEAU_MAX_HOURS` (48 h); senão são dois platôs separados contados como um grupo (sem acusar a mais), com start/end nulos. |
| VIEW-20 | `mechanical_repeat` só conta como segundo evento se a janela de 8 h não tocar o trecho do platô (definição no README); dentro do platô faz parte do mesmo evento. Consequência: só se acusa com evidência em dois trechos independentes. |
| VIEW-21 | Validação usa `Number.isSafeInteger`; `engines` node >= 22.13. |
| VIEW-22 | Dataset inclui platôs legítimos com ruído de 2%, 3% e 4%; o README traz FP por nível de ruído, verificado por teste, e a lista de famílias, também verificada. |
| VIEW-08 | Resposta `{classification, reason, signals:[{name, triggered, description, evidence:{hour_index,value,baseline}\|null}], groups:[{name, triggered, signals, start_hour, end_hour}]}`; `reason` em PT-BR legível sem conhecer o código. |
| VIEW-09 | Pico viral com rampa e/ou cauda NÃO é `suspicious`; teste mostra a diferença para o pico comprado. |
| VIEW-10 | Caso em que prefere não acusar (1 sinal) -> `inconclusive`, motivo diz por quê. |
| VIEW-11 | Dataset sintético reproduzível (PRNG com seed fixa, sem rede), famílias legítimas e suspeitas, tamanhos fixos. |
| VIEW-12 | `npm run dataset` gera `data/synthetic.json`, calcula as taxas, escreve `data/report.json` e imprime. |
| VIEW-13 | README traz as taxas entre marcadores; teste falha se divergirem do medido. |
| VIEW-14 | Relata taxa de FP (legítimos `suspicious`), taxa de `inconclusive` entre legítimos, taxa de detecção nos suspeitos (e por família). |
| VIEW-15 | README documenta critério, limiares e o que NÃO detecta. |
| VIEW-17 | Platô legítimo (live, página inicial, evento semanal, canal pequeno) com ruído natural não vira `suspicious`; famílias de dataset e testes de regressão cobrem. Platô com taxa perfeitamente fixa é acusado (limite conhecido). |
| VIEW-18 | Testes de fronteira de cada limiar (4,9x/5x, 79%/80%, média 49/50, CV, horas). |
| VIEW-19 | O teste do README compara também a tabela por família e recontagem independente do FP. |
| VIEW-16 | `GET /health`, `POST /classify`. |

## Desvios / decisões além da spec
Registrados no README e no relatório de entrega.
