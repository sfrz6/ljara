// Usage: node scripts/add-keys.mjs  (reads .data/en-add.txt and .data/ar-add.txt, inserts before the @@APPEND marker)
import fs from "node:fs";
for (const l of ["en", "ar"]) {
  const add = fs.readFileSync(`.data/${l}-add.txt`, "utf8").replace(/\s+$/, "");
  const f = `src/i18n/${l}.ts`;
  let s = fs.readFileSync(f, "utf8");
  s = s.replace("  // @@APPEND", add + "\n  // @@APPEND");
  fs.writeFileSync(f, s);
}
console.log("keys added");
