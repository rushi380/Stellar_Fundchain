/**
 * components/Nav.js
 */
export function renderNav(state) {
  const { walletAddress, walletBalance, walletNetwork } = state;
  const connected = !!walletAddress;
  const short = walletAddress
    ? walletAddress.length > 16
      ? walletAddress.slice(0,6) + '...' + walletAddress.slice(-4)
      : walletAddress
    : '';
  const netColor = walletNetwork?.color || '#6b7280';

  return `
    <nav id="nav-root">
      <div class="nav-logo">
        <span class="logo-icon">⛓</span>
        <span class="logo-text">FundChain</span>
        <span class="logo-sub">on Stellar</span>
      </div>
      <div class="nav-right">
        ${connected ? `
          <div class="net-badge" style="border-color:${netColor};color:${netColor}">
            ● ${walletNetwork?.name || ''}
          </div>
          <div class="wallet-balance">${walletBalance} XLM</div>
        ` : ''}
        <button id="wallet-btn" class="wallet-btn ${connected ? 'connected' : ''}">
          ${connected ? short : '🔗 Connect Wallet'}
        </button>
        <button id="create-campaign-btn" class="btn btn-primary btn-sm">+ New Campaign</button>
      </div>
    </nav>`;
}

/**
 * components/Hero.js
 */
export function renderHero() {
  return `
    <section class="hero">
      <div class="hero-eyebrow">✷ Powered by Stellar Soroban Testnet</div>
      <h1 class="hero-title">Fund the <span class="gradient-text">Future</span><br>on Stellar</h1>
      <p class="hero-desc">
        Create and back crowdfunding campaigns with XLM.
        Every campaign is a Soroban smart contract — transparent, trustless, on-chain.
      </p>
      <div class="hero-actions">
        <button class="btn btn-primary" onclick="window.__fc.openCreateModal()">Launch a Campaign</button>
        <button class="btn btn-outline" onclick="document.querySelector('.tabs').scrollIntoView({behavior:'smooth'})">Explore Projects ↓</button>
      </div>
    </section>`;
}

/**
 * components/CampaignGrid.js
 */
const CAT_BG = {
  tech:   'linear-gradient(135deg,#1e3a5f,#1e4080)',
  art:    'linear-gradient(135deg,#4a1942,#7c2d5c)',
  social: 'linear-gradient(135deg,#064e3b,#065f46)',
  gaming: 'linear-gradient(135deg,#78350f,#92400e)',
  defi:   'linear-gradient(135deg,#3b0764,#4c1d95)',
};
const CAT_COLOR = { tech:'#3b82f6', art:'#ec4899', social:'#10b981', gaming:'#f59e0b', defi:'#8b5cf6' };

export function renderCampaignGrid(campaigns) {
  if (!campaigns.length) return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">No campaigns found</div>
      <p>Try a different search or category filter.</p>
    </div>`;
  return campaigns.map(buildCard).join('');
}

function buildCard(c) {
  const pct      = Math.min((c.raised / c.goal) * 100, 100);
  const pctClass = pct < 33 ? 'low' : pct < 70 ? 'mid' : 'high';
  const ended    = c.daysLeft <= 0;
  const funded   = c.raised >= c.goal;
  const dlText   = ended ? '⏱ Ended' : c.daysLeft <= 5 ? `🔥 ${c.daysLeft}d left` : `📅 ${c.daysLeft}d left`;
  const dlClass  = 'deadline-badge' + (ended ? ' ended' : c.daysLeft <= 5 ? ' urgent' : '');

  // Seed/demo campaigns have string IDs like 's1', 's2'
  // Real on-chain campaigns have numeric IDs like 0, 1, 2
  const isDemo = !c.id || isNaN(Number(c.id));

  return `
    <div class="campaign-card" data-campaign-id="${c.id}">
      <div class="card-cover" style="background:${CAT_BG[c.category] || CAT_BG.tech}">
        <span class="card-emoji">${c.emoji || '⭐'}</span>
        ${isDemo
          ? `<span class="card-net-badge" style="background:rgba(107,114,128,0.6)">✷ Demo</span>`
          : `<span class="card-net-badge">✷ XLM</span>`}
      </div>
      <div class="card-body">
        <div class="card-category" style="color:${CAT_COLOR[c.category]}">${(c.category || 'defi').toUpperCase()}</div>
        <div class="card-title">${c.title}</div>
        <div class="card-desc">${c.desc || c.description || ''}</div>
        <div class="card-stats">
          <div>
            <div class="card-stat-val">${(c.raised || 0).toFixed(0)} XLM</div>
            <div class="card-stat-lbl">of ${c.goal} XLM goal</div>
          </div>
          <div style="text-align:right">
            <div class="card-stat-val">${c.backers}</div>
            <div class="card-stat-lbl">backers</div>
          </div>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill ${pctClass}" style="width:${pct}%"></div>
        </div>
        <div class="card-footer">
          <span class="${dlClass}">${dlText}</span>
          ${isDemo
            ? `<span class="status-chip" style="background:rgba(107,114,128,0.15);color:#6b7280;border:1px solid rgba(107,114,128,0.3)">👁 Demo</span>`
            : funded
              ? `<span class="status-chip status-success">🎯 Funded!</span>`
              : !ended
                ? `<button class="btn btn-primary btn-sm fund-btn" data-campaign-id="${c.id}">Fund It</button>`
                : `<button class="btn btn-outline btn-sm" disabled>Closed</button>`}
        </div>
      </div>
    </div>`;
}

export function renderSkeletons(n = 6) {
  return Array(n).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-cover"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line w-40"></div>
        <div class="skeleton skeleton-line w-85"></div>
        <div class="skeleton skeleton-line w-65"></div>
      </div>
    </div>`).join('');
}

/**
 * components/CampaignDetail.js
 */
export function renderDetailModal(c) {
  const pct      = Math.min((c.raised / c.goal) * 100, 100);
  const pctClass = pct < 33 ? 'low' : pct < 70 ? 'mid' : 'high';
  const canFund  = c.daysLeft > 0 && c.raised < c.goal;
  return `
    <div class="modal" style="max-width:700px">
      <div class="modal-header">
        <div class="modal-title">${c.emoji || '⭐'} ${c.title}</div>
        <button class="modal-close">✕</button>
      </div>
      <div class="detail-cover" style="background:${CAT_BG[c.category] || CAT_BG.defi}">
        <span style="font-size:4rem;filter:drop-shadow(0 2px 12px rgba(0,0,0,0.5))">${c.emoji || '⭐'}</span>
      </div>
      <div class="detail-grid">
        <div>
          <p style="color:var(--muted);line-height:1.7;font-size:0.9rem;margin-bottom:1.25rem;">${c.desc || c.description}</p>
          <div class="detail-meta-row"><span class="detail-meta-label">Creator</span><code>${c.owner}</code></div>
          <div class="detail-meta-row"><span class="detail-meta-label">Network</span><span style="color:#08b5e5">Stellar Testnet</span></div>
          <div class="detail-meta-row"><span class="detail-meta-label">Deadline Ledger</span><span>${c.deadline}</span></div>
          <div style="margin-top:1rem;font-size:0.72rem;font-family:'DM Mono',monospace;color:var(--muted);margin-bottom:0.5rem">RECENT BACKERS</div>
          ${(c.contributions || []).slice(0,5).map(b => `
            <div class="backer-row">
              <code style="font-size:0.75rem">${b.addr}</code>
              <span style="color:var(--green);font-family:'DM Mono',monospace">${b.amount} XLM</span>
            </div>`).join('') || '<div style="font-size:0.8rem;color:var(--muted)">No contributions yet.</div>'}
        </div>
        <div>
          <div class="detail-raised">${(c.raised || 0).toFixed(0)} <span style="font-size:1rem">XLM</span></div>
          <div class="detail-goal">of ${c.goal} XLM goal</div>
          <div class="progress-bar-track" style="margin:0.75rem 0">
            <div class="progress-bar-fill ${pctClass}" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--muted);margin-bottom:1.5rem">
            <span>${pct.toFixed(0)}% funded</span>
            <span>${c.daysLeft > 0 ? c.daysLeft+'d left' : 'Ended'}</span>
          </div>
          ${canFund
            ? `<button class="btn btn-primary fund-campaign-btn" style="width:100%;padding:0.7rem">⚡ Fund This Project</button>`
            : `<button class="btn btn-outline" style="width:100%;padding:0.7rem" disabled>${c.raised >= c.goal ? '🎯 Goal Reached!' : '⏱ Ended'}</button>`}
        </div>
      </div>
    </div>`;
}

/**
 * components/MyCampaigns.js
 */
export function renderMyCampaigns(state) {
  const { walletAddress, campaigns } = state;
  if (!walletAddress) return `
    <div class="connect-wall">
      <div class="connect-wall-icon">🔐</div>
      <h2>Connect Freighter</h2>
      <p>Connect your Freighter wallet to view and manage your Stellar campaigns.</p>
      <button class="btn btn-primary" onclick="window.__fc.openWalletModal()">Connect Wallet</button>
    </div>`;

  const mine   = campaigns.filter(c => c.owner === walletAddress);
  const backed = campaigns.filter(c => (c.contributions || []).some(x => x.addr === walletAddress));

  let html = `<div class="section-header"><div class="section-title">My Campaigns</div>
    <button class="btn btn-primary btn-sm" onclick="window.__fc.openCreateModal()">+ New</button></div>`;

  if (!mine.length) {
    html += `<div class="empty-state"><div class="empty-icon">📭</div>
      <div class="empty-title">No campaigns yet</div><p>Launch your first Stellar campaign.</p></div>`;
  } else {
    html += mine.map(c => {
      const pct    = Math.min((c.raised / c.goal) * 100, 100);
      const status = c.daysLeft <= 0 ? 'ended' : c.raised >= c.goal ? 'success' : 'active';
      const labels = { active:'Active', ended:'Ended', success:'Funded' };
      return `
        <div class="campaign-row" onclick="window.__fc.openDetailModal('${c.id}')">
          <div class="campaign-row-icon">${c.emoji || '⭐'}</div>
          <div class="campaign-row-info">
            <div class="campaign-row-title">${c.title}</div>
            <div class="campaign-row-sub">${(c.raised||0).toFixed(0)} / ${c.goal} XLM · ${c.backers} backers · ${pct.toFixed(0)}%</div>
          </div>
          <span class="status-chip status-${status}">${labels[status]}</span>
        </div>`;
    }).join('');
  }

  if (backed.length) {
    html += `<div class="section-header" style="margin-top:2rem"><div class="section-title">Backed Campaigns</div></div>`;
    html += backed.map(c => {
      const total = (c.contributions||[]).filter(x => x.addr === walletAddress).reduce((s,x) => s+x.amount, 0);
      return `
        <div class="campaign-row" onclick="window.__fc.openDetailModal('${c.id}')">
          <div class="campaign-row-icon">${c.emoji || '⭐'}</div>
          <div class="campaign-row-info">
            <div class="campaign-row-title">${c.title}</div>
            <div class="campaign-row-sub">You backed ${total.toFixed(2)} XLM total</div>
          </div>
          <span style="font-family:'DM Mono',monospace;font-size:0.75rem;color:var(--green)">+${total.toFixed(2)} XLM</span>
        </div>`;
    }).join('');
  }

  return html;
}

/**
 * components/Transactions.js
 */
export function renderTransactions(state) {
  const { transactions } = state;
  const seed = [
    { id:'s1', dir:'in',  label:'Received: Backer contribution',   amount:500,  ts:Date.now()-5*86400000 },
    { id:'s2', dir:'out', label:'Backed: ZeroGas Protocol',        amount:100,  ts:Date.now()-8*86400000 },
    { id:'s3', dir:'in',  label:'Refund: Campaign goal not met',   amount:200,  ts:Date.now()-10*86400000 },
  ];
  const all = [...transactions, ...seed];
  return `
    <div class="section-header"><div class="section-title">Transaction History</div></div>
    <div class="tx-list">
      ${all.slice(0,25).map(tx => {
        const d    = new Date(tx.ts);
        const when = d.toLocaleDateString('en',{month:'short',day:'numeric'})
                   + ' · ' + d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'});
        return `
          <div class="tx-item">
            <div class="tx-icon ${tx.dir}">${tx.dir === 'in' ? '⬇' : '⬆'}</div>
            <div class="tx-info">
              <div class="tx-title">${tx.label}</div>
              <div class="tx-sub">${when}</div>
            </div>
            ${tx.amount > 0
              ? `<div class="tx-amount ${tx.dir}">${tx.dir==='in'?'+':'-'}${tx.amount} XLM</div>`
              : `<div class="tx-amount" style="color:var(--muted)">deploy</div>`}
          </div>`;
      }).join('')}
    </div>`;
}

/**
 * components/Toasts.js
 */
export function renderToasts(toasts = []) {
  return toasts.map(t => `<div class="toast toast-${t.type}">${t.message}</div>`).join('');
}

/**
 * components/ProcessingOverlay.js
 */
export function renderProcessingOverlay(state) {
  return `
    <div id="processing-overlay" class="processing-overlay ${state.isProcessing ? 'active' : ''}">
      <div class="processing-spinner"></div>
      <div class="processing-text">${state.processingText || 'PROCESSING...'}</div>
    </div>`;
}

/**
 * components/WalletModal.js
 */
import { WALLETS, walletManager, WalletError } from '../utils/walletConnector.js';
import { store, showToast, setProcessing }      from '../utils/store.js';

export function openWalletModal() {
  document.getElementById('wallet-modal-root')?.remove();
  const overlay = document.createElement('div');
  overlay.id    = 'wallet-modal-root';
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Connect Wallet</div>
          <div class="modal-subtitle">Freighter recommended for Stellar Testnet</div>
        </div>
        <button class="modal-close" id="wm-close">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.625rem;margin-bottom:1.5rem">
        ${WALLETS.map(w => {
          const avail = w.isAvailable();
          return `
            <div class="wallet-option ${avail ? '' : 'wallet-not-installed'}"
                 data-wid="${w.id}" role="button" tabindex="0">
              <div>${w.icon}</div>
              <div style="flex:1">
                <div class="wallet-option-name">${w.name}</div>
                <div class="wallet-option-net" style="color:${w.network?.color || '#6b7280'};background:${w.network?.color || '#6b7280'}22">
                  ${w.network?.name || ''}
                </div>
              </div>
              <div>${avail
                ? '<span style="color:var(--green);font-size:0.6rem">●</span>'
                : '<span style="font-size:0.68rem;color:var(--muted)">Not installed</span>'
              }</div>
            </div>`;
        }).join('')}
      </div>
      <div style="border-top:1px solid var(--border);padding-top:1rem;font-size:0.73rem;color:var(--muted);line-height:1.6">
        🔒 Connecting to Stellar Testnet only. No real XLM at risk.<br>
        Don't have Freighter?
        <a href="https://freighter.app" target="_blank" style="color:var(--accent2)">freighter.app</a>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  document.getElementById('wm-close').addEventListener('click', () => overlay.remove());

  overlay.querySelectorAll('.wallet-option:not(.wallet-not-installed)').forEach(el => {
    el.addEventListener('click', () => handleSelect(el.dataset.wid, overlay));
    el.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') handleSelect(el.dataset.wid, overlay); });
  });
}

async function handleSelect(walletId, overlay) {
  overlay.remove();
  setProcessing(true, `CONNECTING ${walletId.toUpperCase()}...`);
  try {
    const result = await walletManager.connect(walletId);
    store.setState({
      walletId, walletAddress: result.address,
      walletBalance: result.balance, walletNetwork: result.network,
    });
    showToast(`✅ ${walletId} connected: ${result.address.slice(0,8)}...`, 'success');
  } catch (err) {
    if (err instanceof WalletError) {
      const msgs = {
        NOT_INSTALLED: `${err.walletId} not installed. ${err.message}`,
        LOCKED:        err.message,
        REJECTED:      'Connection rejected',
        WRONG_NETWORK: err.message,
      };
      showToast(msgs[err.code] || err.message, 'error', 5000);
    } else {
      showToast(`Connection error: ${err.message}`, 'error');
    }
  } finally {
    setProcessing(false);
  }
}