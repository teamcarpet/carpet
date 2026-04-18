import { CONFIG } from './config.js';

const PINATA_UPLOAD = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const PINATA_JSON   = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';

function assertJwt() {
  if (!CONFIG.pinataJwt) throw new Error('VITE_PINATA_JWT not configured');
}

export async function uploadFileToPinata(file, name) {
  assertJwt();
  const form = new FormData();
  form.append('file', file, name || file.name);
  form.append('pinataMetadata', JSON.stringify({ name: name || file.name }));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const res = await fetch(PINATA_UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CONFIG.pinataJwt}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinata upload failed: ${err}`);
  }
  const data = await res.json();
  return {
    cid: data.IpfsHash,
    url: `${CONFIG.pinataGateway}/ipfs/${data.IpfsHash}`,
    ipfsUrl: `ipfs://${data.IpfsHash}`,
  };
}

export async function uploadJsonToPinata(obj, name) {
  assertJwt();
  const res = await fetch(PINATA_JSON, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CONFIG.pinataJwt}`,
    },
    body: JSON.stringify({
      pinataContent: obj,
      pinataMetadata: { name: name || 'metadata.json' },
      pinataOptions: { cidVersion: 1 },
    }),
  });
  if (!res.ok) throw new Error(`Pinata JSON upload failed: ${await res.text()}`);
  const data = await res.json();
  return {
    cid: data.IpfsHash,
    url: `${CONFIG.pinataGateway}/ipfs/${data.IpfsHash}`,
    ipfsUrl: `ipfs://${data.IpfsHash}`,
  };
}

export async function uploadTokenMetadata({ name, symbol, description, imageFile, website, twitter, telegram }) {
  let imageUri = '';
  if (imageFile) {
    const imgResult = await uploadFileToPinata(imageFile, `${symbol}_image`);
    imageUri = imgResult.ipfsUrl;
  }
  const metadata = {
    name,
    symbol,
    description,
    image: imageUri,
    external_url: website || '',
    attributes: [],
    properties: {
      files: imageUri ? [{ uri: imageUri, type: imageFile?.type || 'image/png' }] : [],
      category: 'image',
    },
    extensions: {
      ...(twitter ? { twitter } : {}),
      ...(telegram ? { telegram } : {}),
    },
  };
  return uploadJsonToPinata(metadata, `${symbol}_metadata.json`);
}
