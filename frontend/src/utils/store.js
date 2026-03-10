/**
 * store.js — Reactive state. Calls contractClient for on-chain reads/writes.
 */
import { cache }                               from './cache.js';
import { getAllCampaigns as fetchFromChain,
         createCampaign  as contractCreate,
         contribute      as contractContribute } from './contractClient.js';

function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    getState()  { return state; },
    setState(u) {
      const next = typeof u === 'function' ? u(state) : u;
      state = { ...state, ...next };
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export const store = createStore({
  walletId: null, walletAddress: null, walletBalance: null, walletNetwork: null,
  campaigns: [], campaignsLoading: true,
  transactions: [],
  activeTab: 'explore', activeCategory: 'all', searchQuery: '',
  isProcessing: false, processingText: '', toasts: [],
});

// ── Campaign actions ──────────────────────────────────────────────────────────

export async function loadCampaigns() {
  store.setState({ campaignsLoading: true });
  const cached = cache.get('campaigns');
  if (cached?.length) store.setState({ campaigns: cached, campaignsLoading: false });

  try {
    const campaigns = await fetchFromChain();
    store.setState({ campaigns, campaignsLoading: false });
    cache.set('campaigns', campaigns);
  } catch (err) {
    console.warn('[store] Chain fetch failed:', err.message);
    if (!cached?.length) store.setState({ campaigns: SEED, campaignsLoading: false });
    else store.setState({ campaignsLoading: false });
  }
}

export async function createCampaign(data, ownerAddress, network) {
  const { title, desc, goal, days, category = 'tech', emoji = '🚀' } = data;

  // Validate on frontend before hitting the contract
  if (!title?.trim() || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
  if (!desc?.trim())       throw new Error('Description is required');
  if (!goal || Number(goal) <= 0) throw new Error('Goal must be greater than 0');
  if (!days || Number(days) < 1 || Number(days) > 90) throw new Error('Duration must be 1–90 days');
  if (!ownerAddress) throw new Error('Wallet not connected');

  // Call contract — convert everything to safe integers first
  const goalInt = parseInt(goal, 10);
  const daysInt = parseInt(days, 10);

  if (isNaN(goalInt) || goalInt <= 0) throw new Error('Goal must be a positive whole number');
  if (isNaN(daysInt) || daysInt < 1)  throw new Error('Duration must be at least 1 day');

  await contractCreate({
    title:        title.trim(),
    description:  desc.trim(),
    goalXlm:      goalInt,   // guaranteed integer
    durationDays: daysInt,   // guaranteed integer
  });

  // Optimistic local add while waiting for chain refresh
  const campaign = {
    id: `local_${Date.now()}`,
    title: title.trim(),
    desc: desc.trim(),
    goal: Math.round(Number(goal)),
    emoji, category,
    network: network || 'stellar-testnet',
    raised: 0, backers: 0, contributions: [],
    owner: ownerAddress,
    daysLeft: parseInt(days),
    created: Date.now(),
    withdrawn: false,
  };

  store.setState(s => ({ campaigns: [campaign, ...s.campaigns] }));
  addTransaction({ dir: 'out', label: `Created: ${campaign.title}`, amount: 0 });

  // Refresh from chain after 3 seconds to get the real ID
  setTimeout(() => loadCampaigns(), 3000);
  return campaign;
}

export async function contribute(campaignId, amount, walletAddress) {
  if (!walletAddress) throw new Error('Wallet not connected');
  if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than 0');

  // Round to whole XLM — contract only accepts whole numbers
  const wholeAmount = Math.round(Number(amount));
  if (wholeAmount <= 0) throw new Error('Amount must be at least 1 XLM');

  await contractContribute({
    campaignId: Number(campaignId),
    amountXlm:  wholeAmount,   // whole XLM integer
  });

  // Optimistic local update
  store.setState(s => {
    const campaigns = s.campaigns.map(c => {
      if (String(c.id) !== String(campaignId)) return c;
      return {
        ...c,
        raised:  c.raised + wholeAmount,
        backers: c.backers + 1,
        contributions: [{ addr: walletAddress, amount: wholeAmount, ts: Date.now() }, ...c.contributions],
      };
    });
    cache.set('campaigns', campaigns);
    return { campaigns };
  });

  const camp = store.getState().campaigns.find(c => String(c.id) === String(campaignId));
  addTransaction({ dir: 'out', label: `Backed: ${camp?.title ?? campaignId}`, amount: wholeAmount });

  setTimeout(() => loadCampaigns(), 3000);
}

// ── UI helpers ────────────────────────────────────────────────────────────────

export function addTransaction({ dir, label, amount }) {
  const tx = { id: Date.now(), dir, label, amount, ts: Date.now() };
  store.setState(s => {
    const transactions = [tx, ...s.transactions];
    cache.set('transactions', transactions);
    return { transactions };
  });
}

export function showToast(msg, type = 'info', ms = 3500) {
  const id = Date.now() + Math.random();
  store.setState(s => ({ toasts: [...s.toasts, { id, message: msg, type }] }));
  setTimeout(() => store.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), ms);
}

export function setProcessing(active, text = '') {
  store.setState({ isProcessing: active, processingText: text });
}

export function getFilteredCampaigns() {
  const { campaigns, activeCategory, searchQuery } = store.getState();
  return campaigns.filter(c => {
    const matchCat = activeCategory === 'all' || c.category === activeCategory;
    const q = searchQuery.toLowerCase();
    return matchCat && (!q || c.title?.toLowerCase().includes(q) || c.desc?.toLowerCase().includes(q));
  });
}

// ── Seed data (shown when wallet not connected / RPC down) ────────────────────

const SEED = [
  { id:'s1', title:'ZeroGas Protocol', emoji:'⚡', desc:'Fee-less micro-transactions on Stellar.', category:'defi', goal:5000, raised:3800, backers:142, owner:'GABC...', network:'stellar-testnet', daysLeft:8,  contributions:[], withdrawn:false },
  { id:'s2', title:'Stellar Art DAO',  emoji:'🎨', desc:'On-chain gallery curated by XLM holders.',  category:'art',  goal:2000, raised:2000, backers:89,  owner:'GXYZ...', network:'stellar-testnet', daysLeft:0,  contributions:[], withdrawn:false },
  { id:'s3', title:'DeFi for India',   emoji:'🌍', desc:'Mobile DeFi education in local languages.', category:'social',goal:1500, raised:620,  backers:201, owner:'GIJK...', network:'stellar-testnet', daysLeft:19, contributions:[], withdrawn:false },
];