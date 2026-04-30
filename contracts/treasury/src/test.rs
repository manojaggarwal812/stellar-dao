#![cfg(test)]
extern crate std;

use super::{Error, Treasury, TreasuryClient};
use gov_token::{GovToken, GovTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

struct Ctx {
    env: Env,
    admin: Address,
    treasury: TreasuryClient<'static>,
    treasury_addr: Address,
    gov: GovTokenClient<'static>,
    registry: Address,
}

fn setup() -> Ctx {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let registry = Address::generate(&env); // pretend "registry" contract address

    // gov_token
    let gov_id = env.register(GovToken, ());
    let gov = GovTokenClient::new(&env, &gov_id);
    gov.init(
        &admin,
        &7,
        &String::from_str(&env, "DAO Vote"),
        &String::from_str(&env, "VOTE"),
    );

    // treasury
    let t_id = env.register(Treasury, ());
    let treasury = TreasuryClient::new(&env, &t_id);
    treasury.init(&registry, &gov_id);

    Ctx {
        env,
        admin,
        treasury,
        treasury_addr: t_id,
        gov,
        registry,
    }
}

#[test]
fn init_stores_addresses() {
    let c = setup();
    assert_eq!(c.treasury.registry(), Some(c.registry.clone()));
    assert!(c.treasury.gov_token().is_some());
    assert_eq!(c.treasury.total_released(), 0);
}

#[test]
fn double_init_rejected() {
    let c = setup();
    let other = Address::generate(&c.env);
    let res = c
        .treasury
        .try_init(&c.registry, &other);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn deposit_increases_balance() {
    let c = setup();
    let donor = Address::generate(&c.env);
    c.gov.faucet(&donor); // 1000 VOTE = 10_000_000_000 raw
    assert_eq!(c.treasury.balance(), 0);
    c.treasury.deposit(&donor, &500);
    assert_eq!(c.treasury.balance(), 500);
}

#[test]
fn release_pays_target_and_tracks_total() {
    let c = setup();
    // pre-fund treasury via admin mint directly to the treasury address
    c.gov.mint(&c.treasury_addr, &10_000);
    assert_eq!(c.treasury.balance(), 10_000);

    let target = Address::generate(&c.env);
    c.treasury.release(&target, &7_500);
    assert_eq!(c.gov.balance(&target), 7_500);
    assert_eq!(c.treasury.balance(), 2_500);
    assert_eq!(c.treasury.total_released(), 7_500);
}

#[test]
fn release_invalid_amount_rejected() {
    let c = setup();
    let target = Address::generate(&c.env);
    let res = c.treasury.try_release(&target, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn deposit_invalid_amount_rejected() {
    let c = setup();
    let donor = Address::generate(&c.env);
    let res = c.treasury.try_deposit(&donor, &-1);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn release_accumulates_total() {
    let c = setup();
    c.gov.mint(&c.treasury_addr, &10_000);
    let a = Address::generate(&c.env);
    let b = Address::generate(&c.env);
    c.treasury.release(&a, &1_000);
    c.treasury.release(&b, &2_500);
    assert_eq!(c.treasury.total_released(), 3_500);
    assert_eq!(c.treasury.balance(), 6_500);
}
