/**
 * contractClient.js
 *
 * IMPORTANT — What the contract expects:
 *   contribute(campaign_id, backer, amount_xlm)
 *     amount_xlm = WHOLE XLM as i128  e.g. 10 means 10 XLM
 *     The contract multiplies by 10_000_000 internally
 *
 *   create_campaign(owner, title, description, goal_xlm, duration_ledgers)
 *     goal_xlm = WHOLE XLM as i128  e.g. 1000 means 1000 XLM
 *
 * So we NEVER send stroops from the frontend — just whole XLM as BigInt i128.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { walletManager } from './walletConnector.js';
import contractConfig   from '../contracts/FundChain.json';

const { contractId, rpcUrl, passphrase } = contractConfig;

if (!contractId || contractId.startsWith('REPLACE')) {
  console.warn('[FundChain] No contractId in FundChain.json — deploy the contract first');
}

const server   = new StellarSdk.rpc.Server(rpcUrl);
const contract = new StellarSdk.Contract(contractId);

// ── ScVal helpers ─────────────────────────────────────────────────────────────

/**
 * Convert XLM amount to i128 ScVal.
 * Contract expects WHOLE XLM integer — e.g. 10 means 10 XLM.
 * The contract multiplies by 10_000_000 to get stroops internally.
 */
function xlmToI128(xlm) {
  // Safely convert to number first — catches strings, undefined, NaN
  const num = Number(xlm);

  // Guard against NaN, Infinity, decimals that would break BigInt
  if (!Number.isFinite(num)) {
    throw new Error(`Amount is not a valid number: "${xlm}"`);
  }
  if (num <= 0) {
    throw new Error(`Amount must be greater than 0, got: ${num}`);
  }

  // Round to whole integer — BigInt() crashes on floats like 1.5
  const whole = Math.round(num);

  // Final safety check before BigInt conversion
  if (!Number.isInteger(whole) || whole <= 0) {
    throw new Error(`Amount must be a positive whole number, got: ${whole}`);
  }

  return StellarSdk.nativeToScVal(BigInt(whole), { type: 'i128' });
}

/**
 * Convert to u64 ScVal (campaign IDs)
 */
function toU64(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Campaign ID "${n}" is not a valid number. This is a demo/seed campaign — deploy the contract and create a real campaign first.`);
  }
  return StellarSdk.nativeToScVal(BigInt(num), { type: 'u64' });
}

/**
 * Convert to u32 ScVal (ledger durations)
 */
function toU32(n) {
  const val = Math.floor(Number(n));
  if (val < 0 || val > 4_294_967_295) throw new Error(`u32 out of range: ${n}`);
  return StellarSdk.nativeToScVal(val, { type: 'u32' });
}

/**
 * Convert Stellar address string to Address ScVal
 */
function toAddr(address) {
  return StellarSdk.Address.fromString(address).toScVal();
}

/**
 * Convert string to ScVal
 */
function toStr(s) {
  return StellarSdk.nativeToScVal(String(s), { type: 'string' });
}

// ── Build → simulate → sign → submit → poll ──────────────────────────────────

async function buildAndSubmit(operation) {
  if (!walletManager.isConnected()) {
    throw new Error('Wallet not connected. Connect Freighter first.');
  }

  const address = walletManager.getAddress();

  // Fetch account
  let account;
  try {
    account = await server.getAccount(address);
  } catch {
    throw new Error(
      'Account not found on Stellar Testnet.\n' +
      `Fund your account at: https://friendbot.stellar.org?addr=${address}`
    );
  }

  // Build
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Simulate
  let sim;
  try {
    sim = await server.simulateTransaction(tx);
  } catch (err) {
    throw new Error(`Simulation error: ${err.message}`);
  }

  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    const raw = sim.error || '';
    if (raw.includes('not an integer') || raw.includes('InvalidAction')) {
      throw new Error('A number sent to the contract must be a whole integer.');
    }
    if (raw.includes('Goal not reached')) throw new Error('Goal not reached yet — cannot withdraw.');
    if (raw.includes('Already withdrawn')) throw new Error('Already withdrawn.');
    if (raw.includes('Campaign has ended')) throw new Error('Campaign has already ended.');
    if (raw.includes('Goal was reached')) throw new Error('Goal was met — no refund available.');
    if (raw.includes('does not exist')) throw new Error('Campaign not found on chain.');
    throw new Error(`Contract error: ${raw}`);
  }

  // Assemble with resource fees
  const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build();

  // Sign via Freighter
  const signedXDR = await walletManager.activeWallet.signTransaction(prepared.toXDR());
  if (!signedXDR) throw new Error('Freighter did not return a signed transaction.');

  // Submit
  const submit = await server.sendTransaction(
    StellarSdk.TransactionBuilder.fromXDR(signedXDR, passphrase)
  );
  if (submit.status === 'ERROR') {
    throw new Error(`Submit failed: ${submit.errorResult}`);
  }

  // Poll until confirmed
  let response, attempts = 0;
  do {
    if (attempts++ > 30) throw new Error('Transaction timed out after 30 seconds.');
    await new Promise(r => setTimeout(r, 1000));
    response = await server.getTransaction(submit.hash);
  } while (response.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND);

  if (response.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed: ${response.status}`);
  }

  return response;
}

// ── Read-only simulation ──────────────────────────────────────────────────────

async function simulateRead(operation) {
  if (!walletManager.isConnected()) {
    throw new Error('Connect your wallet to load campaign data.');
  }

  const account = await server.getAccount(walletManager.getAddress());
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee:               StellarSdk.BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Read error: ${sim.error}`);
  }
  return StellarSdk.scValToNative(sim.result.retval);
}

// ── Write functions ───────────────────────────────────────────────────────────

/**
 * Create a campaign.
 * goalXlm     — whole XLM e.g. 1000
 * durationDays — number of days e.g. 30
 */
export async function createCampaign({ title, description, goalXlm, durationDays }) {
  if (!title?.trim() || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
  if (!description?.trim()) throw new Error('Description is required');

  // Force to integer — crashes if not a real number
  const goalInt = parseInt(goalXlm, 10);
  const daysInt = parseInt(durationDays, 10);

  if (isNaN(goalInt) || goalInt <= 0) throw new Error(`Goal must be a positive whole number, got: "${goalXlm}"`);
  if (isNaN(daysInt) || daysInt < 1)  throw new Error(`Duration must be at least 1 day, got: "${durationDays}"`);

  // 1 day = 17,280 ledgers (5 sec per ledger × 60 × 60 × 24)
  const ledgers = daysInt * 17280;

  console.log('[contract] createCampaign', { goalInt, daysInt, ledgers });

  const op = contract.call(
    'create_campaign',
    toAddr(walletManager.getAddress()),
    toStr(title.trim()),
    toStr(description.trim()),
    StellarSdk.nativeToScVal(BigInt(goalInt), { type: 'i128' }),  // safe integer → BigInt
    StellarSdk.nativeToScVal(ledgers, { type: 'u32' }),           // safe integer → u32
  );
  return buildAndSubmit(op);
}

/**
 * Contribute XLM to a campaign.
 * amountXlm — user input like "10" or "10.5"
 *             We round to nearest whole XLM because contract takes i128 whole XLM
 */
export async function contribute({ campaignId, amountXlm }) {
  if (campaignId === undefined || campaignId === null) throw new Error('Campaign ID required');
  if (!amountXlm || Number(amountXlm) <= 0) throw new Error('Amount must be greater than 0');

  // Round to whole XLM — contract takes whole XLM and converts to stroops itself
  const wholeXlm = Math.round(parseFloat(amountXlm));
  if (wholeXlm <= 0) throw new Error('Amount must be at least 1 XLM');

  const op = contract.call(
    'contribute',
    toU64(campaignId),
    toAddr(walletManager.getAddress()),
    xlmToI128(wholeXlm),  // whole XLM as i128 — contract multiplies by 10_000_000
  );
  return buildAndSubmit(op);
}

/**
 * Withdraw funds after goal is met.
 */
export async function withdraw({ campaignId }) {
  if (campaignId === undefined) throw new Error('Campaign ID required');
  const op = contract.call('withdraw', toU64(campaignId));
  return buildAndSubmit(op);
}

/**
 * Refund if goal not met after deadline.
 */
export async function refund({ campaignId }) {
  if (campaignId === undefined) throw new Error('Campaign ID required');
  const op = contract.call(
    'refund',
    toU64(campaignId),
    toAddr(walletManager.getAddress()),
  );
  return buildAndSubmit(op);
}

// ── Read functions ────────────────────────────────────────────────────────────

export async function getCampaign(campaignId) {
  const raw = await simulateRead(contract.call('get_campaign', toU64(campaignId)));
  return normalizeCampaign(raw, campaignId);
}

export async function getAllCampaigns() {
  const count = await getCampaignCount();
  const list  = [];
  for (let i = 0; i < count; i++) {
    try { list.push(await getCampaign(i)); } catch { /* skip */ }
  }
  return list;
}

export async function getCampaignCount() {
  const raw = await simulateRead(contract.call('get_campaign_count'));
  return Number(raw);
}

export async function getContribution(campaignId, backerAddress) {
  const raw = await simulateRead(contract.call(
    'get_contribution',
    toU64(campaignId),
    toAddr(backerAddress),
  ));
  return Number(raw) / 10_000_000; // stroops → XLM
}

// ── Normalize chain data → UI shape ──────────────────────────────────────────

function normalizeCampaign(raw, id) {
  return {
    id:          Number(raw.id ?? id),
    title:       raw.title?.toString()       ?? '',
    description: raw.description?.toString() ?? '',
    desc:        raw.description?.toString() ?? '',
    owner:       raw.owner?.toString()       ?? '',
    goal:        Number(raw.goal)   / 10_000_000,  // stroops → XLM
    raised:      Number(raw.raised) / 10_000_000,
    deadline:    Number(raw.deadline),
    withdrawn:   Boolean(raw.withdrawn),
    network:     'stellar-testnet',
    emoji:       '⭐',
    category:    'defi',
    backers:     0,
    daysLeft:    30,
    contributions: [],
  };
}