/**
 * FundChain — Test Suite
 * Run: node tests/fundchain.test.js
 * 10 tests, zero dependencies.
 */

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌  ${name}`);
    console.log(`       → ${err.message}`);
  }
}

function expect(actual) {
  return {
    toBe(e)           { if (actual !== e) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
    toBeGreaterThan(n){ if (actual <= n)  throw new Error(`Expected ${actual} > ${n}`); },
    toBeLessThan(n)   { if (actual >= n)  throw new Error(`Expected ${actual} < ${n}`); },
    toHaveLength(n)   { if (actual.length !== n) throw new Error(`Expected length ${n}, got ${actual.length}`); },
    toBeNull()        { if (actual !== null) throw new Error(`Expected null, got ${actual}`); },
    toContain(s)      { if (!actual.includes(s)) throw new Error(`"${actual}" does not contain "${s}"`); },
  };
}

// ── Logic being tested ────────────────────────────────────────────────────────

function createCampaign({ title, desc, goal, days, owner }) {
  if (!title?.trim() || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
  if (!desc?.trim())       throw new Error('Description is required');
  if (!goal || goal <= 0)  throw new Error('Goal must be greater than 0');
  if (!days || days < 1 || days > 90) throw new Error('Duration must be 1–90 days');
  if (!owner)              throw new Error('Owner address required');
  return {
    id:       Math.random().toString(36).slice(2),
    title:    title.trim(),
    desc:     desc.trim(),
    goal:     parseFloat(goal),
    days:     parseInt(days),
    owner,
    raised:   0,
    backers:  0,
    daysLeft: parseInt(days),
    withdrawn: false,
    contributions: [],
  };
}

function contribute(campaign, { wallet, amount }) {
  if (!wallet)                throw new Error('Wallet required');
  if (!amount || amount <= 0) throw new Error('Amount must be greater than 0');
  if (campaign.daysLeft <= 0) throw new Error('Campaign has ended');
  return {
    ...campaign,
    raised:  campaign.raised + amount,
    backers: campaign.backers + 1,
    contributions: [{ addr: wallet, amount }, ...campaign.contributions],
  };
}

function xlmToStroops(xlm) { return Math.round(xlm * 10_000_000); }
function stroopsToXlm(s)   { return s / 10_000_000; }

function filterCampaigns(campaigns, { category = 'all', query = '' } = {}) {
  return campaigns.filter(c => {
    const matchCat = category === 'all' || c.category === category;
    const q = query.toLowerCase();
    return matchCat && (!q || c.title.toLowerCase().includes(q));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  FundChain Test Suite  (10 tests)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

test('1. Creates a campaign with correct fields', () => {
  const c = createCampaign({ title: 'Stellar Fund', desc: 'A great project', goal: 1000, days: 30, owner: 'GABC' });
  expect(c.title).toBe('Stellar Fund');
  expect(c.goal).toBe(1000);
  expect(c.raised).toBe(0);
  expect(c.withdrawn).toBe(false);
});

test('2. Trims whitespace from title', () => {
  const c = createCampaign({ title: '  My Project  ', desc: 'desc', goal: 100, days: 7, owner: 'G' });
  expect(c.title).toBe('My Project');
});

test('3. Throws when title is too short', () => {
  let threw = false;
  try { createCampaign({ title: 'Hi', desc: 'desc', goal: 100, days: 7, owner: 'G' }); }
  catch (e) { threw = true; expect(e.message).toContain('3 characters'); }
  if (!threw) throw new Error('Expected error was not thrown');
});

test('4. Throws when goal is zero', () => {
  let threw = false;
  try { createCampaign({ title: 'Valid Title', desc: 'desc', goal: 0, days: 7, owner: 'G' }); }
  catch { threw = true; }
  if (!threw) throw new Error('Expected error was not thrown');
});

test('5. Contribution updates raised amount and backers', () => {
  const c = createCampaign({ title: 'My Project', desc: 'desc', goal: 1000, days: 30, owner: 'G' });
  const updated = contribute(c, { wallet: 'GBACKER1', amount: 250 });
  expect(updated.raised).toBe(250);
  expect(updated.backers).toBe(1);
  expect(updated.contributions).toHaveLength(1);
});

test('6. Multiple contributions accumulate', () => {
  let c = createCampaign({ title: 'My Project', desc: 'desc', goal: 1000, days: 30, owner: 'G' });
  c = contribute(c, { wallet: 'GA', amount: 100 });
  c = contribute(c, { wallet: 'GB', amount: 200 });
  c = contribute(c, { wallet: 'GC', amount: 300 });
  expect(c.raised).toBe(600);
  expect(c.backers).toBe(3);
});

test('7. Throws when contributing to ended campaign', () => {
  const c = { ...createCampaign({ title: 'My Project', desc: 'desc', goal: 100, days: 30, owner: 'G' }), daysLeft: 0 };
  let threw = false;
  try { contribute(c, { wallet: 'GA', amount: 50 }); }
  catch (e) { threw = true; expect(e.message).toContain('ended'); }
  if (!threw) throw new Error('Expected error was not thrown');
});

test('8. Does not mutate original campaign object', () => {
  const original = createCampaign({ title: 'My Project', desc: 'desc', goal: 100, days: 7, owner: 'G' });
  const before = original.raised;
  contribute(original, { wallet: 'GA', amount: 50 });
  expect(original.raised).toBe(before);
});

test('9. XLM to stroops conversion', () => {
  expect(xlmToStroops(1)).toBe(10_000_000);
  expect(stroopsToXlm(10_000_000)).toBe(1);
  expect(xlmToStroops(0.5)).toBe(5_000_000);
});

test('10. Campaign filtering by category and query', () => {
  const camps = [
    { id: 1, title: 'ZeroGas DeFi', category: 'defi' },
    { id: 2, title: 'Stellar Art Gallery', category: 'art' },
    { id: 3, title: 'GameFi World', category: 'gaming' },
  ];
  expect(filterCampaigns(camps, { category: 'all' })).toHaveLength(3);
  expect(filterCampaigns(camps, { category: 'defi' })).toHaveLength(1);
  expect(filterCampaigns(camps, { query: 'stellar' })).toHaveLength(1);
  expect(filterCampaigns(camps, { query: 'xyz123' })).toHaveLength(0);
});

// ── Result ────────────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  ${passed} passed  |  ${failed} failed  |  ${passed + failed} total`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

if (failed > 0) process.exit(1);