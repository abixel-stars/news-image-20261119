import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Entry program for make.fun news-image-20261119.
// It copies the finished summary image into the output directory.
// No network, no randomness: the same input always produces the same bytes.

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? "out");
const source = join(repoRoot, "entry.png");
const target = join(outDir, "entry.png");

if (!existsSync(source)) {
  throw new Error("entry.png is missing from the repository root");
}

mkdirSync(outDir, { recursive: true });
copyFileSync(source, target);
const bytes = statSync(target).size;
console.log(`entry.png written to ${target} (${bytes} bytes)`);
