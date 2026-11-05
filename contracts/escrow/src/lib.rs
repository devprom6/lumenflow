//! Time-Locked Escrow Contract
//!
//! Holds tokens until a specified Stellar ledger sequence number is reached.
//! After the unlock ledger, the beneficiary can release the funds.
//! Before the unlock ledger, only the depositor can reclaim them.
//!
//! # Flow
//! 1. Depositor calls `initialize()` to configure parties and terms.
//! 2. Depositor calls `deposit()` — tokens transfer from depositor to contract.
//! 3. After `unlock_ledger`, beneficiary calls `release()` to claim funds.
//! 4. Before `unlock_ledger`, depositor can call `refund()` to cancel.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, Env,
};

// ── Storage keys ────────────────────────────────────────────────────────────

const STATE_KEY: &str = "state";

// ── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EscrowStatus {
    Initialized,
    Funded,
    Released,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowState {
    pub depositor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    /// Stellar ledger sequence number at or after which funds can be released.
    pub unlock_ledger: u32,
    pub status: EscrowStatus,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// Contract has already been initialized.
    AlreadyInitialized = 1,
    /// Contract has not been initialized yet.
    NotInitialized = 2,
    /// Funds have already been deposited.
    AlreadyFunded = 3,
    /// Funds must be deposited before release.
    NotFunded = 4,
    /// The unlock ledger has not been reached yet.
    NotUnlocked = 5,
    /// The unlock ledger has already passed; refund is no longer possible.
    AlreadyUnlocked = 6,
    /// Escrow has already been completed (released or refunded).
    AlreadyComplete = 7,
    /// Amount must be positive.
    InvalidAmount = 8,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Configure the escrow parameters. Must be called exactly once.
    pub fn initialize(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
        unlock_ledger: u32,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&symbol_short!("state")) {
            return Err(EscrowError::AlreadyInitialized);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let state = EscrowState {
            depositor,
            beneficiary,
            token,
            amount,
            unlock_ledger,
            status: EscrowStatus::Initialized,
        };

        env.storage().instance().set(&symbol_short!("state"), &state);
        Ok(())
    }

    /// Deposit tokens from the depositor into the contract.
    /// The depositor must authorize this call.
    pub fn deposit(env: Env) -> Result<(), EscrowError> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&symbol_short!("state"))
            .ok_or(EscrowError::NotInitialized)?;

        match state.status {
            EscrowStatus::Funded => return Err(EscrowError::AlreadyFunded),
            EscrowStatus::Released | EscrowStatus::Refunded => {
                return Err(EscrowError::AlreadyComplete)
            }
            EscrowStatus::Initialized => {}
        }

        state.depositor.require_auth();

        let token_client = soroban_sdk::token::Client::new(&env, &state.token);
        token_client.transfer(
            &state.depositor,
            &env.current_contract_address(),
            &state.amount,
        );

        state.status = EscrowStatus::Funded;
        env.storage().instance().set(&symbol_short!("state"), &state);
        Ok(())
    }

    /// Release funds to the beneficiary. Only callable at or after `unlock_ledger`.
    pub fn release(env: Env) -> Result<(), EscrowError> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&symbol_short!("state"))
            .ok_or(EscrowError::NotInitialized)?;

        if state.status != EscrowStatus::Funded {
            return Err(EscrowError::NotFunded);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < state.unlock_ledger {
            return Err(EscrowError::NotUnlocked);
        }

        let token_client = soroban_sdk::token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.beneficiary,
            &state.amount,
        );

        state.status = EscrowStatus::Released;
        env.storage().instance().set(&symbol_short!("state"), &state);
        Ok(())
    }

    /// Refund the depositor. Only callable before `unlock_ledger`.
    /// The depositor must authorize this call.
    pub fn refund(env: Env) -> Result<(), EscrowError> {
        let mut state: EscrowState = env
            .storage()
            .instance()
            .get(&symbol_short!("state"))
            .ok_or(EscrowError::NotInitialized)?;

        if state.status != EscrowStatus::Funded {
            return Err(EscrowError::NotFunded);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger >= state.unlock_ledger {
            return Err(EscrowError::AlreadyUnlocked);
        }

        state.depositor.require_auth();

        let token_client = soroban_sdk::token::Client::new(&env, &state.token);
        token_client.transfer(
            &env.current_contract_address(),
            &state.depositor,
            &state.amount,
        );

        state.status = EscrowStatus::Refunded;
        env.storage().instance().set(&symbol_short!("state"), &state);
        Ok(())
    }

    /// Return the current escrow state.
    pub fn get_state(env: Env) -> Result<EscrowState, EscrowError> {
        env.storage()
            .instance()
            .get(&symbol_short!("state"))
            .ok_or(EscrowError::NotInitialized)
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{token, vec as _, Address, Env};
    use token::StellarAssetClient;

    fn setup() -> (Env, EscrowContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_id = token_contract.address();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        let stellar_asset = StellarAssetClient::new(&env, &token_id);
        stellar_asset.mint(&depositor, &1_000);

        (env, client, depositor, beneficiary, token_id)
    }

    #[test]
    fn test_full_release_flow() {
        let (env, client, depositor, beneficiary, token_id) = setup();

        client.initialize(&depositor, &beneficiary, &token_id, &1_000, &100).unwrap();
        client.deposit().unwrap();

        // Advance ledger past unlock
        env.ledger().set_sequence_number(100);
        client.release().unwrap();

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&beneficiary), 1_000);
        assert_eq!(token_client.balance(&depositor), 0);
    }

    #[test]
    fn test_refund_before_unlock() {
        let (env, client, depositor, beneficiary, token_id) = setup();

        client.initialize(&depositor, &beneficiary, &token_id, &1_000, &200).unwrap();
        client.deposit().unwrap();

        // Ledger is still before unlock_ledger
        env.ledger().set_sequence_number(50);
        client.refund().unwrap();

        let token_client = token::Client::new(&env, &token_id);
        assert_eq!(token_client.balance(&depositor), 1_000);
    }

    #[test]
    fn test_release_before_unlock_fails() {
        let (env, client, depositor, beneficiary, token_id) = setup();

        client.initialize(&depositor, &beneficiary, &token_id, &500, &100).unwrap();
        client.deposit().unwrap();

        env.ledger().set_sequence_number(50); // before unlock
        let result = client.try_release();
        assert!(result.is_err());
    }

    #[test]
    fn test_refund_after_unlock_fails() {
        let (env, client, depositor, beneficiary, token_id) = setup();

        client.initialize(&depositor, &beneficiary, &token_id, &500, &100).unwrap();
        client.deposit().unwrap();

        env.ledger().set_sequence_number(100); // at unlock
        let result = client.try_refund();
        assert!(result.is_err());
    }

    #[test]
    fn test_get_state() {
        let (env, client, depositor, beneficiary, token_id) = setup();

        client.initialize(&depositor, &beneficiary, &token_id, &1_000, &100).unwrap();

        let state = client.get_state().unwrap();
        assert_eq!(state.amount, 1_000);
        assert_eq!(state.unlock_ledger, 100);
        assert_eq!(state.status, EscrowStatus::Initialized);
    }
}
