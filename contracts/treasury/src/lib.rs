#![no_std]
//! DAO Treasury — holds `VOTE` (or any) tokens. Funds can only leave via
//! `release()` which is gated by the registered `proposal_registry`
//! contract. Anyone can deposit.
//!
//! Inter-contract calls:
//! - `release(to, amount)` → `gov_token.transfer(treasury, to, amount)` (1 call)
//! - `deposit(from, amount)` → `gov_token.transfer(from, treasury, amount)` (1 call)

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, Env,
};

#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Registry,
    GovToken,
    Initialized,
    TotalReleased,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    Overflow = 4,
}

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    pub fn init(env: Env, registry: Address, gov_token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::GovToken, &gov_token);
        env.storage().instance().set(&DataKey::TotalReleased, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    /// Release `amount` of gov_token from the treasury to `to`.
    /// **Only** the registered `proposal_registry` contract may invoke this.
    pub fn release(env: Env, to: Address, amount: i128) -> Result<(), Error> {
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::NotInitialized)?;
        registry.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;
        let token = TokenClient::new(&env, &gov_token);
        token.transfer(&env.current_contract_address(), &to, &amount);

        let prev: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalReleased)
            .unwrap_or(0);
        let next = prev.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().instance().set(&DataKey::TotalReleased, &next);
        Ok(())
    }

    /// Permissionless donation — anyone can fund the treasury.
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
        from.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;
        let token = TokenClient::new(&env, &gov_token);
        token.transfer(&from, &env.current_contract_address(), &amount);
        Ok(())
    }

    pub fn balance(env: Env) -> i128 {
        let gov_token: Address = match env.storage().instance().get(&DataKey::GovToken) {
            Some(a) => a,
            None => return 0,
        };
        let token = TokenClient::new(&env, &gov_token);
        token.balance(&env.current_contract_address())
    }

    pub fn registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Registry)
    }

    pub fn gov_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::GovToken)
    }

    pub fn total_released(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalReleased)
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
