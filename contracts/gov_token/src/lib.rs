#![no_std]
//! Governance token (`VOTE`) for Stellar DAO.
//!
//! - One-time faucet: 1,000 VOTE per wallet
//! - Admin can `mint` (used in tests / treasury bootstrap)
//! - Balance is the **voting weight** read by `proposal_registry`
//! - Standard `transfer`, `balance`, `decimals`, `name`, `symbol`

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

const DECIMALS: u32 = 7;
const FAUCET_AMOUNT_RAW: i128 = 1_000 * 10_000_000; // 1,000 * 10^7

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
    Claimed(Address),
    Initialized,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAdmin = 3,
    InsufficientBalance = 4,
    InvalidAmount = 5,
    AlreadyClaimed = 6,
    Overflow = 7,
}

#[contract]
pub struct GovToken;

#[contractimpl]
impl GovToken {
    pub fn init(
        env: Env,
        admin: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let bal_key = DataKey::Balance(to.clone());
        let prev: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        let next = prev.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().persistent().set(&bal_key, &next);
        Ok(())
    }

    /// One-time faucet: anyone claims 1,000 VOTE (max once per wallet).
    pub fn faucet(env: Env, to: Address) -> Result<i128, Error> {
        to.require_auth();
        let key = DataKey::Claimed(to.clone());
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&key)
            .unwrap_or(false)
        {
            return Err(Error::AlreadyClaimed);
        }
        env.storage().persistent().set(&key, &true);
        let bal_key = DataKey::Balance(to.clone());
        let prev: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        let next = prev
            .checked_add(FAUCET_AMOUNT_RAW)
            .ok_or(Error::Overflow)?;
        env.storage().persistent().set(&bal_key, &next);
        Ok(FAUCET_AMOUNT_RAW)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let from_key = DataKey::Balance(from.clone());
        let from_bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if from_bal < amount {
            return Err(Error::InsufficientBalance);
        }
        env.storage().persistent().set(&from_key, &(from_bal - amount));

        let to_key = DataKey::Balance(to.clone());
        let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        let new_to = to_bal.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().persistent().set(&to_key, &new_to);
        Ok(())
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn claimed(env: Env, id: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Claimed(id))
            .unwrap_or(false)
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap_or(DECIMALS)
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or_else(|| String::from_str(&env, ""))
    }
}

#[cfg(test)]
mod test;
