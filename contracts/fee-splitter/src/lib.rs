//! Fee Splitter Contract
//!
//! Distributes a token amount proportionally to a set of recipients according
//! to basis-point (bps) shares. The shares must sum to exactly 10 000.
//!
//! # Usage
//! 1. Call `initialize(recipients)` once to store the recipient list.
//! 2. Approve this contract to transfer `amount` from the caller's token balance.
//! 3. Call `split(token, amount)` — the contract pulls funds from the caller and
//!    fans them out to each recipient according to their bps share.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, Env, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────

const RECIPIENTS_KEY: &str = "recipients";
const INITIALIZED_KEY: &str = "init";

// ── Data types ───────────────────────────────────────────────────────────────

/// A single recipient and their share in basis points (1 bps = 0.01%).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Recipient {
    pub address: Address,
    /// Share in basis points. All recipients' bps values must sum to 10 000.
    pub bps: u32,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FeeSplitterError {
    /// Contract has already been initialized.
    AlreadyInitialized = 1,
    /// Recipient bps shares do not sum to 10 000.
    InvalidBpsTotal = 2,
    /// Recipient list is empty.
    EmptyRecipients = 3,
    /// Contract has not been initialized yet.
    NotInitialized = 4,
    /// Token transfer failed.
    TransferFailed = 5,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct FeeSplitterContract;

#[contractimpl]
impl FeeSplitterContract {
    /// Initialize the fee splitter with a list of recipients and their bps shares.
    /// Must be called exactly once before `split()`.
    pub fn initialize(env: Env, recipients: Vec<Recipient>) -> Result<(), FeeSplitterError> {
        if env.storage().instance().has(&symbol_short!("init")) {
            return Err(FeeSplitterError::AlreadyInitialized);
        }
        if recipients.is_empty() {
            return Err(FeeSplitterError::EmptyRecipients);
        }

        // Validate bps total
        let mut total_bps: u32 = 0;
        for r in recipients.iter() {
            total_bps = total_bps.saturating_add(r.bps);
        }
        if total_bps != 10_000 {
            return Err(FeeSplitterError::InvalidBpsTotal);
        }

        env.storage().instance().set(&symbol_short!("init"), &true);
        env.storage().instance().set(&symbol_short!("recs"), &recipients);
        Ok(())
    }

    /// Retrieve the stored recipient list.
    pub fn get_recipients(env: Env) -> Result<Vec<Recipient>, FeeSplitterError> {
        if !env.storage().instance().has(&symbol_short!("init")) {
            return Err(FeeSplitterError::NotInitialized);
        }
        Ok(env
            .storage()
            .instance()
            .get::<_, Vec<Recipient>>(&symbol_short!("recs"))
            .unwrap())
    }

    /// Pull `amount` tokens from `caller` and distribute to all recipients.
    ///
    /// The caller must have already approved this contract to transfer `amount`
    /// tokens via the token's `approve()` function.
    pub fn split(
        env: Env,
        caller: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), FeeSplitterError> {
        if !env.storage().instance().has(&symbol_short!("init")) {
            return Err(FeeSplitterError::NotInitialized);
        }

        caller.require_auth();

        let recipients: Vec<Recipient> = env
            .storage()
            .instance()
            .get(&symbol_short!("recs"))
            .unwrap();

        let token_client = soroban_sdk::token::Client::new(&env, &token);

        // Pull the full amount from the caller into this contract
        token_client.transfer(&caller, &env.current_contract_address(), &amount);

        // Distribute proportionally — track remainder for last recipient
        let mut distributed: i128 = 0;
        let count = recipients.len();

        for (i, recipient) in recipients.iter().enumerate() {
            let share = if i as u32 == count - 1 {
                // Give remainder to last recipient to avoid dust
                amount - distributed
            } else {
                amount * (recipient.bps as i128) / 10_000
            };

            if share > 0 {
                token_client.transfer(&env.current_contract_address(), &recipient.address, &share);
                distributed += share;
            }
        }

        Ok(())
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{token, vec, Address, Env};
    use token::StellarAssetClient;

    #[test]
    fn test_initialize_and_split() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, FeeSplitterContract);
        let client = FeeSplitterContractClient::new(&env, &contract_id);

        // Create a test token
        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_id = token_contract.address();
        let stellar_asset = StellarAssetClient::new(&env, &token_id);

        // Set up accounts
        let sender = Address::generate(&env);
        let recipient_a = Address::generate(&env);
        let recipient_b = Address::generate(&env);

        // Mint 1000 tokens to sender
        stellar_asset.mint(&sender, &1_000);

        // Initialize: 70% to A, 30% to B
        let recipients = vec![
            &env,
            Recipient { address: recipient_a.clone(), bps: 7_000 },
            Recipient { address: recipient_b.clone(), bps: 3_000 },
        ];
        client.initialize(&recipients).unwrap();

        // Split 1000 tokens
        client.split(&sender, &token_id, &1_000).unwrap();

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&recipient_a), 700);
        assert_eq!(token_client.balance(&recipient_b), 300);
        assert_eq!(token_client.balance(&sender), 0);
    }

    #[test]
    fn test_initialize_invalid_bps_total() {
        let env = Env::default();
        let contract_id = env.register_contract(None, FeeSplitterContract);
        let client = FeeSplitterContractClient::new(&env, &contract_id);

        let addr = Address::generate(&env);
        let recipients = vec![
            &env,
            Recipient { address: addr, bps: 5_000 }, // Only 50%, not 100%
        ];
        let result = client.try_initialize(&recipients);
        assert!(result.is_err());
    }

    #[test]
    fn test_double_initialize_fails() {
        let env = Env::default();
        let contract_id = env.register_contract(None, FeeSplitterContract);
        let client = FeeSplitterContractClient::new(&env, &contract_id);

        let addr = Address::generate(&env);
        let recipients = vec![
            &env,
            Recipient { address: addr, bps: 10_000 },
        ];
        client.initialize(&recipients).unwrap();
        let result = client.try_initialize(&recipients);
        assert!(result.is_err());
    }
}
