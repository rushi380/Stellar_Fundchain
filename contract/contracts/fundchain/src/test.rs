#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Env, Address, String,
};

// ── Test helpers ──────────────────────────────────────────────────────────────

fn setup() -> (Env, FundChainContractClient<'static>) {
    let env = Env::default();
    // mock_all_auths so we don't need real keypairs in tests
    env.mock_all_auths();
    let contract_id = env.register_contract(None, FundChainContract);
    let client = FundChainContractClient::new(&env, &contract_id);
    (env, client)
}

fn str(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

// ── Campaign creation ─────────────────────────────────────────────────────────

#[test]
fn test_create_campaign_returns_id_zero() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    let id = client.create_campaign(
        &owner,
        &str(&env, "My Project"),
        &str(&env, "Great description"),
        &100,    // 100 XLM goal
        &17280,  // ~1 day
    );

    assert_eq!(id, 0);
}

#[test]
fn test_campaign_ids_are_sequential() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    let id0 = client.create_campaign(&owner, &str(&env, "Camp A"), &str(&env, "Desc"), &10, &100);
    let id1 = client.create_campaign(&owner, &str(&env, "Camp B"), &str(&env, "Desc"), &20, &100);
    let id2 = client.create_campaign(&owner, &str(&env, "Camp C"), &str(&env, "Desc"), &30, &100);

    assert_eq!(id0, 0);
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

#[test]
fn test_campaign_data_stored_correctly() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    client.create_campaign(
        &owner,
        &str(&env, "FundChain Test"),
        &str(&env, "A test campaign"),
        &50,
        &17280,
    );

    let c = client.get_campaign(&0);
    assert_eq!(c.id,       0);
    assert_eq!(c.goal,     50 * 10_000_000);  // stored as stroops
    assert_eq!(c.raised,   0);
    assert_eq!(c.withdrawn, false);
}

#[test]
fn test_campaign_count_increments() {
    let (env, client) = setup();
    let owner = Address::generate(&env);

    assert_eq!(client.get_campaign_count(), 0);
    client.create_campaign(&owner, &str(&env, "A"), &str(&env, "D"), &10, &100);
    assert_eq!(client.get_campaign_count(), 1);
    client.create_campaign(&owner, &str(&env, "B"), &str(&env, "D"), &10, &100);
    assert_eq!(client.get_campaign_count(), 2);
}

#[test]
#[should_panic(expected = "goal_xlm must be greater than 0")]
fn test_create_fails_with_zero_goal() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    client.create_campaign(&owner, &str(&env, "Bad"), &str(&env, "D"), &0, &100);
}

#[test]
#[should_panic(expected = "duration_ledgers must be greater than 0")]
fn test_create_fails_with_zero_duration() {
    let (env, client) = setup();
    let owner = Address::generate(&env);
    client.create_campaign(&owner, &str(&env, "Bad"), &str(&env, "D"), &10, &0);
}

// ── Contributions ─────────────────────────────────────────────────────────────

#[test]
fn test_contribute_updates_raised() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer, &25);  // 25 XLM

    let c = client.get_campaign(&0);
    assert_eq!(c.raised, 25 * 10_000_000);
}

#[test]
fn test_multiple_backers_accumulate() {
    let (env, client) = setup();
    let owner   = Address::generate(&env);
    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);
    let backer3 = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer1, &10);
    client.contribute(&0, &backer2, &20);
    client.contribute(&0, &backer3, &30);

    let c = client.get_campaign(&0);
    assert_eq!(c.raised, 60 * 10_000_000);  // 10+20+30 = 60 XLM
}

#[test]
fn test_same_backer_contributes_twice() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer, &10);
    client.contribute(&0, &backer, &15);

    let total = client.get_contribution(&0, &backer);
    assert_eq!(total, 25 * 10_000_000);  // 10+15 = 25 XLM in stroops
}

#[test]
#[should_panic(expected = "amount_xlm must be greater than 0")]
fn test_contribute_fails_with_zero_amount() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer, &0);
}

#[test]
#[should_panic(expected = "Campaign has ended")]
fn test_contribute_fails_after_deadline() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    // Create campaign with 100 ledger duration
    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &100);

    // Fast-forward ledger sequence past the deadline
    env.ledger().with_mut(|l| l.sequence_number = 500);

    // This should panic because campaign has ended
    client.contribute(&0, &backer, &10);
}

// ── Withdraw ──────────────────────────────────────────────────────────────────

#[test]
fn test_withdraw_succeeds_when_goal_met() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &50, &17280);
    client.contribute(&0, &backer, &50);  // exactly meets goal

    client.withdraw(&0);

    let c = client.get_campaign(&0);
    assert_eq!(c.withdrawn, true);
}

#[test]
#[should_panic(expected = "Goal not reached yet")]
fn test_withdraw_fails_if_goal_not_met() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer, &10);  // only 10 of 100 XLM goal

    client.withdraw(&0);  // should panic
}

#[test]
#[should_panic(expected = "Already withdrawn")]
fn test_withdraw_fails_if_already_withdrawn() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &10, &17280);
    client.contribute(&0, &backer, &10);
    client.withdraw(&0);
    client.withdraw(&0);  // second call should panic
}

// ── Refund ────────────────────────────────────────────────────────────────────

#[test]
fn test_refund_after_failed_campaign() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    // Create with short duration
    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &100);

    // Contribute but NOT enough to meet goal
    client.contribute(&0, &backer, &5);

    // Fast-forward past deadline
    env.ledger().with_mut(|l| l.sequence_number = 500);

    // Refund should succeed
    client.refund(&0, &backer);

    // Contribution record should be zeroed
    let remaining = client.get_contribution(&0, &backer);
    assert_eq!(remaining, 0);
}

#[test]
#[should_panic(expected = "Campaign is still active")]
fn test_refund_fails_before_deadline() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &17280);
    client.contribute(&0, &backer, &5);

    // Don't fast-forward — campaign still active
    client.refund(&0, &backer);  // should panic
}

#[test]
#[should_panic(expected = "Goal was reached — no refund available")]
fn test_refund_fails_if_goal_was_met() {
    let (env, client) = setup();
    let owner  = Address::generate(&env);
    let backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &10, &100);
    client.contribute(&0, &backer, &10);  // goal met

    env.ledger().with_mut(|l| l.sequence_number = 500);

    // Goal was reached, so no refund
    client.refund(&0, &backer);
}

#[test]
#[should_panic(expected = "No contribution to refund")]
fn test_refund_fails_if_backer_never_contributed() {
    let (env, client) = setup();
    let owner      = Address::generate(&env);
    let backer     = Address::generate(&env);
    let non_backer = Address::generate(&env);

    client.create_campaign(&owner, &str(&env, "Proj"), &str(&env, "D"), &100, &100);
    client.contribute(&0, &backer, &5);

    env.ledger().with_mut(|l| l.sequence_number = 500);

    // non_backer never contributed — should panic
    client.refund(&0, &non_backer);
}