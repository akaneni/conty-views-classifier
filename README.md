# conty-views-classifier

Classificador **explicável** de séries de views por hora. Recebe a série, devolve `organic`, `suspicious` ou `inconclusive`, um motivo em português e os sinais usados. Sem modelo opaco, sem estado, sem rede. Desafio 09 (views que não parecem humanas).

## Como rodar

```bash
npm install
npm test            # inclui o teste que compara o README com o dataset medido
npm run typecheck
npm run dev         # API em http://localhost:3000 (PORT para trocar)
npm run dataset     # gera data/synthetic.json + data/report.json e imprime as taxas
npm run dataset -- --update-readme   # reescreve só os números entre marcadores
```

## API

`GET /health` -> `{"status":"ok"}`

`POST /classify` com `{ "views_per_hour": [inteiros >= 0] }` (1 a 720 pontos). Corpo inválido -> `400 {"error":"..."}`. Menos de 24 pontos não é erro: volta `inconclusive` ("série curta").

```bash
curl -s localhost:3000/classify -H 'content-type: application/json' \
  -d '{"views_per_hour":[110,95,130,102,141,88,120,99,135,108,92,125,117,101,138,90,122,104,131,97,119,112,126,94,1500,1420,1560,1450,1530,1470,1510,1440,1490,1550,1460,1500,20,18,22]}'
```

Resposta (resumida): `classification: "suspicious"`, `reason: "Suspeita: 2 sinais de audiência não humana apareceram juntos. 1) salto de 13,5x na hora 24 (de cerca de 111 para 1500 views/h) sem subida gradual antes e sem queda gradual depois (o patamar se manteve); 2) queda de 99% em 1 hora na hora 36 (...)"` e `signals` com, para cada um dos três sinais, `name`, `triggered`, `description` (PT-BR) e `evidence: { hour_index, value, baseline }` (ou `null` quando não disparou).

## Critério

Três sinais, cada um com limiares nomeados em um único arquivo, [`src/thresholds.ts`](src/thresholds.ts):

| sinal | dispara quando | principais limiares |
|---|---|---|
| `step_spike` | uma hora vale >= 5x a mediana das 24 h anteriores (e pelo menos +50 views/h), **sem rampa** (nenhuma das 3 horas prévias >= 2x a mediana) e **sem decaimento** (as 6 h seguintes ficam >= 80% do pico, ou a hora seguinte volta a <= 2x a mediana) | `STEP_JUMP_RATIO`, `STEP_RAMP_*`, `STEP_HOLD_*` |
| `mechanical_repeat` | >= 8 horas seguidas com coeficiente de variação < 2%, ou diferenças consecutivas iguais e não nulas; média mínima de 50 views/h | `MECH_MIN_HOURS`, `MECH_MAX_CV`, `MECH_MIN_MEAN` |
| `abrupt_drop` | queda >= 80% em 1 h depois de >= 3 h acima de 3x a mediana da série (e perda de pelo menos 50 views/h) | `DROP_*` |

Decisão: **2 ou mais sinais -> `suspicious`; 1 sinal -> `inconclusive`; 0 -> `organic`**; menos de 24 pontos -> `inconclusive`. A ideia é que acusar criador honesto custa mais do que deixar passar um caso duvidoso, então um sinal isolado nunca acusa.

Os limiares vêm da spec do desafio e **não foram ajustados olhando o dataset**. Os mínimos absolutos (+50 views/h, 50 de média) são decisão minha para canal pequeno não disparar por ruído.

### Pico orgânico x pico comprado

O que separa os dois é o *caminho*, não a altura. Viral de verdade sobe em rampa e/ou decai devagar; o comprado salta de uma vez e fica no patamar (ou some de uma vez). Em `test/classify.test.ts` o mesmo pico de ~1500 views/h aparece nas duas formas: com rampa de 4 h e cauda de 12 h é `organic`; como degrau de 8 h com queda seca é `suspicious`. Um compartilhamento súbito por conta grande (salto de 1 h, cauda longa) também fica `organic`.

### Caso em que prefere não acusar

Um pico de 1 hora que some na hora seguinte dispara só `step_spike`. Resultado: `inconclusive`, com motivo "Prefiro não acusar: apareceu só um sinal (...). Um sinal isolado não prova nada, porque um vídeo divulgado de repente por uma conta grande também pode dar um salto assim. Só marco como suspeito com pelo menos 2 sinais concordantes." (teste: "um único sinal (pico de 1 hora que some) é inconclusive...").

## Dataset e taxas medidas

Dataset sintético, reproduzível: PRNG mulberry32 com seed fixa (`20260101`), um gerador por família, tamanhos fixos (100 por família legítima, 50 por suspeita; 600 legítimas e 400 suspeitas), nenhuma chamada de rede. Os números abaixo ficam entre marcadores e **o teste `test/readme.test.ts` falha se divergirem do medido por `npm run dataset`**.

- **Taxa de falso positivo** (legítimos `suspicious` / legítimos): <!-- fp-rate:start -->1 de 900 legítimos classificados como suspicious (0,11%)<!-- fp-rate:end -->
- **Inconclusive entre legítimos** (não escondido): <!-- legit-inconclusive:start -->286 de 900 legítimos classificados como inconclusive (31,78%)<!-- legit-inconclusive:end -->
- **Detecção nos suspeitos**: <!-- detection:start -->100 de 400 suspeitos classificados como suspicious (25,00%); 198 inconclusive (49,50%); 102 passaram como organic (25,50%)<!-- detection:end -->

Por família:

<!-- families:start -->
| família | tipo | total | organic | inconclusive | suspicious |
|---|---|---|---|---|---|
| stable | legítimo | 100 | 96 | 4 | 0 |
| slow_growth | legítimo | 100 | 99 | 1 | 0 |
| viral_ramp_tail | legítimo | 100 | 87 | 13 | 0 |
| seasonal_circadian | legítimo | 100 | 100 | 0 | 0 |
| old_video_decay | legítimo | 100 | 100 | 0 | 0 |
| plausible_peak | legítimo | 100 | 98 | 2 | 0 |
| plateau_live_frontpage | legítimo | 100 | 0 | 100 | 0 |
| weekly_event | legítimo | 100 | 0 | 99 | 1 |
| low_volume_plateau | legítimo | 100 | 33 | 67 | 0 |
| bought_step_plateau_drop | suspeito | 50 | 0 | 50 | 0 |
| bought_mechanical_plateau | suspeito | 50 | 0 | 0 | 50 |
| combo_all | suspeito | 50 | 0 | 0 | 50 |
| mechanical_only | suspeito | 50 | 0 | 50 | 0 |
| ramped_plateau_drop | suspeito | 50 | 6 | 44 | 0 |
| single_hour_spike | suspeito | 50 | 0 | 50 | 0 |
| diluted_spike | suspeito | 50 | 50 | 0 | 0 |
| bot_mimics_organic | suspeito | 50 | 46 | 4 | 0 |
<!-- families:end -->

Famílias legítimas: estável (de 5 a 5000 views/h), crescimento lento, viral com rampa e cauda, sazonal/circadiano com fim de semana, vídeo antigo com queda suave, pico plausível (salto súbito com cauda). Famílias suspeitas: pico comprado em degrau com queda, degrau com taxa fixa, combinação dos três sinais, repetição mecânica isolada, platô com rampa e queda seca, pico de 1 hora, e duas **evasivas** de propósito (pico diluído em muitas horas e bots que imitam a curva de um viral), que o classificador não pega.

### Leitura honesta dos números

- **O zero de falso positivo é fácil de obter aqui.** Eu escrevi o dataset e o classificador; os legítimos são curvas suaves com ruído gaussiano, sem as irregularidades de dados reais (cortes de coleta, picos de reprocessamento, contagem arredondada, canais enormes com variação de 1%). Zero falso positivo no sintético **não** é uma garantia para produção. Os limiares não foram mexidos para chegar a esse número.
- O que aparece como `inconclusive` entre legítimos é informativo: viral com rampa muito curta (4 h até 20-40x) tem a primeira hora da rampa com salto >= 5x, e dispara `step_spike` sozinho; canais grandes e estáveis às vezes têm 8 horas com variação < 2% por acaso (`mechanical_repeat`). Ambos ficam `inconclusive` por causa da regra de 2 sinais, que é justamente o que protege contra falso positivo. Um legítimo só viraria `suspicious` se juntasse dois sinais por acaso.
- A taxa de detecção é baixa de propósito: 3 das 8 famílias suspeitas são `inconclusive` por desenho (um só sinal) e 2 são evasivas. É o preço de preferir não acusar. A detecção alta (92% a 100%) nas famílias de 2 ou mais sinais vem de eu ter construído essas famílias com exatamente os sinais que o classificador procura; não diz nada sobre fraude real.

## O que NÃO detecta

- **Bots que imitam uma curva orgânica** (rampa e cauda): passam como `organic` (família `bot_mimics_organic`).
- **Pico distribuído em muitas horas** (compra diluída, sem salto): passa como `organic` (família `diluted_spike`).
- **Ritmo circadiano**: não é usado. Tráfego sem ciclo dia/noite, que seria indício forte, não é visto (e o ciclo normal não é tratado como suspeito).
- **Origem das contas**: uma série de views por hora não diz quem assistiu (país, idade da conta, retenção). Isso exige outros dados.
- Séries com patamar dominante (mais da metade da série em platô) distorcem a mediana usada em `abrupt_drop`.
- Falsos negativos por ruído: um degrau comprado com ruído alto pode escapar da regra "80% do pico".

## Decisões minhas além da spec

- Resposta traz também `description` por sinal e `evidence: null` quando não disparou.
- Mínimos absolutos (+50 views/h de salto, 50 de média, 50 de queda) e janela de rampa de 3 h.
- Limite de 720 pontos por requisição; lista vazia, não inteiros, negativos e JSON inválido -> 400.
- `step_spike` olha a mediana das 24 h anteriores (a spec dizia "janela anterior"), exigindo ao menos 6 pontos.
- Sem banco nem relógio: a API não tem estado, então `createApp()` não recebe dependências. `data/` fica no `.gitignore` e é regenerado por `npm run dataset`.

## Fora de escopo

Modelo de ML, dados reais de redes sociais, autenticação, persistência.

## Uso de IA
- **Feito com IA:** especificação, código e testes escritos com Claude Code (Claude Sonnet 5.5), a partir de decisões do autor tomadas em entrevista (grill) e registradas em `.specs/`.
- **Revisado pelo autor:** TODO(preencher após a revisão humana do diff).
- **Revisão independente:** TODO(preencher após a revisão por agente de contexto limpo).
