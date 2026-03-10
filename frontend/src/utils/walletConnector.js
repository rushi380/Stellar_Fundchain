/**
 * walletConnector.js
 * Fixed Freighter detection for v2+ extension
 *
 * Freighter v2 no longer injects window.freighter
 * It now uses the @stellar/freighter-api npm package only
 * The extension communicates via postMessage — not window globals
 */

export const NETWORKS = {
  STELLAR_TESTNET: {
    id: 'stellar-testnet', name: 'Stellar Testnet', symbol: 'XLM', color: '#08b5e5',
    passphrase: 'Test SDF Network ; September 2015',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl:     'https://soroban-testnet.stellar.org',
    testnet:    true,
  },
  ETHEREUM_SEPOLIA: {
    id: 'eth-sepolia', name: 'Ethereum Sepolia', symbol: 'SepoliaETH',
    chainId: '0xaa36a7', color: '#627eea', testnet: true,
  },
  SOLANA_DEVNET: {
    id: 'solana-devnet', name: 'Solana Devnet', symbol: 'SOL',
    rpcUrl: 'https://api.devnet.solana.com', color: '#9945ff', testnet: true,
  },
};

export class WalletError extends Error {
  constructor(message, code, walletId) {
    super(message);
    this.name = 'WalletError'; this.code = code; this.walletId = walletId;
  }
}

// ── Freighter ─────────────────────────────────────────────────────────────────

export const freighterConnector = {
  id: 'freighter', name: 'Freighter',
  network: NETWORKS.STELLAR_TESTNET,
  address: null, balance: null, _api: null,

  icon: `<svg viewBox="0 0 40 40" width="28" height="28">
    <circle cx="20" cy="20" r="18" fill="#08b5e5" opacity="0.15" stroke="#08b5e5" stroke-width="2"/>
    <circle cx="20" cy="20" r="8" fill="#08b5e5"/>
    <path fill="white" d="M17 17h6v2h-6zM17 21h6v2h-6z"/>
  </svg>`,

  // Freighter v2 does NOT inject window.freighter anymore
  // The only way to detect it is to try calling the API
  // So we always return true here and handle "not installed"
  // inside connect() with a proper error message
  isAvailable() {
    return true;
  },

  async connect() {
    // ── Load the @stellar/freighter-api package ───────────────────────────────
    // This npm package communicates with the extension via postMessage
    // It works even though window.freighter is not defined
    let api;
    try {
      api = await import('@stellar/freighter-api');
    } catch (e) {
      throw new WalletError(
        'Could not load Freighter API. Run: npm install @stellar/freighter-api',
        'LOAD_ERROR', this.id
      );
    }

    // ── Check if extension is actually installed ───────────────────────────────
    // isConnected() returns { isConnected: true } only if extension is present
    let extensionPresent = false;
    try {
      const result = await api.isConnected();
      // v2 returns { isConnected: bool }, v1 returns bool directly
      extensionPresent = result?.isConnected ?? result ?? false;
    } catch {
      extensionPresent = false;
    }

    if (!extensionPresent) {
      throw new WalletError(
        'Freighter extension not detected.\n\n' +
        '1. Make sure Freighter is installed from freighter.app\n' +
        '2. Make sure the extension is ENABLED in chrome://extensions\n' +
        '3. Try refreshing the page after installing',
        'NOT_INSTALLED', this.id
      );
    }

    // ── Request access — shows the Freighter popup ────────────────────────────
    let address = null;

    // Try requestAccess first (v2 preferred method)
    if (typeof api.requestAccess === 'function') {
      try {
        const result = await api.requestAccess();
        address = result?.address ?? null;
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('denied') || msg.includes('reject') || msg.includes('declined')) {
          throw new WalletError(
            'You clicked Reject in Freighter. Click the extension and try again, then click "Allow".',
            'REJECTED', this.id
          );
        }
        // requestAccess failed for other reason, try getAddress below
      }
    }

    // Fallback: getAddress (v2) or getPublicKey (v1)
    if (!address) {
      try {
        if (typeof api.getAddress === 'function') {
          const result = await api.getAddress();
          address = result?.address ?? result;
        } else if (typeof api.getPublicKey === 'function') {
          const result = await api.getPublicKey();
          address = result?.publicKey ?? result;
        }
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('not allowed') || msg.includes('no accounts')) {
          throw new WalletError(
            'Freighter has no accounts. Open Freighter and create or import a wallet first.',
            'NO_ACCOUNTS', this.id
          );
        }
        throw new WalletError(
          'Freighter did not return an address. Open Freighter and make sure it is unlocked.',
          'CONNECT_ERROR', this.id
        );
      }
    }

    if (!address || typeof address !== 'string' || !address.startsWith('G')) {
      throw new WalletError(
        'Invalid address from Freighter. Make sure your Freighter wallet is set up correctly.',
        'NO_KEY', this.id
      );
    }

    // ── Check network ─────────────────────────────────────────────────────────
    try {
      let networkName = null;

      if (typeof api.getNetworkDetails === 'function') {
        const d = await api.getNetworkDetails();
        networkName = d?.network ?? null;
      } else if (typeof api.getNetwork === 'function') {
        const r = await api.getNetwork();
        networkName = r?.network ?? r ?? null;
      }

      if (networkName) {
        const isTestnet =
          networkName === 'TESTNET' ||
          networkName.includes('Test SDF') ||
          networkName.toLowerCase().includes('testnet');

        if (!isTestnet) {
          throw new WalletError(
            `Wrong network! You are on "${networkName}".\n\nHow to fix:\n1. Open Freighter extension\n2. Click the network name at the top\n3. Select "Test SDF Network ; September 2015" (Testnet)`,
            'WRONG_NETWORK', this.id
          );
        }
      }
    } catch (err) {
      if (err instanceof WalletError) throw err;
      // Network check unavailable — continue anyway
    }

    this.address = address;
    this._api    = api;

    // ── Fetch XLM balance from Horizon ────────────────────────────────────────
    try {
      const resp = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
      if (resp.ok) {
        const data   = await resp.json();
        const native = data.balances?.find(b => b.asset_type === 'native');
        this.balance = native ? parseFloat(native.balance).toFixed(2) : '0.00';
      } else {
        this.balance = '0.00';
      }
    } catch {
      this.balance = '—';
    }

    return { address: this.address, balance: this.balance, network: this.network };
  },

  async disconnect() {
    this.address = null; this.balance = null; this._api = null;
  },

  async signTransaction(xdr) {
    if (!this._api) throw new WalletError('Not connected', 'NOT_CONNECTED', this.id);
    try {
      const result = await this._api.signTransaction(xdr, {
        networkPassphrase: NETWORKS.STELLAR_TESTNET.passphrase,
        network: 'TESTNET',
      });
      return result?.signedTxXdr ?? result?.signedXDR ?? result;
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('declined') || msg.includes('rejected')) {
        throw new WalletError('You rejected signing in Freighter.', 'REJECTED', this.id);
      }
      throw new WalletError(`Signing failed: ${err.message}`, 'SIGN_ERROR', this.id);
    }
  },
};

// ── MetaMask ──────────────────────────────────────────────────────────────────

export const metamaskConnector = {
  id: 'metamask', name: 'MetaMask', network: NETWORKS.ETHEREUM_SEPOLIA,
  address: null, balance: null,
  icon: `<svg viewBox="0 0 40 40" width="28" height="28"><path fill="#E2761B" d="M34 3L22 12l2-5L34 3z"/><path fill="#E4761B" d="M6 3l12 9-2-5L6 3zM30 27l-3 5 7 2 2-7-6 0zM4 27l2 7 7-2-3-5-6 0z"/></svg>`,

  isAvailable() {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined' &&
      (window.ethereum.isMetaMask || window.ethereum.providers?.some(p => p.isMetaMask));
  },

  async connect() {
    if (!this.isAvailable()) throw new WalletError('MetaMask not installed.', 'NOT_INSTALLED', this.id);
    const p = window.ethereum.providers?.find(p => p.isMetaMask) || window.ethereum;
    const a = await p.request({ method: 'eth_requestAccounts' });
    this.address = a[0]; this._provider = p;
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
    } catch (e) {
      if (e.code === 4902) {
        await p.request({ method: 'wallet_addEthereumChain', params: [{
          chainId: '0xaa36a7', chainName: 'Sepolia Testnet',
          rpcUrls: ['https://rpc.sepolia.org'],
          nativeCurrency: { name: 'Sepolia ETH', symbol: 'SepoliaETH', decimals: 18 },
        }]});
      }
    }
    const b = await p.request({ method: 'eth_getBalance', params: [this.address, 'latest'] });
    this.balance = (parseInt(b, 16) / 1e18).toFixed(4);
    return { address: this.address, balance: this.balance, network: this.network };
  },

  async disconnect() { this.address = null; this.balance = null; this._provider = null; },
};

// ── Phantom ───────────────────────────────────────────────────────────────────

export const phantomConnector = {
  id: 'phantom', name: 'Phantom', network: NETWORKS.SOLANA_DEVNET,
  address: null, balance: null,
  icon: `<svg viewBox="0 0 40 40" width="28" height="28"><circle cx="20" cy="20" r="18" fill="#9945ff" opacity="0.15" stroke="#9945ff" stroke-width="2"/><path fill="#9945ff" d="M27 17a7 7 0 00-14 0v2c0 3.9 3.1 7 7 7s7-3.1 7-7v-2zm-7 7a5 5 0 110-10 5 5 0 010 10z"/></svg>`,

  isAvailable() { return typeof window !== 'undefined' && window.solana?.isPhantom; },

  async connect() {
    if (!this.isAvailable()) throw new WalletError('Phantom not installed.', 'NOT_INSTALLED', this.id);
    try {
      const r = await window.solana.connect();
      this.address = r.publicKey.toString(); this._solana = window.solana;
      const rpc = await fetch('https://api.devnet.solana.com', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getBalance', params:[this.address] }),
      });
      const d = await rpc.json();
      this.balance = d.result?.value ? (d.result.value / 1e9).toFixed(4) : '0';
      return { address: this.address, balance: this.balance, network: this.network };
    } catch (e) {
      if (e.code === 4001) throw new WalletError('Rejected', 'REJECTED', this.id);
      throw new WalletError(e.message, 'CONNECT_ERROR', this.id);
    }
  },

  async disconnect() {
    if (this._solana) await this._solana.disconnect().catch(() => {});
    this.address = null; this.balance = null; this._solana = null;
  },
};

// ── Registry + Manager ────────────────────────────────────────────────────────

export const WALLETS = [freighterConnector, metamaskConnector, phantomConnector];

class WalletManager {
  constructor() { this.activeWallet = null; this._listeners = new Set(); }
  subscribe(fn)  { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  emit(ev, d)    { this._listeners.forEach(fn => fn(ev, d)); }

  async connect(walletId) {
    const w = WALLETS.find(w => w.id === walletId);
    if (!w) throw new Error(`Unknown wallet: ${walletId}`);
    const result = await w.connect();
    this.activeWallet = w;
    this.emit('connected', { wallet: w, ...result });
    try { localStorage.setItem('fc_last_wallet', walletId); } catch {}
    return result;
  }

  async disconnect() {
    if (!this.activeWallet) return;
    await this.activeWallet.disconnect();
    this.emit('disconnected', { walletId: this.activeWallet.id });
    this.activeWallet = null;
    try { localStorage.removeItem('fc_last_wallet'); } catch {}
  }

  getAddress()  { return this.activeWallet?.address ?? null; }
  getBalance()  { return this.activeWallet?.balance ?? null; }
  getNetwork()  { return this.activeWallet?.network ?? null; }
  isConnected() { return !!this.activeWallet?.address; }

  async tryAutoReconnect() {
    try {
      const lastId = localStorage.getItem('fc_last_wallet');
      if (!lastId) return false;
      if (lastId === 'freighter') {
        await this.connect('freighter'); return true;
      }
      if (lastId === 'metamask' && metamaskConnector.isAvailable()) {
        const a = await window.ethereum.request({ method: 'eth_accounts' });
        if (a?.length) { await this.connect('metamask'); return true; }
      }
      if (lastId === 'phantom' && window.solana?.isConnected) {
        await this.connect('phantom'); return true;
      }
    } catch {}
    return false;
  }
}

export const walletManager = new WalletManager();