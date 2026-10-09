# Classificador de views por hora: especificação

## Problema
Marca paga criador por alcance. Pico comprado, repetição mecânica e queda abrupta inflam o número. Falso positivo também custa: criador honesto não pode ser punido por vídeo que estourou de verdade. Por isso o classificador é explicável e prefere não acusar quando a evidência é fraca.

## Fora de escopo
| Item | Motivo |
| --- | --- |
| Modelo estatístico/ML | enunciado pede classificador explicável |
| Dados de redes sociais reais | dataset sintético, sem rede |
| Origem das contas, ritmo circadiano | não observáveis numa série de views por hora (circadiano fica fora por decisão do grill) |
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
| VIEW-07 | Decisão: >= 2 sinais -> `suspicious`; 1 -> `inconclusive`; 0 -> `organic`. |
| VIEW-08 | Resposta `{classification, reason, signals:[{name, triggered, description, evidence:{hour_index,value,baseline}\|null}]}`; `reason` em PT-BR legível sem conhecer o código. |
| VIEW-09 | Pico viral com rampa e/ou cauda NÃO é `suspicious`; teste mostra a diferença para o pico comprado. |
| VIEW-10 | Caso em que prefere não acusar (1 sinal) -> `inconclusive`, motivo diz por quê. |
| VIEW-11 | Dataset sintético reproduzível (PRNG com seed fixa, sem rede), famílias legítimas e suspeitas, tamanhos fixos. |
| VIEW-12 | `npm run dataset` gera `data/synthetic.json`, calcula as taxas, escreve `data/report.json` e imprime. |
| VIEW-13 | README traz as taxas entre marcadores; teste falha se divergirem do medido. |
| VIEW-14 | Relata taxa de FP (legítimos `suspicious`), taxa de `inconclusive` entre legítimos, taxa de detecção nos suspeitos (e por família). |
| VIEW-15 | README documenta critério, limiares e o que NÃO detecta. |
| VIEW-16 | `GET /health`, `POST /classify`. |

## Desvios / decisões além da spec
Registrados no README e no relatório de entrega.
