import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATASET_SEED, generateDataset } from "../src/dataset.ts";
import { evaluate, familyTable, marker, readmeBlocks } from "../src/evaluate.ts";

// Uso: npm run dataset [-- --update-readme]
// Gera data/synthetic.json e data/report.json, imprime as taxas medidas e,
// com --update-readme, reescreve só o conteúdo entre os marcadores do README.
const samples = generateDataset(DATASET_SEED);
const report = evaluate(samples, DATASET_SEED);
const blocks = readmeBlocks(report);

mkdirSync("data", { recursive: true });
writeFileSync("data/synthetic.json", JSON.stringify({ seed: DATASET_SEED, samples }));
writeFileSync("data/report.json", JSON.stringify({ ...report, readme: blocks }, null, 2) + "\n");

console.log(`seed ${DATASET_SEED}: ${samples.length} séries (${report.legit.total} legítimas, ${report.suspicious.total} suspeitas)`);
console.log(`Taxa de falso positivo: ${blocks["fp-rate"]}`);
console.log(`Inconclusive entre legítimos: ${blocks["legit-inconclusive"]}`);
console.log(`Detecção nos suspeitos: ${blocks["detection"]}`);
console.log("\nAntes/depois da regra de repetição forte:" + blocks["before-after"]);
console.log(familyTable(report));
console.log(blocks["scenarios"]);
console.log("Decomposição: " + blocks["fp-breakdown"]);
console.log("\nSensibilidade da repetição forte a séries aleatórias (Poisson):" + blocks["poisson-sensitivity"]);

if (process.argv.includes("--update-readme")) {
  let readme = readFileSync("README.md", "utf8");
  for (const [name, text] of Object.entries(blocks)) {
    const re = new RegExp(`<!-- ${name}:start -->[\\s\\S]*?<!-- ${name}:end -->`);
    if (!re.test(readme)) throw new Error(`marcador ${name} não encontrado no README`);
    readme = readme.replace(re, () => marker(name, text));
  }
  writeFileSync("README.md", readme);
  console.log("\nREADME.md atualizado entre os marcadores.");
}
