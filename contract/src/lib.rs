//! Account-bound anchors (v2). Workers authorize their own calls; NEP-366 may
//! sponsor their gas. Registration limits storage sponsorship, not evidence truth.
use near_sdk::collections::LookupMap;
use near_sdk::{AccountId, PanicOnDefault, env, json_types::U64, near};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Anchor {
    pub v: u8,
    pub network: String,
    pub worker: AccountId,
    pub day: String,
    pub root: String,
    pub count: u32,
    pub revision: u32,
    pub anchored_at_ns: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AppealAnchors {
    owner: AccountId,
    network: String,
    workers: LookupMap<AccountId, u32>,
    anchors: LookupMap<String, Anchor>,
    worker_count: u32,
    max_workers: u32,
    max_days_per_worker: u32,
}

#[near]
impl AppealAnchors {
    /// Deploy and initialize in one transaction signed by the contract account.
    #[init]
    #[private]
    pub fn new(
        owner: AccountId,
        network: String,
        max_workers: u32,
        max_days_per_worker: u32,
    ) -> Self {
        assert!(
            network == "testnet" || network == "mainnet",
            "Invalid network"
        );
        assert!(
            max_workers > 0 && max_workers <= 100_000,
            "Invalid worker capacity"
        );
        assert!(
            max_days_per_worker > 0 && max_days_per_worker <= 36_600,
            "Invalid day capacity"
        );
        Self {
            owner,
            network,
            workers: LookupMap::new(b"w".to_vec()),
            anchors: LookupMap::new(b"a".to_vec()),
            worker_count: 0,
            max_workers,
            max_days_per_worker,
        }
    }

    /// Only the deployment owner can allocate sponsored storage to an account.
    /// This never grants the owner authority to anchor as that worker.
    pub fn register_worker(&mut self, worker: AccountId) -> bool {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner may register workers"
        );
        if self.workers.contains_key(&worker) {
            return false;
        }
        assert!(
            self.worker_count < self.max_workers,
            "Worker capacity reached"
        );
        self.workers.insert(&worker, &0);
        self.worker_count += 1;
        true
    }

    /// No deposit is accepted. Workers are registered before a sponsor relays
    /// their signed anchor. The immediate predecessor must be the worker account.
    pub fn anchor(
        &mut self,
        v: u8,
        network: String,
        worker: AccountId,
        day: String,
        root: String,
        count: u32,
    ) -> Anchor {
        assert_eq!(v, 2, "Expected account-bound v2 anchor");
        assert_eq!(network, self.network, "Wrong anchor network");
        assert_eq!(
            worker,
            env::predecessor_account_id(),
            "Worker must authorize this call"
        );
        assert!(valid_day(&day), "Invalid day");
        assert!(
            root.len() == 64
                && root
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "Invalid root"
        );
        assert!(count > 0 && count <= 10_000, "Invalid entry count");
        let recorded_days = self.workers.get(&worker).expect("Worker is not registered");
        let key = format!("{worker}:{day}");
        let previous = self.anchors.get(&key);
        if let Some(ref old) = previous {
            if old.root == root && old.count == count {
                return old.clone();
            }
            assert!(count > old.count, "New anchors must increase entry count");
        } else {
            assert!(
                recorded_days < self.max_days_per_worker,
                "Worker day capacity reached"
            );
        }
        let record = Anchor {
            v,
            network,
            worker: worker.clone(),
            day,
            root,
            count,
            revision: previous.as_ref().map_or(1, |a| a.revision + 1),
            anchored_at_ns: U64(env::block_timestamp()),
        };
        self.anchors.insert(&key, &record);
        if previous.is_none() {
            self.workers.insert(&worker, &(recorded_days + 1));
        }
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({
                "standard": "appeal_record", "version": "2.0.0", "event": "anchor", "data": [&record]
            })
        ));
        record
    }

    pub fn get_anchor(&self, worker: AccountId, day: String) -> Option<Anchor> {
        self.anchors.get(&format!("{worker}:{day}"))
    }

    pub fn is_registered(&self, worker: AccountId) -> bool {
        self.workers.contains_key(&worker)
    }

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({ "protocol": 2, "network": self.network, "owner": self.owner, "max_workers": self.max_workers,
            "max_days_per_worker": self.max_days_per_worker, "registered_workers": self.worker_count })
    }
}

fn valid_day(day: &str) -> bool {
    let b = day.as_bytes();
    if b.len() != 10
        || b[4] != b'-'
        || b[7] != b'-'
        || b.iter()
            .enumerate()
            .any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit())
    {
        return false;
    }
    let year = day[..4].parse::<u32>().unwrap();
    let month = day[5..7].parse::<u32>().unwrap();
    let date = day[8..].parse::<u32>().unwrap();
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => 0,
    };
    date >= 1 && date <= days
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{
        test_utils::{VMContextBuilder, get_logs},
        testing_env,
    };

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }
    fn context(predecessor: &str) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id(account("anchors.testnet"))
                .signer_account_id(account("sponsor.testnet"))
                .predecessor_account_id(account(predecessor))
                .block_timestamp(1_000_000_000)
                .build()
        );
    }
    fn setup(max_days: u32) -> AppealAnchors {
        context("anchors.testnet");
        let mut contract =
            AppealAnchors::new(account("owner.testnet"), "testnet".into(), 2, max_days);
        context("owner.testnet");
        assert!(contract.register_worker(account("worker.testnet")));
        contract
    }
    fn add(contract: &mut AppealAnchors, day: &str, root: &str, count: u32) -> Anchor {
        contract.anchor(
            2,
            "testnet".into(),
            account("worker.testnet"),
            day.into(),
            root.into(),
            count,
        )
    }

    #[test]
    fn worker_call_stores_a_record_and_emits_evidence() {
        let mut contract = setup(2);
        context("worker.testnet");
        let record = add(&mut contract, "2026-11-12", &"a".repeat(64), 1);
        assert_eq!(record.worker, account("worker.testnet"));
        assert_eq!(record.revision, 1);
        assert_eq!(
            contract.get_anchor(account("worker.testnet"), "2026-11-12".into()),
            Some(record)
        );
        assert!(get_logs()[0].starts_with("EVENT_JSON:"));
    }
    #[test]
    #[should_panic(expected = "Worker must authorize this call")]
    fn even_the_owner_cannot_impersonate_a_worker() {
        let mut contract = setup(2);
        context("owner.testnet");
        add(&mut contract, "2026-11-12", &"a".repeat(64), 1);
    }
    #[test]
    #[should_panic(expected = "Only owner may register workers")]
    fn unauthorized_registration_fails() {
        let mut contract = setup(2);
        context("attacker.testnet");
        contract.register_worker(account("attacker.testnet"));
    }
    #[test]
    #[should_panic(expected = "Worker is not registered")]
    fn unregistered_worker_cannot_consume_storage() {
        let mut contract = setup(2);
        context("new.testnet");
        contract.anchor(
            2,
            "testnet".into(),
            account("new.testnet"),
            "2026-11-12".into(),
            "a".repeat(64),
            1,
        );
    }
    #[test]
    fn identical_retry_is_idempotent_and_extension_retains_revision() {
        let mut contract = setup(2);
        context("worker.testnet");
        let first = add(&mut contract, "2026-11-12", &"a".repeat(64), 1);
        assert_eq!(first, add(&mut contract, "2026-11-12", &"a".repeat(64), 1));
        let extended = add(&mut contract, "2026-11-12", &"b".repeat(64), 2);
        assert_eq!(extended.revision, 2);
    }
    #[test]
    #[should_panic(expected = "New anchors must increase entry count")]
    fn same_count_cannot_rewrite_a_day() {
        let mut contract = setup(2);
        context("worker.testnet");
        add(&mut contract, "2026-11-12", &"a".repeat(64), 1);
        add(&mut contract, "2026-11-12", &"b".repeat(64), 1);
    }
    #[test]
    #[should_panic(expected = "Worker day capacity reached")]
    fn day_capacity_limits_new_days() {
        let mut contract = setup(1);
        context("worker.testnet");
        add(&mut contract, "2026-11-12", &"a".repeat(64), 1);
        add(&mut contract, "2026-11-13", &"b".repeat(64), 1);
    }
    #[test]
    fn calendar_validation_rejects_normalized_invalid_dates() {
        for day in [
            "2026-02-29",
            "2026-02-30",
            "2026-13-01",
            "2026-01-00",
            "not-a-date",
            "٢٠٢٦-01-01",
        ] {
            assert!(!valid_day(day));
        }
        for day in ["2024-02-29", "2026-11-12", "2000-02-29"] {
            assert!(valid_day(day));
        }
    }
    #[test]
    #[should_panic(expected = "Wrong anchor network")]
    fn signed_call_cannot_cross_networks() {
        let mut contract = setup(2);
        context("worker.testnet");
        contract.anchor(
            2,
            "mainnet".into(),
            account("worker.testnet"),
            "2026-11-12".into(),
            "a".repeat(64),
            1,
        );
    }
    #[test]
    #[should_panic(expected = "Worker capacity reached")]
    fn registration_capacity_limits_sponsored_accounts() {
        let mut contract = setup(2);
        contract.register_worker(account("second.testnet"));
        contract.register_worker(account("third.testnet"));
    }
    #[test]
    #[should_panic(expected = "Invalid entry count")]
    fn raw_contract_call_cannot_exceed_entry_limit() {
        let mut contract = setup(2);
        context("worker.testnet");
        add(&mut contract, "2026-11-12", &"a".repeat(64), 10_001);
    }
    #[test]
    fn repeated_registration_does_not_consume_capacity() {
        let mut contract = setup(2);
        assert!(!contract.register_worker(account("worker.testnet")));
        assert!(contract.register_worker(account("second.testnet")));
    }
}
