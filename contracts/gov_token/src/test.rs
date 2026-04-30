#![cfg(test)]
extern crate std;

use super::{Error, GovToken, GovTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn setup() -> (Env, GovTokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(GovToken, ());
    let client = GovTokenClient::new(&env, &id);
    client.init(
        &admin,
        &7,
        &String::from_str(&env, "DAO Vote"),
        &String::from_str(&env, "VOTE"),
    );
    (env, client, admin)
}

#[test]
fn init_metadata() {
    let (env, c, _) = setup();
    assert_eq!(c.decimals(), 7);
    assert_eq!(c.name(), String::from_str(&env, "DAO Vote"));
    assert_eq!(c.symbol(), String::from_str(&env, "VOTE"));
}

#[test]
fn double_init_rejected() {
    let (env, c, admin) = setup();
    let res = c.try_init(
        &admin,
        &7,
        &String::from_str(&env, "x"),
        &String::from_str(&env, "X"),
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn admin_mint_and_balance() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    c.mint(&user, &500);
    assert_eq!(c.balance(&user), 500);
}

#[test]
fn faucet_grants_amount_once() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    let amt = c.faucet(&user);
    assert_eq!(amt, 1_000 * 10_000_000);
    assert_eq!(c.balance(&user), 1_000 * 10_000_000);
    assert!(c.claimed(&user));
}

#[test]
fn faucet_double_claim_rejected() {
    let (env, c, _) = setup();
    let user = Address::generate(&env);
    c.faucet(&user);
    let res = c.try_faucet(&user);
    assert_eq!(res, Err(Ok(Error::AlreadyClaimed)));
}

#[test]
fn transfer_moves_balance() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    c.faucet(&a);
    c.transfer(&a, &b, &100);
    assert_eq!(c.balance(&a), 1_000 * 10_000_000 - 100);
    assert_eq!(c.balance(&b), 100);
}

#[test]
fn transfer_insufficient_rejected() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let res = c.try_transfer(&a, &b, &1);
    assert_eq!(res, Err(Ok(Error::InsufficientBalance)));
}

#[test]
fn negative_amount_rejected() {
    let (env, c, _) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let res = c.try_transfer(&a, &b, &-1);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}
