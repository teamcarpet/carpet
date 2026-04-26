const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Transaction, TransactionInstruction } = require("@solana/web3.js");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const MINT = new PublicKey(process.env.MINT);
const TOKEN_NAME = process.env.TOKEN_NAME;
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL;
const TOKEN_URI = process.env.TOKEN_URI || defaultMetadataUri(TOKEN_NAME, TOKEN_SYMBOL);

if (!process.env.MINT || !TOKEN_NAME || !TOKEN_SYMBOL) {
  console.error("Usage: MINT=<mint> TOKEN_NAME=<name> TOKEN_SYMBOL=<symbol> node scripts/update_token_metadata_uri.js");
  process.exit(1);
}

function defaultMetadataUri(name, symbol) {
  const metadata = {
    name,
    symbol,
    description: `${name} token on Carpet launchpad devnet`,
    image: "",
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString(
    "base64"
  )}`;
}

function writeString(value) {
  const body = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  return Buffer.concat([len, body]);
}

function writeOption(buffer) {
  return buffer ? Buffer.concat([Buffer.from([1]), buffer]) : Buffer.from([0]);
}

function writeU16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function createUpdateMetadataInstruction({ metadata, updateAuthority }) {
  const updateMetadataAccountV2 = 15;
  const dataV2 = Buffer.concat([
    writeString(TOKEN_NAME),
    writeString(TOKEN_SYMBOL),
    writeString(TOKEN_URI),
    writeU16(0),
    writeOption(null), // creators
    writeOption(null), // collection
    writeOption(null), // uses
  ]);

  const data = Buffer.concat([
    Buffer.from([updateMetadataAccountV2]),
    writeOption(dataV2),
    writeOption(null), // new update authority
    writeOption(null), // primary sale happened
    writeOption(Buffer.from([1])), // is mutable
  ]);

  return new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: updateAuthority, isSigner: true, isWritable: false },
    ],
    data,
  });
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), MINT.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );

  const tx = new Transaction().add(
    createUpdateMetadataInstruction({
      metadata: metadataPda,
      updateAuthority: provider.wallet.publicKey,
    })
  );
  const signature = await provider.sendAndConfirm(tx, []);

  console.log("Mint:", MINT.toBase58());
  console.log("Metadata:", metadataPda.toBase58());
  console.log("Name:", TOKEN_NAME);
  console.log("Symbol:", TOKEN_SYMBOL);
  console.log("URI:", TOKEN_URI);
  console.log("Transaction:", signature);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
