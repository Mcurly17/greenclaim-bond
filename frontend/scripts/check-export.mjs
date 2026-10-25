// Fails if the exported site still contains the development-only `?checks=off` mode.
// Run after `next build` (output: "export" writes ./out).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
const FORBIDDEN = [
  { label: 'the "checks" query parameter', re: /["'`]checks["'`]/ },
  { label: "the checks-off notice", re: /Client-side checks are off/ },
];
// Proof that the scan reads the real bundles: the challenge form must be there.
const REQUIRED = { label: "the challenge form", re: /File challenge/ };

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(js|html|txt)$/.test(name) ? [path] : [];
  });
}

let list;
try {
  list = files(OUT);
} catch {
  console.error(`check-export: ${OUT} not found; run next build first.`);
  process.exit(1);
}

const problems = [];
let required = false;
for (const file of list) {
  const text = readFileSync(file, "utf8");
  for (const { label, re } of FORBIDDEN) if (re.test(text)) problems.push(`${label} in ${file}`);
  if (REQUIRED.re.test(text)) required = true;
}
if (!required) problems.push(`${REQUIRED.label} not found: the scan did not read the bundles`);

if (problems.length) {
  for (const p of problems) console.error(`check-export: ${p}`);
  process.exit(1);
}
console.log(`check-export: ${list.length} files, no development-only checks-off code in the export.`);
