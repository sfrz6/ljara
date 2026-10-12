/** Fails when the em dash character appears anywhere in the repository (project writing rule). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SKIP = new Set(["AGENTS.md", "Idea.md", "Ijara-Proposal.pdf", "node_modules", ".next", ".git", ".data", ".vercel", "test-results", "playwright-report"]);
const BINARY = /\.(png|jpg|jpeg|webp|ico|woff2?|pdf|zip|gz)$/i;
const DASH = String.fromCharCode(0x2014);
let found = 0;

function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (!BINARY.test(name) && st.size < 3_000_000) {
      const text = readFileSync(full, "utf8");
      text.split("\n").forEach((line, i) => {
        if (line.includes(DASH)) {
          found += 1;
          console.log(`${path.relative(process.cwd(), full)}:${i + 1}`);
        }
      });
    }
  }
}

walk(process.cwd());
if (found) {
  console.error(`Found ${found} line(s) containing an em dash.`);
  process.exit(1);
}
console.log("No em dashes found.");
