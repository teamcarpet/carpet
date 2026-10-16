import { CONFIG } from './config.js';

// Uploads go through server/index.js so the Pinata JWT never ships to the browser.

async function post(path, init) {
  const res = await fetch(`${CONFIG.appServerUrl}${path}`, { method: 'POST', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

export async function uploadFileToPinata(file, name) {
  return post('/upload/image', {
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': name || file.name || 'image' },
    body: file,
  });
}

export async function uploadTokenMetadata({ name, symbol, description, imageFile, website, twitter, telegram }) {
  let image = '';
  let imageType = '';
  if (imageFile) {
    const img = await uploadFileToPinata(imageFile, `${symbol}_image`);
    image = img.ipfsUrl;
    imageType = img.type;
  }
  return post('/upload/metadata', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, symbol, description, image, imageType, website, twitter, telegram }),
  });
}
