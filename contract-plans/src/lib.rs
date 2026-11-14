//! Sealed plans: Premium subscriptions paid in NEAR (testnet).
//! subscribe(months) takes exactly price × months and extends the caller's Premium period.
//! The seal contract is separate and unaffected.
use near_sdk::store::LookupMap;
use near_sdk::{AccountId, NearToken, PanicOnDefault, Promise, env, json_types::U64, near};

const MONTH_MS: u64 = 30 * 24 * 60 * 60 * 1000;

#[near(serializers = [json])]
pub struct Plan {
    pub account: AccountId,
    pub premium_until_ms: U64,
    pub active: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealedPlans {
    owner: AccountId,
    price_per_month: NearToken,
    premium_until: LookupMap<AccountId, u64>,
    subscriptions: u32,
}

#[near]
impl SealedPlans {
    #[init]
    #[private]
    pub fn new(owner: AccountId, price_per_month: NearToken) -> Self {
        assert!(price_per_month.as_yoctonear() > 0, "Price must be positive");
        Self { owner, price_per_month, premium_until: LookupMap::new(b"p"), subscriptions: 0 }
    }

    /// Pay exactly price × months. Renewals stack on top of any time still left.
    #[payable]
    pub fn subscribe(&mut self, months: u32) -> Plan {
        assert!((1..=12).contains(&months), "Months must be between 1 and 12");
        let due = self.price_per_month.saturating_mul(months as u128);
        assert_eq!(env::attached_deposit(), due, "Attach exactly {} yoctoNEAR for {} month(s)", due.as_yoctonear(), months);
        let account = env::predecessor_account_id();
        let now = env::block_timestamp_ms();
        let start = self.premium_until.get(&account).copied().filter(|until| *until > now).unwrap_or(now);
        let until = start + months as u64 * MONTH_MS;
        self.premium_until.insert(account.clone(), until);
        self.subscriptions += 1;
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"sealed-plans\",\"version\":\"1.0.0\",\"event\":\"subscribe\",\"data\":{{\"account\":\"{account}\",\"months\":{months},\"premium_until_ms\":{until},\"paid_yocto\":\"{}\"}}}}",
            due.as_yoctonear()
        ));
        Plan { account, premium_until_ms: U64(until), active: true }
    }

    pub fn get_plan(&self, account: AccountId) -> Plan {
        let until = self.premium_until.get(&account).copied().unwrap_or(0);
        Plan { account, premium_until_ms: U64(until), active: until > env::block_timestamp_ms() }
    }

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({ "owner": self.owner, "price_per_month_yocto": self.price_per_month.as_yoctonear().to_string(), "subscriptions": self.subscriptions })
    }

    pub fn set_price(&mut self, price_per_month: NearToken) {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only the owner can change the price");
        assert!(price_per_month.as_yoctonear() > 0, "Price must be positive");
        self.price_per_month = price_per_month;
    }

    pub fn withdraw(&mut self, amount: NearToken) -> Promise {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only the owner can withdraw");
        Promise::new(self.owner.clone()).transfer(amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    fn acc(v: &str) -> AccountId { v.parse().unwrap() }
    const ONE: NearToken = NearToken::from_near(1);
    fn ctx(caller: &str, deposit: NearToken, ms: u64) {
        testing_env!(VMContextBuilder::new().current_account_id(acc("plans.testnet")).predecessor_account_id(acc(caller))
            .attached_deposit(deposit).block_timestamp(ms * 1_000_000).build());
    }
    fn setup() -> SealedPlans { ctx("plans.testnet", NearToken::from_yoctonear(0), 1_000); SealedPlans::new(acc("owner.testnet"), ONE) }

    #[test]
    fn correct_deposit_extends_premium_and_renewals_stack() {
        let mut c = setup();
        ctx("alice.testnet", ONE, 1_000);
        assert_eq!(c.subscribe(1).premium_until_ms.0, 1_000 + MONTH_MS);
        ctx("alice.testnet", NearToken::from_near(2), 2_000);
        assert_eq!(c.subscribe(2).premium_until_ms.0, 1_000 + 3 * MONTH_MS, "renewal stacks on remaining time");
        ctx("anyone.testnet", NearToken::from_yoctonear(0), 2_000);
        assert!(c.get_plan(acc("alice.testnet")).active);
        assert!(!c.get_plan(acc("bob.testnet")).active);
    }

    #[test]
    fn expired_plan_restarts_from_now() {
        let mut c = setup();
        ctx("alice.testnet", ONE, 1_000); c.subscribe(1);
        let later = 1_000 + 2 * MONTH_MS;
        ctx("alice.testnet", ONE, later);
        assert!(!c.get_plan(acc("alice.testnet")).active || c.get_plan(acc("alice.testnet")).premium_until_ms.0 > later);
        assert_eq!(c.subscribe(1).premium_until_ms.0, later + MONTH_MS);
    }

    #[test]
    #[should_panic(expected = "Attach exactly")]
    fn wrong_deposit_refused() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_millinear(500), 1_000);
        c.subscribe(1);
    }

    #[test]
    #[should_panic(expected = "Months must be between 1 and 12")]
    fn months_bounded() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_near(13), 1_000);
        c.subscribe(13);
    }

    #[test]
    #[should_panic(expected = "Only the owner can change the price")]
    fn only_owner_sets_price() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0), 1_000);
        c.set_price(NearToken::from_near(5));
    }

    #[test]
    #[should_panic(expected = "Only the owner can withdraw")]
    fn only_owner_withdraws() {
        let mut c = setup();
        ctx("alice.testnet", NearToken::from_yoctonear(0), 1_000);
        c.withdraw(ONE);
    }

    #[test]
    fn owner_can_change_price() {
        let mut c = setup();
        ctx("owner.testnet", NearToken::from_yoctonear(0), 1_000);
        c.set_price(NearToken::from_near(2));
        ctx("alice.testnet", NearToken::from_near(2), 1_000);
        assert!(c.subscribe(1).active);
    }
}
