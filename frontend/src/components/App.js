/**
 * App.js — Root application component
 * Mounts the dApp, subscribes to store, handles all modals.
 */

import {
  renderNav, renderHero, renderCampaignGrid, renderSkeletons,
  renderDetailModal, renderMyCampaigns, renderTransactions,
  renderToasts, renderProcessingOverlay, openWalletModal,
} from './index.js';

import {
  store, loadCampaigns, createCampaign, contribute,
  showToast, setProcessing, getFilteredCampaigns,
} from '../utils/store.js';

import { walletManager } from '../utils/walletConnector.js';

let root;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

export function initApp(container) {
  root = container;
  render();

  store.subscribe(state => {
    updateNav(state);
    updateStatsBar(state);
    updateTabContent(state);
    updateToasts(state);
    updateProcessingOverlay(state);
  });

  loadCampaigns();

  walletManager.tryAutoReconnect().then(ok => {
    if (!ok) return;
    const w = walletManager.activeWallet;
    store.setState({
      walletId: w.id, walletAddress: w.address,
      walletBalance: w.balance, walletNetwork: w.network,
    });
    showToast(`Reconnected: ${w.name}`, 'success');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(m => m.remove());
    }
  });

  // Expose to inline onclick handlers
  window.__fc = { openCreateModal, openContributeModal, openDetailModal, openWalletModal };
}

// ── Initial render ────────────────────────────────────────────────────────────

function render() {
  const s = store.getState();
  root.innerHTML = `
    ${renderProcessingOverlay(s)}
    <div id="toast-area"></div>
    ${renderNav(s)}
    <main>
      ${renderHero()}
      ${renderStatsBar(s)}
      ${renderTabsBar(s)}
      <div class="main-content" id="main-content">
        ${renderTabContent(s)}
      </div>
    </main>`;
  bindGlobalEvents();
}

// ── Partial updaters ──────────────────────────────────────────────────────────

function updateNav(state) {
  const el = document.getElementById('nav-root');
  if (!el) return;
  const next = document.createElement('div');
  next.innerHTML = renderNav(state);
  el.replaceWith(next.firstElementChild);
  // re-bind nav buttons
  document.getElementById('wallet-btn')?.addEventListener('click', handleWalletClick);
  document.getElementById('create-campaign-btn')?.addEventListener('click', openCreateModal);
}

function updateStatsBar(state) {
  const el = document.getElementById('stats-bar');
  if (!el) return;
  const next = document.createElement('div');
  next.innerHTML = renderStatsBar(state);
  el.replaceWith(next.firstElementChild);
}

function updateTabContent(state) {
  const el = document.getElementById('main-content');
  if (el) { el.innerHTML = renderTabContent(state); bindTabEvents(); }
}

function updateToasts(state) {
  const el = document.getElementById('toast-area');
  if (el) el.innerHTML = renderToasts(state.toasts);
}

function updateProcessingOverlay(state) {
  const el = document.getElementById('processing-overlay');
  if (!el) return;
  el.className = `processing-overlay ${state.isProcessing ? 'active' : ''}`;
  const t = el.querySelector('.processing-text');
  if (t) t.textContent = state.processingText;
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function renderStatsBar(state) {
  const { campaigns } = state;
  const raised  = campaigns.reduce((s, c) => s + (c.raised || 0), 0);
  const backers = campaigns.reduce((s, c) => s + (c.backers || 0), 0);
  return `
    <div id="stats-bar" class="stats-bar">
      <div class="stat-item">
        <div class="stat-value">${campaigns.length}</div>
        <div class="stat-label">Campaigns</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${raised.toFixed(0)} XLM</div>
        <div class="stat-label">Total Raised</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${backers}</div>
        <div class="stat-label">Backers</div>
      </div>
    </div>`;
}

function renderTabsBar(state) {
  const tabs = [
    { id: 'explore',      label: '🔭 Explore' },
    { id: 'my-campaigns', label: '📁 My Campaigns' },
    { id: 'transactions', label: '🧾 Transactions' },
  ];
  return `
    <div class="tabs">
      ${tabs.map(t => `
        <button class="tab-btn ${state.activeTab === t.id ? 'active' : ''}"
                data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>`;
}

function renderTabContent(state) {
  switch (state.activeTab) {
    case 'my-campaigns': return renderMyCampaigns(state);
    case 'transactions': return renderTransactions(state);
    default:             return renderExploreTab(state);
  }
}

function renderExploreTab(state) {
  const list = getFilteredCampaigns();
  return `
    <div class="section-header">
      <div class="section-title">Active Campaigns</div>
      <input class="search-input" id="search-input" placeholder="Search..." value="${state.searchQuery}" />
    </div>
    <div class="filter-bar">
      ${['all','tech','art','social','gaming','defi'].map(cat => `
        <button class="filter-chip ${state.activeCategory === cat ? 'active' : ''}" data-cat="${cat}">
          ${cat === 'all' ? 'All' : cat}
        </button>`).join('')}
    </div>
    <div class="campaign-grid">
      ${state.campaignsLoading ? renderSkeletons(6) : renderCampaignGrid(list)}
    </div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindGlobalEvents() {
  document.getElementById('wallet-btn')?.addEventListener('click', handleWalletClick);
  document.getElementById('create-campaign-btn')?.addEventListener('click', openCreateModal);

  document.addEventListener('click', e => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) store.setState({ activeTab: tabBtn.dataset.tab });
  });

  bindTabEvents();
}

function bindTabEvents() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => store.setState({ activeCategory: chip.dataset.cat }));
  });

  document.getElementById('search-input')?.addEventListener('input', e => {
    store.setState({ searchQuery: e.target.value });
  });

  document.querySelectorAll('.campaign-card[data-campaign-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('.fund-btn')) openDetailModal(card.dataset.campaignId);
    });
  });

  document.querySelectorAll('.fund-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.campaignId;
      // Seed/demo campaigns have non-numeric IDs — block them
      if (!id || isNaN(Number(id))) {
        showToast('This is a demo campaign. Deploy the contract and create a real campaign first.', 'error', 4000);
        return;
      }
      openContributeModal(id);
    });
  });
}

// ── Wallet handler ────────────────────────────────────────────────────────────

async function handleWalletClick() {
  if (walletManager.isConnected()) {
    await walletManager.disconnect();
    store.setState({ walletId:null, walletAddress:null, walletBalance:null, walletNetwork:null });
    showToast('Wallet disconnected', 'info');
  } else {
    openWalletModal();
  }
}

// ── Create campaign modal ─────────────────────────────────────────────────────

export function openCreateModal() {
  if (!walletManager.isConnected()) {
    showToast('Connect your wallet first', 'error');
    openWalletModal();
    return;
  }
  const network = walletManager.getNetwork();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🚀 Launch a Campaign</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Campaign Title *</label>
        <input class="form-input" id="c-title" placeholder="Min 3 characters" />
        <div class="form-error" id="err-title"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Description *</label>
        <textarea class="form-input" id="c-desc" rows="3" placeholder="What are you building?"></textarea>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Funding Goal (XLM) *</label>
          <input class="form-input" id="c-goal" type="number" step="1" min="1" placeholder="e.g. 1000" />
          <div class="form-error" id="err-goal"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Duration (days) *</label>
          <input class="form-input" id="c-days" type="number" min="1" max="90" placeholder="1–90" />
          <div class="form-error" id="err-days"></div>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-input" id="c-category">
            <option value="tech">Tech</option>
            <option value="art">Art & Creative</option>
            <option value="social">Social Good</option>
            <option value="gaming">Gaming</option>
            <option value="defi">DeFi</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Emoji Icon</label>
          <input class="form-input" id="c-emoji" placeholder="⭐" maxlength="2" />
        </div>
      </div>
      <div style="background:rgba(8,181,229,0.08);border:1px solid rgba(8,181,229,0.25);border-radius:0.5rem;padding:0.75rem;font-size:0.78rem;color:#08b5e5;margin-bottom:1rem">
        ✷ Deploying on: <strong>${network?.name || 'Stellar Testnet'}</strong>
        — Freighter will ask you to sign the transaction.
      </div>
      <button class="btn btn-primary" style="width:100%;padding:0.75rem" id="deploy-btn">
        Deploy Campaign →
      </button>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());

  document.getElementById('deploy-btn').addEventListener('click', async () => {
    // Parse numbers here so they arrive as actual numbers, not strings
    const title    = document.getElementById('c-title').value.trim();
    const desc     = document.getElementById('c-desc').value.trim();
    const goalRaw  = document.getElementById('c-goal').value;
    const daysRaw  = document.getElementById('c-days').value;
    const category = document.getElementById('c-category').value;
    const emoji    = document.getElementById('c-emoji').value.trim() || '🚀';

    // Validate before doing anything
    if (!title || title.length < 3) {
      showToast('Title must be at least 3 characters', 'error'); return;
    }
    if (!desc) {
      showToast('Description is required', 'error'); return;
    }
    const goal = parseInt(goalRaw, 10);
    if (!goalRaw || isNaN(goal) || goal <= 0) {
      showToast('Goal must be a positive whole number (e.g. 1000)', 'error'); return;
    }
    const days = parseInt(daysRaw, 10);
    if (!daysRaw || isNaN(days) || days < 1 || days > 90) {
      showToast('Duration must be between 1 and 90 days', 'error'); return;
    }

    const data = { title, desc, goal, days, category, emoji };

    try {
      overlay.remove();
      setProcessing(true, 'WAITING FOR FREIGHTER SIGNATURE...');
      await createCampaign(data, walletManager.getAddress(), walletManager.getNetwork()?.id);
      showToast(`"${title}" launched! 🚀`, 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    } finally {
      setProcessing(false);
    }
  });
}

// ── Contribute modal ──────────────────────────────────────────────────────────

export function openContributeModal(campaignId) {
  if (!walletManager.isConnected()) {
    showToast('Connect your wallet first', 'error');
    openWalletModal();
    return;
  }

  const campaign = store.getState().campaigns.find(c => String(c.id) === String(campaignId));
  if (!campaign) return;

  // Block seed/demo campaigns — they have string IDs like 's1', 's2'
  // Only real on-chain campaigns have numeric IDs
  if (isNaN(Number(campaignId)) || String(campaignId).startsWith('s') || String(campaignId).startsWith('local_')) {
    showToast('This is a demo campaign. Deploy the contract and create a real campaign to fund it.', 'error', 5000);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Back This Project</div>
          <div class="modal-subtitle">${campaign.emoji || '⭐'} ${campaign.title}</div>
        </div>
        <button class="modal-close">✕</button>
      </div>
      <label class="form-label">Amount (XLM)</label>
      <input class="contribute-amount-input" id="contribute-amount" type="number" value="100" step="1" min="1" max="999999" />
      <div class="quick-amounts" style="margin:0.5rem 0">
        ${[50,100,500,1000].map(v => `<div class="quick-amt" data-val="${v}">${v}</div>`).join('')}
      </div>
      <div class="form-hint">Goal: ${campaign.goal} XLM · Raised: ${(campaign.raised||0).toFixed(0)} XLM</div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:0.5rem;padding:0.75rem;font-size:0.78rem;color:var(--yellow);margin:1rem 0">
        ⚠️ Freighter will ask you to approve this Stellar transaction.
      </div>
      <button class="btn btn-primary" style="width:100%;padding:0.75rem" id="confirm-btn">
        Confirm & Fund →
      </button>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());

  const amtInput = document.getElementById('contribute-amount');
  overlay.querySelectorAll('.quick-amt').forEach(btn => {
    btn.addEventListener('click', () => { amtInput.value = btn.dataset.val; });
  });

  document.getElementById('confirm-btn').addEventListener('click', async () => {
    // Parse and validate — must be a real positive number
    const raw    = amtInput.value.trim();
    const amount = parseInt(raw, 10);   // whole XLM only — contract needs integer

    if (!raw || isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid whole number amount (e.g. 10)', 'error');
      return;
    }

    overlay.remove();
    setProcessing(true, 'WAITING FOR FREIGHTER SIGNATURE...');
    try {
      await contribute(campaignId, amount, walletManager.getAddress());
      showToast(`✅ Contributed ${amount} XLM to "${campaign.title}"!`, 'success');
    } catch (err) {
      showToast(err.message, 'error', 5000);
    } finally {
      setProcessing(false);
    }
  });
}

// ── Detail modal ──────────────────────────────────────────────────────────────

export function openDetailModal(campaignId) {
  const campaign = store.getState().campaigns.find(c => String(c.id) === String(campaignId));
  if (!campaign) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = renderDetailModal(campaign);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.fund-campaign-btn')?.addEventListener('click', () => {
    overlay.remove();
    openContributeModal(campaignId);
  });
}