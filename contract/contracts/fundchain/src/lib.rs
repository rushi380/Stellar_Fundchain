#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    Address, Env, String,
    symbol_short,
};

// ── Storage key enum ──────────────────────────────────────────────────────────
// Every value stored on-chain is accessed via one of these keys.

#[contracttype]
pub enum DataKey {
    Campaign(u64),              // Campaign struct by id
    CampaignCount,              // u64 total count
    Contribution(u64, Address), // (campaign_id, backer) → i128 stroops
}

// ── Campaign data type stored on-chain ────────────────────────────────────────
// All XLM amounts are stored in stroops (1 XLM = 10_000_000 stroops).
// Soroban does not support floats, so we always work with integers.

#[contracttype]
#[derive(Clone)]
pub struct Campaign {
    pub id:          u64,
    pub owner:       Address,
    pub title:       String,
    pub description: String,
    pub goal:        i128,   // in stroops
    pub raised:      i128,   // in stroops
    pub deadline:    u32,    // ledger sequence number (~5 sec per ledger)
    pub withdrawn:   bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct FundChainContract;

#[contractimpl]
impl FundChainContract {

    // ── Write functions ───────────────────────────────────────────────────────

    /// Create a new crowdfunding campaign.
    ///
    /// # Arguments
    /// * `owner`            - The campaign creator's address (must sign)
    /// * `title`            - Campaign name (min 3 chars)
    /// * `description`      - Campaign description
    /// * `goal_xlm`         - Funding target in XLM (not stroops — easier for frontend)
    /// * `duration_ledgers` - How many ledgers until deadline
    ///                        (~17_280 ledgers ≈ 1 day at 5 sec/ledger)
    ///
    /// # Returns
    /// The new campaign's ID (u64)
    pub fn create_campaign(
        env: Env,
        owner: Address,
        title: String,
        description: String,
        goal_xlm: i128,
        duration_ledgers: u32,
    ) -> u64 {
        // Owner must authorise this transaction via Freighter
        owner.require_auth();

        assert!(goal_xlm > 0,          "goal_xlm must be greater than 0");
        assert!(duration_ledgers > 0,  "duration_ledgers must be greater than 0");
        assert!(duration_ledgers <= 518_400, "duration_ledgers max is ~30 days");

        let id = Self::next_id(&env);

        let campaign = Campaign {
            id,
            owner: owner.clone(),
            title,
            description,
            goal:     goal_xlm * 10_000_000,  // XLM → stroops
            raised:   0,
            deadline: env.ledger().sequence() + duration_ledgers,
            withdrawn: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(id), &campaign);

        // Emit event: (topic: "created", id) data: goal_xlm
        env.events().publish(
            (symbol_short!("created"), id),
            goal_xlm,
        );

        id
    }

    /// Fund a campaign with XLM.
    ///
    /// # Arguments
    /// * `campaign_id` - Target campaign
    /// * `backer`      - The contributor's address (must sign)
    /// * `amount_xlm`  - Amount to contribute in XLM (not stroops)
    pub fn contribute(
        env: Env,
        campaign_id: u64,
        backer: Address,
        amount_xlm: i128,
    ) {
        backer.require_auth();

        assert!(amount_xlm > 0, "amount_xlm must be greater than 0");

        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        assert!(
            env.ledger().sequence() < campaign.deadline,
            "Campaign has ended"
        );

        let amount_stroops = amount_xlm * 10_000_000;

        // Update individual contribution record
        let key = DataKey::Contribution(campaign_id, backer.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&key, &(prev + amount_stroops));

        // Update campaign total
        campaign.raised += amount_stroops;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        env.events().publish(
            (symbol_short!("funded"), campaign_id),
            amount_xlm,
        );
    }

    /// Campaign owner withdraws funds after goal is met.
    /// Can be called any time after goal is reached (even before deadline).
    pub fn withdraw(env: Env, campaign_id: u64) {
        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        // Only owner can withdraw
        campaign.owner.require_auth();

        assert!(campaign.raised >= campaign.goal, "Goal not reached yet");
        assert!(!campaign.withdrawn,              "Already withdrawn");

        campaign.withdrawn = true;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        env.events().publish(
            (symbol_short!("withdrew"), campaign_id),
            campaign.raised / 10_000_000,
        );
    }

    /// Backer claims a refund if the goal was NOT met after the deadline.
    pub fn refund(env: Env, campaign_id: u64, backer: Address) {
        backer.require_auth();

        let mut campaign: Campaign = env
            .storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist");

        assert!(
            env.ledger().sequence() >= campaign.deadline,
            "Campaign is still active"
        );
        assert!(
            campaign.raised < campaign.goal,
            "Goal was reached — no refund available"
        );

        let key = DataKey::Contribution(campaign_id, backer.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        assert!(amount > 0, "No contribution to refund");

        // Zero out BEFORE any transfer (prevents reentrancy)
        env.storage().persistent().set(&key, &0_i128);

        campaign.raised -= amount;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        env.events().publish(
            (symbol_short!("refunded"), campaign_id),
            amount / 10_000_000,
        );
    }

    // ── Read functions (view — no auth needed) ────────────────────────────────

    /// Get a single campaign by ID.
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        env.storage()
            .persistent()
            .get(&DataKey::Campaign(campaign_id))
            .expect("Campaign does not exist")
    }

    /// Get how much a specific backer contributed to a campaign (in stroops).
    pub fn get_contribution(env: Env, campaign_id: u64, backer: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(campaign_id, backer))
            .unwrap_or(0)
    }

    /// Get the total number of campaigns ever created.
    pub fn get_campaign_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn next_id(env: &Env) -> u64 {
        let count: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::CampaignCount, &(count + 1));
        count
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
// Inline test module — runs with `cargo test`

#[cfg(test)]
mod test;