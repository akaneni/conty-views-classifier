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
  -d '{"views_per_hour":[110,95,130,102,141,88,120,99,135,108,92,125,117,101,138,90,122,104,131,97,119,112,126,94,150,150,150,150,150,150,150,150,150,150,110,95,130,102,141,88,120,99,135,108,92,125,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,20,18,22]}'
```

Resposta (resumida): `classification: "suspicious"`, `reason: "Suspeita: 2 eventos independentes de audiência não humana apareceram juntos. (1) um platô: salto de 11,3x na hora 46 (de cerca de 133 para 1500 views/h) sem subida gradual antes e sem queda gradual depois (o patamar se manteve); e queda de 99% em 1 hora na hora 58 (...). O salto e a queda são o mesmo platô e contam como um evento só. (2) 8 horas seguidas a partir da hora 24 com cerca de 150 views/h, com variação de apenas 0,00% (...)."` A repetição na hora 24 está **fora** do platô (horas 46 a 57); sem ela, o mesmo platô sozinho seria `inconclusive`.

O corpo traz:
- `signals`: os três sinais individuais, cada um com `name`, `triggered`, `description` (PT-BR) e `evidence: { hour_index, value, baseline }` (ou `null` quando não disparou).
- `groups`: os dois **eventos independentes** usados na decisão, `plateau_event` (agrupa `step_spike` e `abrupt_drop`) e `mechanical_repeat`, cada um com `triggered`, `signals` (quais sinais internos dispararam), `start_hour` e `end_hour` (para o platô do mesmo evento: hora do salto e hora da queda; `null` quando salto e queda são platôs separados). `mechanical_repeat.triggered` só é `true` quando a repetição está fora do platô; dentro do platô o sinal individual em `signals` aparece disparado, mas o grupo não.

## Critério

Três sinais, cada um com limiares nomeados em um único arquivo, [`src/thresholds.ts`](src/thresholds.ts):

| sinal | dispara quando | principais limiares |
|---|---|---|
| `step_spike` | uma hora vale >= 5x a mediana das 24 h anteriores (e pelo menos +50 views/h), **sem rampa** (nenhuma das 3 horas prévias >= 2x a mediana) e **sem decaimento** (as 6 h seguintes ficam >= 80% do pico, ou a hora seguinte volta a <= 2x a mediana) | `STEP_JUMP_RATIO`, `STEP_RAMP_*`, `STEP_HOLD_*` |
| `mechanical_repeat` | >= 8 horas seguidas com média de pelo menos 50 views/h e: variação (desvio/média) **< 0,5%** ou diferenças consecutivas iguais e não nulas = evidência **forte**; variação entre 0,5% e 2% = evidência **fraca** (aparece em `signals` com `strength: "weak"`, mas não conta como evento) | `MECH_MIN_HOURS`, `MECH_STRONG_CV`, `MECH_MAX_CV`, `MECH_MIN_MEAN` |
| `abrupt_drop` | queda >= 80% em 1 h depois de >= 3 h acima de 3x a mediana da série (e perda de pelo menos 50 views/h) | `DROP_*` |

Os sinais são agrupados por **evento independente**:

1. **`plateau_event`**: `step_spike` e `abrupt_drop` descrevem o mesmo platô (salto, patamar, queda) e contam como **um** evento, mas só quando são do **mesmo platô**: a queda vem **depois** do salto e a no máximo `PLATEAU_MAX_HOURS` (48 h) dele. Caso contrário o motivo não afirma que é o mesmo platô: se a queda vem antes do salto, fala em "eventos separados"; se está a mais de 48 h, diz que salto e queda estão "distantes demais" (pode ser um platô muito longo ou dois eventos, não afirmo qual). Nos dois casos `start_hour` e `end_hour` ficam `null` e, para não acusar a mais, contam como um evento só.
2. **`mechanical_repeat`**: só conta como **segundo** evento se for evidência **forte** e estiver **fora do platô**.

**Definição de "fora do platô".** A janela de 8 h de repetição mecânica não pode tocar nenhuma hora do trecho do platô. Esse trecho é: (a) salto e queda do mesmo platô: da hora do salto até a hora anterior à queda (inclusive); (b) só salto: do salto até a última hora seguida acima de 2x a base; (c) só queda: o patamar acima de 3x a base imediatamente antes da queda; (d) platôs separados: a união de (b) e (c). Uma repetição que começa exatamente na hora da queda já é "fora". Repetição dentro do platô é considerada parte do mesmo evento (o motivo diz isso) e **não** vira segundo evento, embora `mechanical_repeat` continue aparecendo em `signals`.

Consequência assumida (decisão do autor): **só se acusa com evidência em dois trechos independentes da série**. Um platô comprado com taxa fixa é indistinguível de uma live legítima com os dados disponíveis (só views por hora), então fica `inconclusive`. O que ainda é acusado: repetição mecânica antes ou depois de um platô.

Decisão: **2 eventos independentes -> `suspicious`; 1 evento (mesmo com todos os sinais dentro dele) -> `inconclusive`; 0 -> `organic`**; menos de 24 pontos -> `inconclusive`. Acusar criador honesto custa mais do que deixar passar um caso duvidoso, então um evento isolado nunca acusa.

**Por que 0,5% para repetição forte.** O limiar de 2% da primeira versão gerava falso positivo por acaso: um revisor independente mediu canais estáveis com ruído de fundo de 3% a 8% acusados em 4% a 77% dos casos. Para uma janela de 8 h, contagem puramente aleatória (Poisson) varia em torno de 1/raiz(média), então 0,5% pareceria "não natural" abaixo de ~40 mil views/h. **Mas essa conta vale para uma janela só, e o classificador varre muitas janelas deslizantes de 8 h**: a repetição forte aparece por acaso já a partir de ~5 a 10 mil views/h em séries planas, sem ciclo diário marcado; com ciclo dia/noite marcado o risco some. Medição reproduzível (seed fixa, 200 séries por linha, Poisson aproximado por normal, geradas por `npm run dataset` e conferidas pelo teste de coerência):

<!-- poisson-sensitivity:start -->
| série | views/h (média) | séries | com ao menos uma janela forte por acaso |
|---|---|---|---|
| plana, 96 h | 2000 | 200 | 1 (0,5%) |
| plana, 96 h | 5000 | 200 | 43 (21,5%) |
| plana, 96 h | 10000 | 200 | 163 (81,5%) |
| plana, 96 h | 20000 | 200 | 200 (100,0%) |
| plana, 720 h | 5000 | 200 | 166 (83,0%) |
| ciclo dia/noite de ±30%, 96 h | 5000 | 200 | 0 (0,0%) |
| ciclo dia/noite de ±30%, 96 h | 20000 | 200 | 0 (0,0%) |
<!-- poisson-sensitivity:end -->

O 0,5% é escolha do autor, não foi ajustado olhando o dataset, e o dataset mostra que ele ainda deixa passar falso positivo. Variação entre 0,5% e 2% continua aparecendo no sinal, marcada como fraca.

Os limiares foram escolhidos pelo autor, sem ajuste sobre o dataset (o enunciado não define limiares). Os mínimos absolutos (+50 views/h, 50 de média) são decisão minha para canal pequeno não disparar por ruído. Nas revisões mudaram a regra de decisão, a definição dos eventos, entrou `PLATEAU_MAX_HOURS = 48` e `MECH_STRONG_CV = 0,5%` (decisão do autor, justificada acima). Os demais limiares não foram alterados.

### Pico orgânico x pico comprado

O que separa os dois é o *caminho*, não a altura. Viral de verdade sobe em rampa e/ou decai devagar; o comprado salta de uma vez e fica no patamar (ou some de uma vez). Em `test/classify.test.ts` o mesmo pico de ~1500 views/h aparece nas duas formas: com rampa de 4 h e cauda de 12 h é `organic`; como degrau de 8 h com queda seca é `suspicious`. Um compartilhamento súbito por conta grande (salto de 1 h, cauda longa) também fica `organic`. Já o mesmo pico em degrau, sem rampa e com queda seca, fica `inconclusive` (um platô sozinho), e não `organic`: o classificador não sabe se é compra ou uma live.

### Caso em que prefere não acusar

Dois exemplos, ambos `inconclusive`:
- Um pico de 1 hora que some na hora seguinte dispara só `step_spike`. Motivo: "Prefiro não acusar: apareceu só um evento, um platô: salto de ... Um platô isolado também acontece em casos legítimos (uma live, destaque na página inicial, divulgação por conta grande, newsletter semanal), então não basta para acusar. Só marco como suspeito com pelo menos 2 eventos independentes ..." (teste: "um único sinal (pico de 1 hora que some)...").
- Salto + patamar + queda seca com ruído natural (o que uma live ou um destaque na página inicial produz): os dois sinais disparam, mas são o mesmo platô e contam como um evento (teste: "salto e queda seca do mesmo platô contam como UM evento"). Há testes de regressão com as séries do revisor independente em `test/classify.test.ts` (bloco "platôs legítimos nunca viram suspicious").

## Dataset e taxas medidas

Dataset sintético, reproduzível: PRNG mulberry32 com seed fixa (`20260101`), um gerador por família, tamanhos fixos (100 por família legítima, 50 por suspeita; os totais saem do comando), nenhuma chamada de rede. Os números abaixo ficam entre marcadores e **o teste `test/readme.test.ts` falha se divergirem do medido por `npm run dataset`**.

- **Taxa de falso positivo** (legítimos `suspicious` / legítimos): <!-- fp-rate:start -->276 de 2200 legítimos classificados como suspicious (12,55%)<!-- fp-rate:end -->
- **Inconclusive entre legítimos** (não escondido): <!-- legit-inconclusive:start -->1303 de 2200 legítimos classificados como inconclusive (59,23%)<!-- legit-inconclusive:end -->
- **De onde vem o falso positivo e o inconclusive** (gerado pelo comando): <!-- fp-breakdown:start -->276 dos 276 falsos positivos vêm de 6 cenários `risk_*` (`risk_gap_fill_live` 100, `risk_two_plateaus_cv0_2pct` 100, `risk_rounded_1000_live` 47, `risk_huge_channel_spike` 17, `risk_two_plateaus_cv1pct` 11, `risk_weekly_2w_noise3` 1); os outros 16 cenários legítimos (4 `risk_*` sem acusação e 12 demais) somam 0. Dos 1303 legítimos `inconclusive`, 724 vêm dos 10 cenários `risk_*`.<!-- fp-breakdown:end -->
  Portanto o número de falso positivo reflete **quantos cenários de risco o autor decidiu incluir** (cada um pesa 100 séries), **não** é taxa esperada em dados reais. Os demais cenários legítimos quase não acusam.
- **Detecção nos suspeitos**: <!-- detection:start -->99 de 500 suspeitos classificados como suspicious (19,80%); 292 inconclusive (58,40%); 109 passaram como organic (21,80%)<!-- detection:end -->

Por família:

<!-- families:start -->
| família | tipo | total | organic | inconclusive | suspicious |
|---|---|---|---|---|---|
| stable | legítimo | 100 | 100 | 0 | 0 |
| slow_growth | legítimo | 100 | 100 | 0 | 0 |
| viral_ramp_tail | legítimo | 100 | 88 | 12 | 0 |
| seasonal_circadian | legítimo | 100 | 100 | 0 | 0 |
| old_video_decay | legítimo | 100 | 100 | 0 | 0 |
| plausible_peak | legítimo | 100 | 100 | 0 | 0 |
| plateau_live_frontpage | legítimo | 100 | 0 | 100 | 0 |
| weekly_event | legítimo | 100 | 0 | 100 | 0 |
| low_volume_plateau | legítimo | 100 | 33 | 67 | 0 |
| plateau_noise_2pct | legítimo | 100 | 0 | 100 | 0 |
| plateau_noise_3pct | legítimo | 100 | 0 | 100 | 0 |
| plateau_noise_4pct | legítimo | 100 | 0 | 100 | 0 |
| risk_stable_bg_3pct | legítimo | 100 | 0 | 100 | 0 |
| risk_stable_bg_4pct | legítimo | 100 | 0 | 100 | 0 |
| risk_stable_bg_5pct | legítimo | 100 | 0 | 100 | 0 |
| risk_huge_channel_spike | legítimo | 100 | 0 | 83 | 17 |
| risk_gap_fill_live | legítimo | 100 | 0 | 0 | 100 |
| risk_rounded_100_live | legítimo | 100 | 0 | 100 | 0 |
| risk_rounded_1000_live | legítimo | 100 | 0 | 53 | 47 |
| risk_weekly_2w_noise3 | legítimo | 100 | 0 | 99 | 1 |
| risk_two_plateaus_cv0_2pct | legítimo | 100 | 0 | 0 | 100 |
| risk_two_plateaus_cv1pct | legítimo | 100 | 0 | 89 | 11 |
| bought_step_plateau_drop | suspeito | 50 | 0 | 50 | 0 |
| bought_mechanical_plateau | suspeito | 50 | 0 | 50 | 0 |
| combo_all | suspeito | 50 | 0 | 50 | 0 |
| mechanical_only | suspeito | 50 | 0 | 50 | 0 |
| ramped_plateau_drop | suspeito | 50 | 11 | 39 | 0 |
| single_hour_spike | suspeito | 50 | 0 | 50 | 0 |
| diluted_spike | suspeito | 50 | 50 | 0 | 0 |
| bot_mimics_organic | suspeito | 50 | 48 | 2 | 0 |
| mechanical_before_plateau | suspeito | 50 | 0 | 1 | 49 |
| mechanical_after_plateau | suspeito | 50 | 0 | 0 | 50 |
<!-- families:end -->

Famílias do dataset (lista gerada do código; o teste de coerência confere):

<!-- families-list:start -->
- Legítimas: `stable` (100), `slow_growth` (100), `viral_ramp_tail` (100), `seasonal_circadian` (100), `old_video_decay` (100), `plausible_peak` (100), `plateau_live_frontpage` (100), `weekly_event` (100), `low_volume_plateau` (100), `plateau_noise_2pct` (100), `plateau_noise_3pct` (100), `plateau_noise_4pct` (100), `risk_stable_bg_3pct` (100), `risk_stable_bg_4pct` (100), `risk_stable_bg_5pct` (100), `risk_huge_channel_spike` (100), `risk_gap_fill_live` (100), `risk_rounded_100_live` (100), `risk_rounded_1000_live` (100), `risk_weekly_2w_noise3` (100), `risk_two_plateaus_cv0_2pct` (100), `risk_two_plateaus_cv1pct` (100).
- Suspeitas: `bought_step_plateau_drop` (50), `bought_mechanical_plateau` (50), `combo_all` (50), `mechanical_only` (50), `ramped_plateau_drop` (50), `single_hour_spike` (50), `diluted_spike` (50), `bot_mimics_organic` (50), `mechanical_before_plateau` (50), `mechanical_after_plateau` (50).
<!-- families-list:end -->

As duas famílias suspeitas **evasivas** (`diluted_spike`, `bot_mimics_organic`) existem de propósito: o classificador não as pega.

**Falso positivo em cenários de risco para a repetição mecânica** (série legítima com fundo regular, mais uma live ou um pico). "Antes" é a regra que contava repetição com variação < 2%; "depois" é a regra atual (só variação < 0,5% ou diferenças exatamente constantes contam como evento). Ambos são calculados pelo comando e conferidos pelo teste:

<!-- scenarios:start -->
| cenário legítimo | total | acusados antes (regra de 2%) | acusados depois (regra atual) | inconclusive depois | organic depois |
|---|---|---|---|---|---|
| risk_stable_bg_3pct | 100 | 100 (100,00%) | 0 (0,00%) | 100 | 0 |
| risk_stable_bg_4pct | 100 | 79 (79,00%) | 0 (0,00%) | 100 | 0 |
| risk_stable_bg_5pct | 100 | 54 (54,00%) | 0 (0,00%) | 100 | 0 |
| risk_huge_channel_spike | 100 | 100 (100,00%) | 17 (17,00%) | 83 | 0 |
| risk_gap_fill_live | 100 | 100 (100,00%) | 100 (100,00%) | 0 | 0 |
| risk_rounded_100_live | 100 | 99 (99,00%) | 0 (0,00%) | 100 | 0 |
| risk_rounded_1000_live | 100 | 92 (92,00%) | 47 (47,00%) | 53 | 0 |
| risk_weekly_2w_noise3 | 100 | 100 (100,00%) | 1 (1,00%) | 99 | 0 |
| risk_two_plateaus_cv0_2pct | 100 | 100 (100,00%) | 100 (100,00%) | 0 | 0 |
| risk_two_plateaus_cv1pct | 100 | 100 (100,00%) | 11 (11,00%) | 89 | 0 |
<!-- scenarios:end -->

Totais antes/depois, no dataset inteiro:

<!-- before-after:start -->
- Antes (repetição de CV < 2% conta): FP 924/2200 (42,00%), inconclusive entre legítimos 663/2200 (30,14%), detecção 100/500 (20,00%)
- Depois (só CV < 0,5% ou diferença constante): FP 276/2200 (12,55%), inconclusive entre legítimos 1303/2200 (59,23%), detecção 99/500 (19,80%)
<!-- before-after:end -->

**Falso positivo por nível de ruído do platô legítimo.** Um platô legítimo muito regular (live, destaque, evento semanal) com ruído de 2% a 4% é o caso mais perigoso, porque a variação cai perto do limiar de repetição mecânica (2%):

<!-- noise-fp:start -->
| ruído do platô | total | suspicious (falso positivo) | inconclusive | organic |
|---|---|---|---|---|
| 2% | 100 | 0 (0,00%) | 100 | 0 |
| 3% | 100 | 0 (0,00%) | 100 | 0 |
| 4% | 100 | 0 (0,00%) | 100 | 0 |
<!-- noise-fp:end -->

### Leitura honesta dos números

- **Histórico, para não maquiar.** Cada número abaixo vem do `npm run dataset` rodado **no commit citado** (reproduza com `git worktree add --detach ../wt <commit>`, link de `node_modules` e `npx tsx scripts/dataset.ts`); os números de hoje são os desta página.
  1. `7c2a256` (versão 1, cada sinal contava separado, 600 legítimos e 400 suspeitos): FP 0 de 600, inconclusive entre legítimos 20 de 600 (3,33%), detecção 148 de 400 (37,00%). Neste dataset, as famílias `bought_step_plateau_drop`, `bought_mechanical_plateau` e `combo_all` somavam **146 de 150 acusadas** (46 + 50 + 50). Hoje, no dataset atual, são 0 de 150.
  2. `aac0dfd` (só a fusão de `step_spike` + `abrupt_drop`, mesmo dataset da versão 1): detecção 104 de 400 (26,00%). Um revisor mostrou que um platô legítimo com queda seca (live, destaque, evento semanal) virava `suspicious` por dois sinais do mesmo evento; por isso a fusão.
  3. `ddca538` (+ 3 famílias legítimas de platô, 900 legítimos): FP 1 de 900 (0,11%), inconclusive 286 de 900 (31,78%), detecção 100 de 400 (25,00%).
  4. `0fb5d4a` (+ platôs legítimos com ruído de 2% a 4%, 1200 legítimos, repetição dentro do platô ainda contava): `plateau_noise_*` acusados 84 de 100 (2%), 50 de 100 (3%) e 15 de 100 (4%); FP total 150 de 1200 (12,50%). Com a regra "repetição só conta fora do platô", esses três níveis passaram a 0 acusados.
  5. `7ea28b4` (+ cenários `risk_*`, regra de variação < 2%, 2000 legítimos): FP 724 de 2000 (36,20%), inconclusive 663 de 2000 (33,15%), detecção 100 de 500 (20,00%). A coluna "antes" das tabelas de cenários é essa regra, recalculada pelo código atual (opção `countWeakMechanical`).
- **O FP caiu bastante nos cenários de risco, mas não é 0, e isso fica visível.** Veja a tabela de cenários: fundo estável com ruído de 3% a 5%, contagem arredondada a 100 e platô regular com ruído de 2% a 4% deixam de ser acusados; **restam falsos positivos** em (a) falha de coleta preenchida com o último valor (8 horas exatamente iguais, mais uma live em outro trecho: acusada em 100% dos casos, porque 8 horas idênticas são indistinguíveis de um bot com views por hora), (b) contagem arredondada a 1000 em canal de 5 a 50 mil views/h (muitas horas com o mesmo número) e (c) canal enorme (20 a 200 mil views/h) com ruído de 1,5%, onde variação < 0,5% acontece por acaso em parte dos casos. Não criei exceção ad hoc para nenhum deles.
- **O custo é a detecção.** Detecção medida: ver "Detecção nos suspeitos" acima. Das 500 séries suspeitas, só as das duas famílias com repetição mecânica **em outro trecho** (`mechanical_before_plateau`, `mechanical_after_plateau`) são acusadas, e elas foram construídas por mim exatamente com a evidência que o classificador exige, então as taxas altas nelas (veja a tabela por família) não dizem nada sobre fraude real. Platô comprado com taxa fixa (`bought_mechanical_plateau`, `combo_all`) e em degrau (`bought_step_plateau_drop`) agora ficam `inconclusive`: 0 de 150 acusados (no dataset da versão 1, `7c2a256`, eram 146 de 150).
- **Os cerca de 59% de `inconclusive` entre legítimos são o preço de não acusar** (e subiram com a regra forte: o que antes era acusado agora é `inconclusive`). Boa parte vem dos cenários `risk_*` que o autor adicionou (ver a decomposição acima); o resto são platôs legítimos (live/destaque, evento semanal, canal pequeno, platôs regulares), que sempre disparam um evento de platô, e virais com rampa muito curta. `inconclusive` aqui significa "não sei", não "ok": quase todo platô legítimo cai nele.
- **O dataset é favorável.** Eu escrevi o dataset e o classificador; as famílias legítimas são curvas com ruído gaussiano, sem a maior parte das irregularidades de dados reais. Os cenários `risk_*` cobrem só alguns (arredondamento, lacuna de coleta, canal enorme), do jeito que eu os imaginei; reprocessamentos e outros defeitos de coleta não estão.

## O que NÃO detecta

- **Nenhum dos três fenômenos do enunciado, sozinho, é acusado**: pico/platô sem repetição fora dele, repetição mecânica sozinha (família `mechanical_only`: 0 de 50 acusadas) e queda abrupta sozinha ficam `inconclusive`. Só a coincidência de dois eventos independentes acusa.
- **Segundo platô muito regular conta como repetição "fora do platô"**: só o platô ligado ao primeiro sinal de salto/queda é excluído. Um segundo platô com variação < 0,5% vira segundo evento. Medido pelos cenários `risk_two_plateaus_*` (duas lives de 8 a 12 h; ver a tabela de cenários): variação de 0,2% é acusada em todos os casos, 1% quase não. O revisor mediu também evento semanal de 2 semanas com platô de 0,3% de variação acusado em 200 de 200 e com 3% em 0 de 200 (cenário `risk_weekly_2w_noise3`, com 3%). É um regime irreal para audiência humana (variação < 0,5% num platô), mas está declarado.
- **Pico ou platô comprado, com ou sem taxa fixa, sem evidência fora do platô**: fica `inconclusive`, nunca `suspicious`. Com views por hora não dá para separar de uma live ou de um destaque na página inicial. Isso inclui o platô comprado com taxa fixa (indistinguível de uma live perfeitamente constante).
- **Repetição mecânica só durante o platô** não é segundo evento, por decisão do autor.
- **Falha de coleta preenchida com o último valor** (8 h ou mais exatamente iguais) mais uma live em outro trecho: é acusada, porque os dados não distinguem isso de um bot (limite conhecido, medido em `risk_gap_fill_live`).
- **Contagem arredondada a 1000** em canais de 5 a 50 mil views/h e **canal enorme** (>= 20 mil views/h, onde 0,5% de variação ocorre por acaso) também geram falso positivo parcial.
- **Repetição com variação entre 0,5% e 2%** aparece como evidência fraca e não acusa: um bot com um pouco de ruído passa.
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
