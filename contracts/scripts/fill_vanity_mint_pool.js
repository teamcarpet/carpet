const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const suffix = process.env.VANITY_SUFFIX || process.argv[2] || "rug";
const count = Number(process.env.VANITY_COUNT || process.argv[3] || 5);
const threads = Number(process.env.VANITY_THREADS || process.argv[4] || 8);

if (!Number.isInteger(count) || count < 1) {
  throw new Error("Vanity count must be a positive integer");
}

const poolDir = path.join(__dirname, "..", "target", "vanity-mints");
fs.mkdirSync(poolDir, { recursive: true });
fs.mkdirSync(path.join(poolDir, "used"), { recursive: true });

const solanaKeygen =
  process.env.SOLANA_KEYGEN ||
  "/Users/macbookprom1/.local/share/solana/install/active_release/bin/solana-keygen";

console.log(`Filling vanity mint pool: suffix=${suffix} count=${count} threads=${threads}`);
console.log(`Output directory: ${poolDir}`);

const result = spawnSync(
  solanaKeygen,
  [
    "grind",
    "--ends-with",
    `${suffix}:${count}`,
    "--num-threads",
    String(threads),
  ],
  {
    cwd: poolDir,
    stdio: "inherit",
  }
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}
