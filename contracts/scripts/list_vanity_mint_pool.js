const { Connection, Keypair } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");

const suffix = process.env.VANITY_SUFFIX || process.argv[2] || "rug";
const url = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const poolDir = path.join(__dirname, "..", "target", "vanity-mints");

async function main() {
  const connection = new Connection(url, "confirmed");
  const files = fs
    .readdirSync(poolDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(poolDir, entry.name))
    .sort();

  let available = 0;
  let used = 0;
  let invalid = 0;

  for (const filePath of files) {
    try {
      const keypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8")))
      );
      const address = keypair.publicKey.toBase58();
      if (!address.endsWith(suffix)) {
        invalid += 1;
        console.log("invalid", address, filePath);
        continue;
      }

      const accountInfo = await connection.getAccountInfo(keypair.publicKey);
      if (accountInfo) {
        used += 1;
        console.log("used     ", address, filePath);
      } else {
        available += 1;
        console.log("available", address, filePath);
      }
    } catch (err) {
      invalid += 1;
      console.log("invalid", filePath, err.message);
    }
  }

  console.log("");
  console.log(`Summary: available=${available} used=${used} invalid=${invalid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
