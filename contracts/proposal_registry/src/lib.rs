#![no_std]
//! Stellar DAO — proposal registry.
//!
//! Anyone with `proposal_deposit` VOTE can submit a proposal to release
//! treasury funds. VOTE-holders vote `for` / `against`. After the voting
//! period closes, anyone can `execute()` a passing proposal (or
//! `finalize_defeated()` a failed one).
//!
//! Vote weight = the voter's `gov_token.balance()` at the moment of voting.
//! A voter can vote at most once per proposal.
//!
//! ## Inter-contract calls
//!
//! - `propose()`  → `gov_token.transfer(proposer → registry, deposit)`        (1 call)
//! - `vote()`     → `gov_token.balance(voter)`                                (1 call, read)
//! - `execute()`  → `treasury.release(target, amount)`                        (call #1)
//!                + `gov_token.transfer(registry → executor, reward)`        (call #2)
//!                + `gov_token.transfer(registry → proposer, deposit-reward)` (call #3)
//! - `finalize_defeated()` → `gov_token.transfer(registry → treasury, deposit)` (1 call)

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, Env, String,
};

#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn balance(env: Env, id: Address) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
}

#[contractclient(name = "TreasuryClient")]
pub trait TreasuryInterface {
    fn release(env: Env, to: Address, amount: i128);
}

const EXECUTOR_REWARD_BPS: i128 = 500; // 5% of the proposal deposit
const BPS_DENOM: i128 = 10_000;

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Status {
    Active = 0,
    Executed = 1,
    Defeated = 2,
}

#[contracttype]
#[derive(Clone)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub title: String,
    pub target: Address,
    pub amount: i128,
    pub created_at: u64,
    pub voting_ends: u64,
    pub for_votes: i128,
    pub against_votes: i128,
    pub status: Status,
    pub deposit: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    GovToken,
    Treasury,
    VotingPeriod,    // seconds
    ProposalDeposit, // raw amount of VOTE locked when proposing
    QuorumBps,       // e.g., 2000 = 20% of total VOTE supply must vote `for`
    TotalSupplyHint, // for quorum math (admin-set; demo simplification)
    Counter,
    Initialized,
    Proposal(u32),
    Voted(u32, Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    EmptyTitle = 4,
    ProposalNotFound = 5,
    AlreadyVoted = 6,
    NoVoteWeight = 7,
    VotingClosed = 8,
    VotingStillOpen = 9,
    NotPassed = 10,
    AlreadyFinalized = 11,
    ProposalPassed = 12,
    Overflow = 13,
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    #[allow(clippy::too_many_arguments)]
    pub fn init(
        env: Env,
        admin: Address,
        gov_token: Address,
        treasury: Address,
        voting_period_secs: u64,
        proposal_deposit: i128,
        quorum_bps: u32,
        total_supply_hint: i128,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(Error::AlreadyInitialized);
        }
        if proposal_deposit <= 0 || total_supply_hint <= 0 || quorum_bps == 0 {
            return Err(Error::InvalidAmount);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::GovToken, &gov_token);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage()
            .instance()
            .set(&DataKey::VotingPeriod, &voting_period_secs);
        env.storage()
            .instance()
            .set(&DataKey::ProposalDeposit, &proposal_deposit);
        env.storage().instance().set(&DataKey::QuorumBps, &quorum_bps);
        env.storage()
            .instance()
            .set(&DataKey::TotalSupplyHint, &total_supply_hint);
        env.storage().instance().set(&DataKey::Counter, &0u32);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    /// Submit a new proposal. Locks `proposal_deposit` VOTE from the proposer.
    pub fn propose(
        env: Env,
        proposer: Address,
        title: String,
        target: Address,
        amount: i128,
    ) -> Result<u32, Error> {
        proposer.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if title.len() == 0 {
            return Err(Error::EmptyTitle);
        }

        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;
        let deposit: i128 = env
            .storage()
            .instance()
            .get(&DataKey::ProposalDeposit)
            .ok_or(Error::NotInitialized)?;
        let voting_period: u64 = env
            .storage()
            .instance()
            .get(&DataKey::VotingPeriod)
            .ok_or(Error::NotInitialized)?;

        // ── inter-contract call #1: pull deposit from proposer
        let token = TokenClient::new(&env, &gov_token);
        token.transfer(&proposer, &env.current_contract_address(), &deposit);

        let mut counter: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0);
        counter += 1;
        let now = env.ledger().timestamp();

        let p = Proposal {
            id: counter,
            proposer: proposer.clone(),
            title,
            target,
            amount,
            created_at: now,
            voting_ends: now + voting_period,
            for_votes: 0,
            against_votes: 0,
            status: Status::Active,
            deposit,
        };
        env.storage().persistent().set(&DataKey::Proposal(counter), &p);
        env.storage().instance().set(&DataKey::Counter, &counter);
        Ok(counter)
    }

    /// Cast a vote on an active proposal. Weight = voter's current VOTE balance.
    pub fn vote(env: Env, voter: Address, proposal_id: u32, support: bool) -> Result<i128, Error> {
        voter.require_auth();
        let mut p: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(Error::ProposalNotFound)?;
        if p.status != Status::Active {
            return Err(Error::VotingClosed);
        }
        if env.ledger().timestamp() >= p.voting_ends {
            return Err(Error::VotingClosed);
        }
        let voted_key = DataKey::Voted(proposal_id, voter.clone());
        if env
            .storage()
            .persistent()
            .get::<DataKey, bool>(&voted_key)
            .unwrap_or(false)
        {
            return Err(Error::AlreadyVoted);
        }

        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;
        let token = TokenClient::new(&env, &gov_token);
        // ── inter-contract call: read voter's balance as weight
        let weight = token.balance(&voter);
        if weight <= 0 {
            return Err(Error::NoVoteWeight);
        }

        if support {
            p.for_votes = p.for_votes.checked_add(weight).ok_or(Error::Overflow)?;
        } else {
            p.against_votes = p
                .against_votes
                .checked_add(weight)
                .ok_or(Error::Overflow)?;
        }
        env.storage().persistent().set(&voted_key, &true);
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &p);
        Ok(weight)
    }

    /// Execute a passing proposal after the voting period closes.
    /// Performs **3 inter-contract calls**: treasury release + executor reward
    /// + proposer deposit refund.
    pub fn execute(env: Env, executor: Address, proposal_id: u32) -> Result<(), Error> {
        executor.require_auth();
        let mut p: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(Error::ProposalNotFound)?;
        if p.status != Status::Active {
            return Err(Error::AlreadyFinalized);
        }
        if env.ledger().timestamp() < p.voting_ends {
            return Err(Error::VotingStillOpen);
        }
        if p.for_votes <= p.against_votes {
            return Err(Error::NotPassed);
        }
        // Quorum check: for_votes >= total_supply_hint * quorum_bps / 10_000
        let total_supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupplyHint)
            .ok_or(Error::NotInitialized)?;
        let quorum_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::QuorumBps)
            .ok_or(Error::NotInitialized)?;
        let quorum_threshold = total_supply
            .checked_mul(quorum_bps as i128)
            .ok_or(Error::Overflow)?
            / BPS_DENOM;
        if p.for_votes < quorum_threshold {
            return Err(Error::NotPassed);
        }

        let treasury_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(Error::NotInitialized)?;
        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;

        // ── inter-contract call #1: treasury releases the proposal action
        let treasury = TreasuryClient::new(&env, &treasury_addr);
        treasury.release(&p.target, &p.amount);

        // Compute reward / refund split of the locked deposit
        let reward = p
            .deposit
            .checked_mul(EXECUTOR_REWARD_BPS)
            .ok_or(Error::Overflow)?
            / BPS_DENOM;
        let refund = p.deposit - reward;

        let token = TokenClient::new(&env, &gov_token);
        // ── inter-contract call #2: executor gets reward (anti-spam incentive)
        if reward > 0 {
            token.transfer(&env.current_contract_address(), &executor, &reward);
        }
        // ── inter-contract call #3: proposer gets remaining deposit back
        if refund > 0 {
            token.transfer(&env.current_contract_address(), &p.proposer, &refund);
        }

        p.status = Status::Executed;
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &p);
        Ok(())
    }

    /// Mark a defeated / quorum-failing proposal as finalized after the
    /// voting period. The locked deposit is forfeited to the treasury
    /// (anti-spam).
    pub fn finalize_defeated(env: Env, proposal_id: u32) -> Result<(), Error> {
        let mut p: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(Error::ProposalNotFound)?;
        if p.status != Status::Active {
            return Err(Error::AlreadyFinalized);
        }
        if env.ledger().timestamp() < p.voting_ends {
            return Err(Error::VotingStillOpen);
        }
        // Only call this for losing or quorum-failing proposals
        if p.for_votes > p.against_votes {
            // Check quorum
            let total_supply: i128 = env
                .storage()
                .instance()
                .get(&DataKey::TotalSupplyHint)
                .ok_or(Error::NotInitialized)?;
            let quorum_bps: u32 = env
                .storage()
                .instance()
                .get(&DataKey::QuorumBps)
                .ok_or(Error::NotInitialized)?;
            let quorum_threshold = total_supply
                .checked_mul(quorum_bps as i128)
                .ok_or(Error::Overflow)?
                / BPS_DENOM;
            if p.for_votes >= quorum_threshold {
                return Err(Error::ProposalPassed);
            }
        }

        let treasury_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Treasury)
            .ok_or(Error::NotInitialized)?;
        let gov_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::GovToken)
            .ok_or(Error::NotInitialized)?;
        // Forfeit deposit to treasury
        let token = TokenClient::new(&env, &gov_token);
        if p.deposit > 0 {
            token.transfer(&env.current_contract_address(), &treasury_addr, &p.deposit);
        }
        p.status = Status::Defeated;
        env.storage().persistent().set(&DataKey::Proposal(proposal_id), &p);
        Ok(())
    }

    // ── Read helpers ───────────────────────────────────────────────────────

    pub fn get(env: Env, proposal_id: u32) -> Option<Proposal> {
        env.storage().persistent().get(&DataKey::Proposal(proposal_id))
    }

    pub fn has_voted(env: Env, proposal_id: u32, voter: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Voted(proposal_id, voter))
            .unwrap_or(false)
    }

    pub fn count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0)
    }

    pub fn voting_period(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::VotingPeriod).unwrap_or(0)
    }

    pub fn proposal_deposit(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::ProposalDeposit).unwrap_or(0)
    }

    pub fn quorum_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::QuorumBps).unwrap_or(0)
    }

    pub fn total_supply_hint(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupplyHint).unwrap_or(0)
    }

    pub fn treasury(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Treasury)
    }

    pub fn gov_token(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::GovToken)
    }
}

#[cfg(test)]
mod test;
