const { Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const suffix = process.argv[2];
if (!suffix) {
  console.error("Usage: node scripts/find_vanity_mint.js <suffix>");
  process.exit(1);
}

const outputDir = path.join(__dirname, "..", "target", "vanity-mints");
fs.mkdirSync(outputDir, { recursive: true });

let attempts = 0;
const start = Date.now();

while (true) {
  const keypair = Keypair.generate();
  attempts += 1;
  const address = keypair.publicKey.toBase58();

  if (address.endsWith(suffix)) {
    const filePath = path.join(outputDir, `mint-${suffix}.json`);
    fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
    console.log("Found vanity mint");
    console.log("Address:", address);
    console.log("Suffix:", suffix);
    console.log("Attempts:", attempts);
    console.log("Seconds:", ((Date.now() - start) / 1000).toFixed(2));
    console.log("Keypair:", filePath);
    break;
  }

  if (attempts % 100000 === 0) {
    const seconds = (Date.now() - start) / 1000;
    const rate = Math.round(attempts / Math.max(seconds, 1));
    console.log(`Still searching... attempts=${attempts} rate=${rate}/sec`);
  }
}
