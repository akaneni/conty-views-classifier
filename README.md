# conty-views-classifier

Classificador **explicável** de séries de views por hora. Recebe a série, devolve `organic`, `suspicious` ou `inconclusive`, um motivo em português e os sinais usados. Sem modelo opaco, sem estado, sem rede. Desafio 09 (views que não parecem humanas).

## Como rodar

```bash
# Node 22.13+ (declarado em engines; só confirmei no Node 24.21)
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
  -d '{"views_per_hour":[110,95,130,102,141,88,120,99,135,108,92,125,117,101,138,90,122,104,131,97,119,112,126,94,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,20,18,22]}'
```

Resposta (resumida): `classification: "suspicious"`, `reason: "Suspeita: 2 eventos independentes de audiência não humana apareceram juntos. (1) um platô: salto de 13,5x na hora 24 (de cerca de 111 para 1500 views/h) sem subida gradual antes e sem queda gradual depois (o patamar se manteve); e queda de 99% em 1 hora na hora 36 (...). O salto e a queda são o mesmo platô e contam como um evento só. (2) 8 horas seguidas a partir da hora 24 com cerca de 1500 views/h, com variação de apenas 0,00% (...)."`.

O corpo traz:
- `signals`: os três sinais individuais, cada um com `name`, `triggered`, `description` (PT-BR) e `evidence: { hour_index, value, baseline }` (ou `null` quando não disparou).
- `groups`: os dois **eventos independentes** usados na decisão, `plateau_event` (agrupa `step_spike` e `abrupt_drop`) e `mechanical_repeat`, cada um com `triggered`, `signals` (quais sinais internos dispararam), `start_hour` e `end_hour` (para o platô do mesmo evento: hora do salto e hora da queda; `null` quando salto e queda são platôs separados). `mechanical_repeat.triggered` só é `true` quando a repetição está fora do platô; dentro do platô o sinal individual em `signals` aparece disparado, mas o grupo não.

## Critério

Três sinais, cada um com limiares nomeados em um único arquivo, [`src/thresholds.ts`](src/thresholds.ts):

| sinal | dispara quando | principais limiares |
|---|---|---|
| `step_spike` | uma hora vale >= 5x a mediana das 24 h anteriores (e pelo menos +50 views/h), **sem rampa** (nenhuma das 3 horas prévias >= 2x a mediana) e **sem decaimento** (as 6 h seguintes ficam >= 80% do pico, ou a hora seguinte volta a <= 2x a mediana) | `STEP_JUMP_RATIO`, `STEP_RAMP_*`, `STEP_HOLD_*` |
| `mechanical_repeat` | >= 8 horas seguidas com coeficiente de variação < 2%, ou diferenças consecutivas iguais e não nulas; média mínima de 50 views/h | `MECH_MIN_HOURS`, `MECH_MAX_CV`, `MECH_MIN_MEAN` |
| `abrupt_drop` | queda >= 80% em 1 h depois de >= 3 h acima de 3x a mediana da série (e perda de pelo menos 50 views/h) | `DROP_*` |

Os sinais são agrupados por **evento independente**:

1. **`plateau_event`**: `step_spike` e `abrupt_drop` descrevem o mesmo platô (salto, patamar, queda) e contam como **um** evento, mas só quando são do **mesmo platô**: a queda vem **depois** do salto e a no máximo `PLATEAU_MAX_HOURS` (48 h) dele. Caso contrário (queda antes do salto, ou muito longe) o motivo fala em "dois platôs separados", `start_hour` e `end_hour` ficam `null` e, para não acusar a mais, os dois ainda contam como um evento só.
2. **`mechanical_repeat`**: só conta como **segundo** evento se estiver **fora do platô**.

**Definição de "fora do platô".** A janela de 8 h de repetição mecânica não pode tocar nenhuma hora do trecho do platô. Esse trecho é: (a) salto e queda do mesmo platô: da hora do salto até a hora anterior à queda (inclusive); (b) só salto: do salto até a última hora seguida acima de 2x a base; (c) só queda: o patamar acima de 3x a base imediatamente antes da queda; (d) platôs separados: a união de (b) e (c). Uma repetição que começa exatamente na hora da queda já é "fora". Repetição dentro do platô é considerada parte do mesmo evento (o motivo diz isso) e **não** vira segundo evento, embora `mechanical_repeat` continue aparecendo em `signals`.

Consequência assumida (decisão do autor): **só se acusa com evidência em dois trechos independentes da série**. Um platô comprado com taxa fixa é indistinguível de uma live legítima com os dados disponíveis (só views por hora), então fica `inconclusive`. O que ainda é acusado: repetição mecânica antes ou depois de um platô.

Decisão: **2 eventos independentes -> `suspicious`; 1 evento (mesmo com todos os sinais dentro dele) -> `inconclusive`; 0 -> `organic`**; menos de 24 pontos -> `inconclusive`. Acusar criador honesto custa mais do que deixar passar um caso duvidoso, então um evento isolado nunca acusa.

Os limiares foram escolhidos pelo autor, sem ajuste sobre o dataset (o enunciado não define limiares). Os mínimos absolutos (+50 views/h, 50 de média) são decisão minha para canal pequeno não disparar por ruído. Nenhum limiar existente foi alterado nas revisões; mudaram só a regra de decisão e a definição dos eventos (e entrou `PLATEAU_MAX_HOURS = 48`).

### Pico orgânico x pico comprado

O que separa os dois é o *caminho*, não a altura. Viral de verdade sobe em rampa e/ou decai devagar; o comprado salta de uma vez e fica no patamar (ou some de uma vez). Em `test/classify.test.ts` o mesmo pico de ~1500 views/h aparece nas duas formas: com rampa de 4 h e cauda de 12 h é `organic`; como degrau de 8 h com queda seca é `suspicious`. Um compartilhamento súbito por conta grande (salto de 1 h, cauda longa) também fica `organic`. Já o mesmo pico em degrau, sem rampa e com queda seca, fica `inconclusive` (um platô sozinho), e não `organic`: o classificador não sabe se é compra ou uma live.

### Caso em que prefere não acusar

Dois exemplos, ambos `inconclusive`:
- Um pico de 1 hora que some na hora seguinte dispara só `step_spike`. Motivo: "Prefiro não acusar: apareceu só um evento, um platô: salto de ... Um platô isolado também acontece em casos legítimos (uma live, destaque na página inicial, divulgação por conta grande, newsletter semanal), então não basta para acusar. Só marco como suspeito com pelo menos 2 eventos independentes ..." (teste: "um único sinal (pico de 1 hora que some)...").
- Salto + patamar + queda seca com ruído natural (o que uma live ou um destaque na página inicial produz): os dois sinais disparam, mas são o mesmo platô e contam como um evento (teste: "salto e queda seca do mesmo platô contam como UM evento"). Há testes de regressão com as séries do revisor independente em `test/classify.test.ts` (bloco "platôs legítimos nunca viram suspicious").

## Dataset e taxas medidas

Dataset sintético, reproduzível: PRNG mulberry32 com seed fixa (`20260101`), um gerador por família, tamanhos fixos (100 por família legítima, 50 por suspeita; os totais saem do comando), nenhuma chamada de rede. Os números abaixo ficam entre marcadores e **o teste `test/readme.test.ts` falha se divergirem do medido por `npm run dataset`**.

- **Taxa de falso positivo** (legítimos `suspicious` / legítimos): <!-- fp-rate:start -->0 de 1200 legítimos classificados como suspicious (0,00%)<!-- fp-rate:end -->
- **Inconclusive entre legítimos** (não escondido): <!-- legit-inconclusive:start -->587 de 1200 legítimos classificados como inconclusive (48,92%)<!-- legit-inconclusive:end -->
- **Detecção nos suspeitos**: <!-- detection:start -->100 de 500 suspeitos classificados como suspicious (20,00%); 294 inconclusive (58,80%); 106 passaram como organic (21,20%)<!-- detection:end -->

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
| weekly_event | legítimo | 100 | 0 | 100 | 0 |
| low_volume_plateau | legítimo | 100 | 33 | 67 | 0 |
| plateau_noise_2pct | legítimo | 100 | 0 | 100 | 0 |
| plateau_noise_3pct | legítimo | 100 | 0 | 100 | 0 |
| plateau_noise_4pct | legítimo | 100 | 0 | 100 | 0 |
| bought_step_plateau_drop | suspeito | 50 | 0 | 50 | 0 |
| bought_mechanical_plateau | suspeito | 50 | 0 | 50 | 0 |
| combo_all | suspeito | 50 | 0 | 50 | 0 |
| mechanical_only | suspeito | 50 | 0 | 50 | 0 |
| ramped_plateau_drop | suspeito | 50 | 11 | 39 | 0 |
| single_hour_spike | suspeito | 50 | 0 | 50 | 0 |
| diluted_spike | suspeito | 50 | 50 | 0 | 0 |
| bot_mimics_organic | suspeito | 50 | 45 | 5 | 0 |
| mechanical_before_plateau | suspeito | 50 | 0 | 0 | 50 |
| mechanical_after_plateau | suspeito | 50 | 0 | 0 | 50 |
<!-- families:end -->

Famílias do dataset (lista gerada do código; o teste de coerência confere):

<!-- families-list:start -->
- Legítimas: `stable` (100), `slow_growth` (100), `viral_ramp_tail` (100), `seasonal_circadian` (100), `old_video_decay` (100), `plausible_peak` (100), `plateau_live_frontpage` (100), `weekly_event` (100), `low_volume_plateau` (100), `plateau_noise_2pct` (100), `plateau_noise_3pct` (100), `plateau_noise_4pct` (100).
- Suspeitas: `bought_step_plateau_drop` (50), `bought_mechanical_plateau` (50), `combo_all` (50), `mechanical_only` (50), `ramped_plateau_drop` (50), `single_hour_spike` (50), `diluted_spike` (50), `bot_mimics_organic` (50), `mechanical_before_plateau` (50), `mechanical_after_plateau` (50).
<!-- families-list:end -->

As duas famílias suspeitas **evasivas** (`diluted_spike`, `bot_mimics_organic`) existem de propósito: o classificador não as pega.

**Falso positivo por nível de ruído do platô legítimo.** Um platô legítimo muito regular (live, destaque, evento semanal) com ruído de 2% a 4% é o caso mais perigoso, porque a variação cai perto do limiar de repetição mecânica (2%):

<!-- noise-fp:start -->
| ruído do platô | total | suspicious (falso positivo) | inconclusive | organic |
|---|---|---|---|---|
| 2% | 100 | 0 (0,00%) | 100 | 0 |
| 3% | 100 | 0 (0,00%) | 100 | 0 |
| 4% | 100 | 0 (0,00%) | 100 | 0 |
<!-- noise-fp:end -->

### Leitura honesta dos números

- **Histórico, para não maquiar.**
  1. Versão 1 (cada sinal contava separado, 600 legítimos): FP 0 de 600, inconclusive entre legítimos 20 de 600 (3,33%), detecção 148 de 400 (37,00%).
  2. Revisão independente: um platô legítimo com queda seca (live, destaque, evento semanal) disparava `step_spike` e `abrupt_drop` e virava `suspicious`. Funde os dois em `plateau_event` e adicionei 3 famílias legítimas de platô: FP 1 de 900 (0,11%), inconclusive 286 de 900 (31,78%), detecção 100 de 400 (25,00%).
  3. Re-revisão: platô legítimo bem regular (ruído de 2% a 4%) tem variação perto do limiar de 2% de `mechanical_repeat`. Com a regra "repetição conta como segundo evento mesmo dentro do platô", a medição nas famílias `plateau_noise_*` foi **84 de 100 (2%), 50 de 100 (3%) e 15 de 100 (4%) acusados**, FP total 150 de 1200 (12,50%). Com a regra atual (repetição só conta fora do platô), esses três níveis dão a tabela acima (0 acusados) e o FP total é o do comando.
  Nenhum limiar foi mexido em nenhuma etapa.
- **O FP é 0 por construção da regra, não porque o problema sumiu.** A repetição mecânica **dentro** do platô deixou de contar, então um platô legítimo regular não é acusado. O risco que sobra é um criador ter, em outro trecho da série, 8 horas de variação < 2% por acaso (canal grande e estável) **e** também um platô. O dataset não tem essa combinação legítima, então esse risco não está medido.
- **O custo é a detecção.** Detecção medida: ver "Detecção nos suspeitos" acima. Das 500 séries suspeitas, só as 100 das duas famílias com repetição mecânica **em outro trecho** (`mechanical_before_plateau`, `mechanical_after_plateau`) são acusadas, e elas foram construídas por mim exatamente com a evidência que o classificador exige, então o 100% nelas não diz nada sobre fraude real. Platô comprado com taxa fixa (`bought_mechanical_plateau`, `combo_all`) e em degrau (`bought_step_plateau_drop`) agora ficam `inconclusive`: 0 de 150 acusados, antes 146.
- **Os ~49% de `inconclusive` entre legítimos são o preço de não acusar.** Vêm dos platôs legítimos (live/destaque, evento semanal, canal pequeno, platôs regulares), que sempre disparam um evento de platô, e de virais com rampa muito curta. `inconclusive` aqui significa "não sei", não "ok": quase todo platô legítimo cai nele.
- **O dataset é favorável.** Eu escrevi o dataset e o classificador; as famílias legítimas são curvas com ruído gaussiano, sem as irregularidades de dados reais (cortes de coleta, reprocessamentos, contagem arredondada).

## O que NÃO detecta

- **Pico ou platô comprado, com ou sem taxa fixa, sem evidência fora do platô**: fica `inconclusive`, nunca `suspicious`. Com views por hora não dá para separar de uma live ou de um destaque na página inicial. Isso inclui o platô comprado com taxa fixa (indistinguível de uma live perfeitamente constante).
- **Repetição mecânica só durante o platô** não é segundo evento, por decisão do autor.
- **Bots que imitam uma curva orgânica** (rampa e cauda): passam como `organic` (família `bot_mimics_organic`).
- **Pico distribuído em muitas horas** (compra diluída, sem salto): passa como `organic` (família `diluted_spike`).
- **Ritmo circadiano**: não é usado. Tráfego sem ciclo dia/noite, que seria indício forte, não é visto (e o ciclo normal não é tratado como suspeito).
- **Origem das contas**: uma série de views por hora não diz quem assistiu (país, idade da conta, retenção). Isso exige outros dados.
- Séries dominadas por um patamar (mais da metade da série em platô) distorcem a mediana usada em `abrupt_drop`.
- Falsos negativos por ruído: um degrau comprado com ruído alto pode escapar da regra "80% do pico".

## Decisões minhas além da spec

- Resposta traz também `description` por sinal, `evidence: null` quando não disparou e `groups` (eventos independentes, ver Critério).
- Fusão de `step_spike` + `abrupt_drop` do mesmo platô em `plateau_event` e regra de "fora do platô" para `mechanical_repeat` (decisões do autor após revisões independentes).
- Mínimos absolutos (+50 views/h de salto, 50 de média, 50 de queda) e janela de rampa de 3 h.
- Limite de 720 pontos por requisição; lista vazia, não inteiros seguros (`Number.isSafeInteger`, então `1e300` dá 400), negativos e JSON inválido -> 400.
- `step_spike` olha a mediana das 24 h anteriores (a spec dizia "janela anterior"), exigindo ao menos 6 pontos.
- Sem banco nem relógio: a API não tem estado, então `createApp()` não recebe dependências. `data/` fica no `.gitignore` e é regenerado por `npm run dataset`.

## Fora de escopo

Modelo de ML, dados reais de redes sociais, autenticação, persistência.

## Uso de IA
- **Feito com IA:** especificação, código e testes escritos com Claude Code (Claude Sonnet 5.5), a partir de decisões do autor tomadas em entrevista (grill) e registradas em `.specs/`.
- **Revisado pelo autor:** TODO(preencher após a revisão humana do diff).
- **Revisão independente:** TODO(preencher após a revisão por agente de contexto limpo).
