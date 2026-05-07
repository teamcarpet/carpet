import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { CONFIG } from './config.js';

let _provider = null;
let _pubkey = null;
let _balance = 0;
let _walletName = null;
const _listeners = new Set();

function walletCandidates() {
  const candidates = [
    ['Phantom', window.phantom?.solana],
    ['Solflare', window.solflare],
    ['Backpack', window.backpack?.solana],
    ['Phantom', window.solana?.isPhantom ? window.solana : null],
    ['Solflare', window.solana?.isSolflare ? window.solana : null],
    ['Backpack', window.solana?.isBackpack ? window.solana : null],
  ];
  const seen = new Set();
  return candidates
    .filter(([, provider]) => provider?.connect && provider?.signTransaction)
    .filter(([, provider]) => {
      if (seen.has(provider)) return false;
      seen.add(provider);
      return true;
    });
}

function getProvider(preferredName = null) {
  const candidates = walletCandidates();
  if (preferredName) {
    const found = candidates.find(([name]) => name.toLowerCase() === preferredName.toLowerCase());
    if (found) return { name: found[0], provider: found[1] };
  }
  const found = candidates[0];
  return found ? { name: found[0], provider: found[1] } : null;
}

export function isConnected() { return !!_pubkey; }
export function getPublicKey() { return _pubkey; }
export function getBalance() { return _balance; }
export function getWalletName() { return _walletName; }
export function getWalletProvider() { return _provider; }
export function getSupportedWallets() { return walletCandidates().map(([name]) => name); }
export function getShortAddress() {
  if (!_pubkey) return null;
  const s = _pubkey.toBase58();
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

export function onWalletChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function emit() { _listeners.forEach(fn => fn({ pubkey: _pubkey, balance: _balance, walletName: _walletName })); }

export async function connectWallet(preferredName = null, opts = {}) {
  const { onlyIfTrusted = false, silent = false } = opts;
  const lastUsed = preferredName || (typeof localStorage !== 'undefined' ? localStorage.getItem('carpet:lastWallet') : null);
  const selected = getProvider(lastUsed);
  if (!selected) {
    if (silent || onlyIfTrusted) return null;
    window.open('https://phantom.app/', '_blank');
    throw new Error('Install Phantom, Solflare, or Backpack to connect');
  }
  const { name, provider } = selected;
  _provider = provider;
  _walletName = name;

  let resp;
  try {
    resp = await (onlyIfTrusted ? provider.connect({ onlyIfTrusted: true }) : provider.connect());
  } catch (err) {
    // onlyIfTrusted throws when the user previously revoked or never connected — that's ok, stay disconnected.
    _provider = null;
    _walletName = null;
    if (onlyIfTrusted || silent) return null;
    throw err;
  }

  _pubkey = resp?.publicKey || provider.publicKey;
  if (!_pubkey) {
    _provider = null;
    _walletName = null;
    if (onlyIfTrusted || silent) return null;
    throw new Error(`${name} did not return a public key`);
  }
  _pubkey = new PublicKey(_pubkey.toBase58 ? _pubkey.toBase58() : _pubkey);

  // Persist choice so we can auto-reconnect to the SAME wallet next session.
  try { localStorage.setItem('carpet:lastWallet', name); } catch {}

  await refreshBalance();

  // Avoid stacking listeners on repeated connects (e.g. user clicks Connect twice).
  if (!provider.__carpetListenersAttached) {
    provider.on('disconnect', () => {
      _pubkey = null;
      _balance = 0;
      _provider = null;
      _walletName = null;
      try { localStorage.removeItem('carpet:lastWallet'); } catch {}
      emit();
    });
    provider.on('accountChanged', async (pk) => {
      _pubkey = pk ? new PublicKey(pk.toBase58 ? pk.toBase58() : pk) : null;
      if (_pubkey) await refreshBalance();
      else _balance = 0;
      emit();
    });
    provider.__carpetListenersAttached = true;
  }

  emit();
  return { pubkey: _pubkey, balance: _balance };
}

export async function disconnectWallet() {
  if (_provider) await _provider.disconnect();
  _pubkey = null;
  _balance = 0;
  _provider = null;
  _walletName = null;
  try { localStorage.removeItem('carpet:lastWallet'); } catch {}
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
  if (!transaction.recentBlockhash) transaction.recentBlockhash = blockhash;
  if (!transaction.feePayer) transaction.feePayer = _pubkey;

  const signed = await _provider.signTransaction(transaction);
  const sig = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  return sig;
}

export function getAnchorWallet() {
  if (!_provider || !_pubkey) throw new Error('Wallet not connected');
  return {
    publicKey: _pubkey,
    signTransaction: (tx) => _provider.signTransaction(tx),
    signAllTransactions: (txs) => _provider.signAllTransactions
      ? _provider.signAllTransactions(txs)
      : Promise.all(txs.map((tx) => _provider.signTransaction(tx))),
  };
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
