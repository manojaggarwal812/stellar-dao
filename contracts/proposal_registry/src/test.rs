#![cfg(test)]
extern crate std;

use super::{Error, Registry, RegistryClient, Status};
use gov_token::{GovToken, GovTokenClient};
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env, String};
use treasury::{Treasury, TreasuryClient};

const VOTING_PERIOD: u64 = 86_400; // 1 day
const DEPOSIT_RAW: i128 = 100 * 10_000_000; // 100 VOTE
const QUORUM_BPS: u32 = 2_000; // 20%
const TOTAL_SUPPLY_HINT: i128 = 10_000 * 10_000_000; // 10k VOTE total assumed circulating

struct Ctx {
    env: Env,
    admin: Address,
    gov: GovTokenClient<'static>,
    gov_id: Address,
    treasury: TreasuryClient<'static>,
    treasury_id: Address,
    registry: RegistryClient<'static>,
    registry_id: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = 1_000_000;
    });

    let admin = Address::generate(&env);

    let gov_id = env.register(GovToken, ());
    let gov = GovTokenClient::new(&env, &gov_id);
    gov.init(
        &admin,
        &7,
        &String::from_str(&env, "DAO Vote"),
        &String::from_str(&env, "VOTE"),
    );

    let treasury_id = env.register(Treasury, ());
    let treasury = TreasuryClient::new(&env, &treasury_id);

    let registry_id = env.register(Registry, ());
    let registry = RegistryClient::new(&env, &registry_id);

    treasury.init(&registry_id, &gov_id);
    registry.init(
        &admin,
        &gov_id,
        &treasury_id,
        &VOTING_PERIOD,
        &DEPOSIT_RAW,
        &QUORUM_BPS,
        &TOTAL_SUPPLY_HINT,
    );

    Ctx {
        env,
        admin,
        gov,
        gov_id,
        treasury,
        treasury_id,
        registry,
        registry_id,
    }
}

fn fund(c: &Ctx, who: &Address, amount: i128) {
    c.gov.mint(who, &amount);
}

fn advance(c: &Ctx, by_secs: u64) {
    c.env.ledger().with_mut(|li| {
        li.timestamp += by_secs;
    });
}

#[test]
fn init_stores_config() {
    let c = setup();
    assert_eq!(c.registry.voting_period(), VOTING_PERIOD);
    assert_eq!(c.registry.proposal_deposit(), DEPOSIT_RAW);
    assert_eq!(c.registry.quorum_bps(), QUORUM_BPS);
    assert_eq!(c.registry.total_supply_hint(), TOTAL_SUPPLY_HINT);
    assert_eq!(c.registry.count(), 0);
    assert_eq!(c.registry.treasury(), Some(c.treasury_id.clone()));
    assert_eq!(c.registry.gov_token(), Some(c.gov_id.clone()));
}

#[test]
fn double_init_rejected() {
    let c = setup();
    let res = c.registry.try_init(
        &c.admin,
        &c.gov_id,
        &c.treasury_id,
        &VOTING_PERIOD,
        &DEPOSIT_RAW,
        &QUORUM_BPS,
        &TOTAL_SUPPLY_HINT,
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn propose_pulls_deposit_and_returns_id() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW * 5);

    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "Pay grant to dev"),
        &target,
        &500i128,
    );
    assert_eq!(id, 1);
    // Deposit moved from proposer to registry
    assert_eq!(c.gov.balance(&proposer), DEPOSIT_RAW * 5 - DEPOSIT_RAW);
    assert_eq!(c.gov.balance(&c.registry_id), DEPOSIT_RAW);
    let p = c.registry.get(&1u32).unwrap();
    assert_eq!(p.id, 1);
    assert_eq!(p.amount, 500);
    assert_eq!(p.status, Status::Active);
    assert_eq!(p.deposit, DEPOSIT_RAW);
}

#[test]
fn propose_invalid_amount_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    let target = Address::generate(&c.env);
    let res = c.registry.try_propose(
        &proposer,
        &String::from_str(&c.env, "x"),
        &target,
        &0i128,
    );
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn propose_empty_title_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    let target = Address::generate(&c.env);
    let res = c.registry.try_propose(
        &proposer,
        &String::from_str(&c.env, ""),
        &target,
        &10,
    );
    assert_eq!(res, Err(Ok(Error::EmptyTitle)));
}

#[test]
fn vote_records_weight() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW * 2);
    fund(&c, &voter, 5_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &10,
    );
    let weight = c.registry.vote(&voter, &id, &true);
    assert_eq!(weight, 5_000 * 10_000_000);
    let p = c.registry.get(&id).unwrap();
    assert_eq!(p.for_votes, 5_000 * 10_000_000);
    assert_eq!(p.against_votes, 0);
    assert!(c.registry.has_voted(&id, &voter));
}

#[test]
fn double_vote_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &voter, 100);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&voter, &id, &true);
    let res = c.registry.try_vote(&voter, &id, &false);
    assert_eq!(res, Err(Ok(Error::AlreadyVoted)));
}

#[test]
fn vote_without_balance_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    let res = c.registry.try_vote(&voter, &id, &true);
    assert_eq!(res, Err(Ok(Error::NoVoteWeight)));
}

#[test]
fn vote_after_deadline_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &voter, 100);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    advance(&c, VOTING_PERIOD + 1);
    let res = c.registry.try_vote(&voter, &id, &true);
    assert_eq!(res, Err(Ok(Error::VotingClosed)));
}

#[test]
fn execute_passes_calls_treasury_pays_executor_refunds_proposer() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    let executor = Address::generate(&c.env);
    let target = Address::generate(&c.env);

    fund(&c, &proposer, DEPOSIT_RAW * 2);
    // voter holds enough to single-handedly clear quorum (>= 20% of 10k = 2k VOTE)
    fund(&c, &voter, 3_000 * 10_000_000);
    // pre-fund treasury so it can pay out
    fund(&c, &c.treasury_id, 10_000 * 10_000_000);

    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "Pay grant"),
        &target,
        &(750 * 10_000_000),
    );
    c.registry.vote(&voter, &id, &true);
    advance(&c, VOTING_PERIOD + 1);

    let proposer_balance_before = c.gov.balance(&proposer);
    let treasury_before = c.treasury.balance();

    c.registry.execute(&executor, &id);

    // Treasury paid the target
    assert_eq!(c.gov.balance(&target), 750 * 10_000_000);
    // Treasury balance dropped
    assert_eq!(c.treasury.balance(), treasury_before - 750 * 10_000_000);
    // Executor got 5% reward of deposit
    let reward = DEPOSIT_RAW * 500 / 10_000;
    assert_eq!(c.gov.balance(&executor), reward);
    // Proposer got refund (95%)
    assert_eq!(c.gov.balance(&proposer), proposer_balance_before + DEPOSIT_RAW - reward);
    // Registry no longer holds the deposit
    assert_eq!(c.gov.balance(&c.registry_id), 0);
    // Status flipped
    let p = c.registry.get(&id).unwrap();
    assert_eq!(p.status, Status::Executed);
    // Treasury counter
    assert_eq!(c.treasury.total_released(), 750 * 10_000_000);
}

#[test]
fn execute_before_deadline_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    let executor = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &voter, 3_000 * 10_000_000);
    fund(&c, &c.treasury_id, 10_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&voter, &id, &true);
    let res = c.registry.try_execute(&executor, &id);
    assert_eq!(res, Err(Ok(Error::VotingStillOpen)));
}

#[test]
fn execute_losing_proposal_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let yes = Address::generate(&c.env);
    let no = Address::generate(&c.env);
    let executor = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &yes, 100 * 10_000_000);
    fund(&c, &no, 5_000 * 10_000_000);
    fund(&c, &c.treasury_id, 10_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&yes, &id, &true);
    c.registry.vote(&no, &id, &false);
    advance(&c, VOTING_PERIOD + 1);
    let res = c.registry.try_execute(&executor, &id);
    assert_eq!(res, Err(Ok(Error::NotPassed)));
}

#[test]
fn execute_below_quorum_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    let executor = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    // weight 100 VOTE — far below 2k VOTE quorum
    fund(&c, &voter, 100 * 10_000_000);
    fund(&c, &c.treasury_id, 10_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&voter, &id, &true);
    advance(&c, VOTING_PERIOD + 1);
    let res = c.registry.try_execute(&executor, &id);
    assert_eq!(res, Err(Ok(Error::NotPassed)));
}

#[test]
fn finalize_defeated_forfeits_deposit_to_treasury() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let yes = Address::generate(&c.env);
    let no = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &yes, 100 * 10_000_000);
    fund(&c, &no, 1_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&yes, &id, &true);
    c.registry.vote(&no, &id, &false);
    advance(&c, VOTING_PERIOD + 1);

    let treasury_before = c.treasury.balance();
    c.registry.finalize_defeated(&id);
    assert_eq!(c.treasury.balance(), treasury_before + DEPOSIT_RAW);
    assert_eq!(c.gov.balance(&c.registry_id), 0);
    let p = c.registry.get(&id).unwrap();
    assert_eq!(p.status, Status::Defeated);
}

#[test]
fn finalize_while_open_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    let res = c.registry.try_finalize_defeated(&id);
    assert_eq!(res, Err(Ok(Error::VotingStillOpen)));
}

#[test]
fn finalize_passed_proposal_rejected() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &voter, 3_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &1,
    );
    c.registry.vote(&voter, &id, &true);
    advance(&c, VOTING_PERIOD + 1);
    let res = c.registry.try_finalize_defeated(&id);
    assert_eq!(res, Err(Ok(Error::ProposalPassed)));
}

#[test]
fn cannot_execute_twice() {
    let c = setup();
    let proposer = Address::generate(&c.env);
    let voter = Address::generate(&c.env);
    let executor = Address::generate(&c.env);
    fund(&c, &proposer, DEPOSIT_RAW);
    fund(&c, &voter, 3_000 * 10_000_000);
    fund(&c, &c.treasury_id, 10_000 * 10_000_000);
    let target = Address::generate(&c.env);
    let id = c.registry.propose(
        &proposer,
        &String::from_str(&c.env, "p"),
        &target,
        &10,
    );
    c.registry.vote(&voter, &id, &true);
    advance(&c, VOTING_PERIOD + 1);
    c.registry.execute(&executor, &id);
    let res = c.registry.try_execute(&executor, &id);
    assert_eq!(res, Err(Ok(Error::AlreadyFinalized)));
}
