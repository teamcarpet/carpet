import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { CONFIG } from './config.js';

let _provider = null;
let _pubkey = null;
let _balance = 0;
const _listeners = new Set();

function getProvider() {
  if ('phantom' in window) return window.phantom?.solana;
  if ('solana' in window && window.solana?.isPhantom) return window.solana;
  return null;
}

export function isConnected() { return !!_pubkey; }
export function getPublicKey() { return _pubkey; }
export function getBalance() { return _balance; }
export function getShortAddress() {
  if (!_pubkey) return null;
  const s = _pubkey.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export function onWalletChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function emit() { _listeners.forEach(fn => fn({ pubkey: _pubkey, balance: _balance })); }

export async function connectWallet() {
  const provider = getProvider();
  if (!provider) {
    window.open('https://phantom.app/', '_blank');
    throw new Error('Phantom wallet not installed');
  }
  _provider = provider;
  const resp = await provider.connect();
  _pubkey = resp.publicKey;
  await refreshBalance();

  provider.on('disconnect', () => {
    _pubkey = null;
    _balance = 0;
    _provider = null;
    emit();
  });
  provider.on('accountChanged', async (pk) => {
    _pubkey = pk || null;
    if (_pubkey) await refreshBalance();
    else _balance = 0;
    emit();
  });

  emit();
  return { pubkey: _pubkey, balance: _balance };
}

export async function disconnectWallet() {
  if (_provider) await _provider.disconnect();
  _pubkey = null;
  _balance = 0;
  _provider = null;
  emit();
}

export async function refreshBalance() {
  if (!_pubkey) return 0;
  try {
    const conn = new Connection(CONFIG.solanaRpc, 'confirmed');
    const lamports = await conn.getBalance(_pubkey);
    _balance = lamports / LAMPORTS_PER_SOL;
    emit();
  } catch (e) {
    console.warn('Balance fetch failed:', e.message);
  }
  return _balance;
}

export async function signAndSendTransaction(transaction) {
  if (!_provider || !_pubkey) throw new Error('Wallet not connected');
  const conn = new Connection(CONFIG.solanaRpc, 'confirmed');
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = _pubkey;

  const signed = await _provider.signTransaction(transaction);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  return sig;
}

export async function signAndSendVersionedTransaction(serializedTx) {
  if (!_provider) throw new Error('Wallet not connected');
  const tx = Buffer.from(serializedTx, 'base64');
  const { VersionedTransaction } = await import('@solana/web3.js');
  const vtx = VersionedTransaction.deserialize(tx);
  const signed = await _provider.signTransaction(vtx);
  const conn = new Connection(CONFIG.solanaRpc, 'confirmed');
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(sig, 'confirmed');
  return sig;
}

export async function copyAddress() {
  if (!_pubkey) return;
  await navigator.clipboard.writeText(_pubkey.toBase58());
}
