//! Sealed Paper: time-locked seals on NEAR.
//!
//! The contract stores only hashes and commitments: the encrypted file's SHA-256, the
//! SHA-256 of each Shamir key part, holder accounts, the unlock time and an access log.
//! Policy refusals (early release, non-holder, duplicate, wrong commitment, early open)
//! do not panic: they return a status and are written to the log, so the refusal itself
//! becomes a permanent on-chain record.
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{AccountId, PanicOnDefault, env, json_types::U64, near};

const MAX_LOG_PER_SEAL: u32 = 300;
const MAX_HOLDERS: u8 = 20;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Seal {
    pub seal_id: String,
    pub owner: String,
    pub file_hash: String,
    pub unlock_at_ms: U64,
    pub mode: String,
    pub holders: Vec<AccountId>,
    pub commitments: Vec<String>,
    pub threshold_k: u8,
    pub total_n: u8,
    pub released: Vec<AccountId>,
    pub created_at_ms: U64,
    pub log_count: u32,
    pub dropped_logs: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct LogEntry {
    pub index: u32,
    pub at_ms: U64,
    pub kind: String,
    pub account: AccountId,
    pub detail: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SealedPaper {
    owner: AccountId,
    operators: IterableSet<AccountId>,
    seals: LookupMap<String, Seal>,
    logs: LookupMap<String, LogEntry>,
    seal_count: u32,
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn valid_seal_id(value: &str) -> bool {
    (6..=64).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[near]
impl SealedPaper {
    #[init]
    #[private]
    pub fn new(owner: AccountId, operators: Vec<AccountId>) -> Self {
        let mut set = IterableSet::new(b"o");
        for operator in operators {
            set.insert(operator);
        }
        Self { owner, operators: set, seals: LookupMap::new(b"s"), logs: LookupMap::new(b"l"), seal_count: 0 }
    }

    pub fn add_operator(&mut self, operator: AccountId) -> bool {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only owner may add operators");
        self.operators.insert(operator)
    }

    pub fn remove_operator(&mut self, operator: AccountId) -> bool {
        assert_eq!(env::predecessor_account_id(), self.owner, "Only owner may remove operators");
        self.operators.remove(&operator)
    }

    /// Create a seal. Only operators (the release service) may create seals, because the
    /// contract account pays for storage. `owner` is a label for the person who sealed it.
    #[allow(clippy::too_many_arguments)]
    pub fn create_seal(
        &mut self,
        seal_id: String,
        file_hash: String,
        unlock_at_ms: U64,
        mode: String,
        holders: Vec<AccountId>,
        commitments: Vec<String>,
        threshold_k: u8,
        total_n: u8,
        owner: String,
    ) -> Seal {
        let caller = env::predecessor_account_id();
        assert!(self.operators.contains(&caller), "Only operators may create seals");
        assert!(valid_seal_id(&seal_id), "Invalid seal id");
        assert!(!self.seals.contains_key(&seal_id), "Seal id already exists");
        assert!(is_hex64(&file_hash), "file_hash must be lowercase SHA-256 hex");
        assert!(owner.len() <= 128, "Owner label too long");
        let now = env::block_timestamp_ms();
        assert!(unlock_at_ms.0 > now, "Unlock time must be in the future");
        match mode.as_str() {
            "single" => {
                assert!(holders.is_empty() && commitments.is_empty(), "Single mode has no holders");
                assert!(threshold_k == 0 && total_n == 0, "Single mode uses K = N = 0");
            }
            "split" => {
                assert!((2..=MAX_HOLDERS).contains(&total_n), "N must be between 2 and 20");
                assert!(threshold_k >= 1 && threshold_k <= total_n, "K must be between 1 and N");
                assert_eq!(holders.len(), total_n as usize, "Need exactly N holders");
                assert_eq!(commitments.len(), total_n as usize, "Need one commitment per holder");
                for (i, holder) in holders.iter().enumerate() {
                    assert!(!holders[..i].contains(holder), "Holders must be unique");
                }
                assert!(commitments.iter().all(|c| is_hex64(c)), "Commitments must be SHA-256 hex");
            }
            _ => env::panic_str("Mode must be single or split"),
        }
        let seal = Seal {
            seal_id: seal_id.clone(), owner, file_hash, unlock_at_ms, mode, holders, commitments, threshold_k, total_n,
            released: vec![], created_at_ms: U64(now), log_count: 0, dropped_logs: 0,
        };
        self.seals.insert(seal_id.clone(), seal);
        self.seal_count += 1;
        self.log(&seal_id, "create", caller, String::new());
        self.seals.get(&seal_id).unwrap().clone()
    }

    /// A holder releases their key part by committing to it. Returns a status; refusals are logged.
    pub fn release_part(&mut self, seal_id: String, part_commitment: String) -> String {
        let caller = env::predecessor_account_id();
        let seal = self.seals.get(&seal_id).expect("Unknown seal").clone();
        let now = env::block_timestamp_ms();
        let status = if seal.mode != "split" {
            "single_mode"
        } else if now < seal.unlock_at_ms.0 {
            "early"
        } else if let Some(i) = seal.holders.iter().position(|h| *h == caller) {
            if seal.released.contains(&caller) {
                "already_released"
            } else if seal.commitments[i] != part_commitment {
                "bad_commitment"
            } else {
                "released"
            }
        } else {
            "not_holder"
        };
        if status == "released" {
            let mut updated = seal;
            updated.released.push(caller.clone());
            self.seals.insert(seal_id.clone(), updated);
        }
        let detail = if is_hex64(&part_commitment) { part_commitment } else { String::from("invalid") };
        self.log(&seal_id, &format!("release:{status}"), caller, detail);
        status.to_string()
    }

    /// Ask to open. Single mode opens by time alone; split mode also needs K released parts.
    pub fn request_open(&mut self, seal_id: String) -> String {
        let caller = env::predecessor_account_id();
        let seal = self.seals.get(&seal_id).expect("Unknown seal").clone();
        let status = if env::block_timestamp_ms() < seal.unlock_at_ms.0 {
            "early"
        } else if seal.mode == "split" && (seal.released.len() as u8) < seal.threshold_k {
            "awaiting_parts"
        } else {
            "open"
        };
        self.log(&seal_id, &format!("open:{status}"), caller, String::new());
        status.to_string()
    }

    /// Operators record the SHA-256 of an off-chain alert record (location stays off-chain).
    pub fn record_alert(&mut self, seal_id: String, alert_hash: String, kind: String) -> u32 {
        let caller = env::predecessor_account_id();
        assert!(self.operators.contains(&caller), "Only operators may record alerts");
        assert!(self.seals.contains_key(&seal_id), "Unknown seal");
        assert!(is_hex64(&alert_hash), "alert_hash must be SHA-256 hex");
        assert!(!kind.is_empty() && kind.len() <= 40 && kind.bytes().all(|b| b.is_ascii_lowercase() || b == b'_'), "Invalid alert kind");
        self.log(&seal_id, &format!("alert:{kind}"), caller, alert_hash)
    }

    pub fn get_seal(&self, seal_id: String) -> Option<Seal> {
        self.seals.get(&seal_id).cloned()
    }

    pub fn get_log(&self, seal_id: String, from: u32, limit: u32) -> Vec<LogEntry> {
        let Some(seal) = self.seals.get(&seal_id) else { return vec![] };
        let end = seal.log_count.min(from.saturating_add(limit.min(100)));
        (from..end).filter_map(|i| self.logs.get(&format!("{seal_id}:{i}")).cloned()).collect()
    }

    pub fn is_unlocked(&self, seal_id: String) -> bool {
        let Some(seal) = self.seals.get(&seal_id) else { return false };
        env::block_timestamp_ms() >= seal.unlock_at_ms.0
            && (seal.mode == "single" || seal.released.len() as u8 >= seal.threshold_k)
    }

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({ "app": "sealed-paper", "version": 1, "owner": self.owner,
            "operators": self.operators.iter().collect::<Vec<_>>(), "seal_count": self.seal_count,
            "max_log_per_seal": MAX_LOG_PER_SEAL })
    }

    fn log(&mut self, seal_id: &str, kind: &str, account: AccountId, detail: String) -> u32 {
        let mut seal = self.seals.get(seal_id).unwrap().clone();
        let index = seal.log_count;
        let at_ms = env::block_timestamp_ms();
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"sealed-paper\",\"version\":\"1.0.0\",\"event\":\"{kind}\",\"data\":{{\"seal_id\":\"{seal_id}\",\"account\":\"{account}\",\"index\":{index},\"at_ms\":{at_ms}}}}}"
        ));
        if index >= MAX_LOG_PER_SEAL {
            seal.dropped_logs += 1;
        } else {
            self.logs.insert(format!("{seal_id}:{index}"), LogEntry { index, at_ms: U64(at_ms), kind: kind.to_string(), account, detail });
            seal.log_count += 1;
        }
        self.seals.insert(seal_id.to_string(), seal);
        index
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env};

    const H: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    fn acc(v: &str) -> AccountId { v.parse().unwrap() }
    fn hex(n: u8) -> String { format!("{:02x}", n).repeat(32) }
    fn at(caller: &str, ms: u64) {
        testing_env!(VMContextBuilder::new().current_account_id(acc("sealed.testnet")).predecessor_account_id(acc(caller))
            .block_timestamp(ms * 1_000_000).build());
    }
    fn setup() -> SealedPaper {
        at("sealed.testnet", 1_000);
        SealedPaper::new(acc("owner.testnet"), vec![acc("ops.testnet")])
    }
    fn split(c: &mut SealedPaper, k: u8, n: u8) {
        at("ops.testnet", 1_000);
        let holders = (0..n).map(|i| acc(&format!("h{i}.testnet"))).collect();
        let commitments = (0..n).map(hex).collect();
        c.create_seal("exam-paper-1".into(), H.into(), U64(10_000), "split".into(), holders, commitments, k, n, "controller".into());
    }

    #[test]
    fn early_release_refused_and_logged() {
        let mut c = setup(); split(&mut c, 3, 5);
        at("h0.testnet", 9_999);
        assert_eq!(c.release_part("exam-paper-1".into(), hex(0)), "early");
        assert!(c.get_seal("exam-paper-1".into()).unwrap().released.is_empty());
        let log = c.get_log("exam-paper-1".into(), 0, 10);
        assert_eq!(log.len(), 2); assert_eq!(log[1].kind, "release:early"); assert_eq!(log[1].account, acc("h0.testnet"));
        assert!(!c.is_unlocked("exam-paper-1".into()));
    }

    #[test]
    fn non_holder_wrong_commitment_and_duplicate_refused() {
        let mut c = setup(); split(&mut c, 2, 3);
        at("mallory.testnet", 10_000);
        assert_eq!(c.release_part("exam-paper-1".into(), hex(0)), "not_holder");
        at("h1.testnet", 10_000);
        assert_eq!(c.release_part("exam-paper-1".into(), hex(0)), "bad_commitment");
        assert_eq!(c.release_part("exam-paper-1".into(), hex(1)), "released");
        assert_eq!(c.release_part("exam-paper-1".into(), hex(1)), "already_released");
        let kinds: Vec<String> = c.get_log("exam-paper-1".into(), 0, 10).into_iter().map(|e| e.kind).collect();
        assert_eq!(kinds, ["create", "release:not_holder", "release:bad_commitment", "release:released", "release:already_released"]);
    }

    #[test]
    fn unlocks_after_time_and_k_parts() {
        let mut c = setup(); split(&mut c, 3, 5);
        for i in [0u8, 2] {
            at(&format!("h{i}.testnet"), 10_000);
            assert_eq!(c.release_part("exam-paper-1".into(), hex(i)), "released");
        }
        assert!(!c.is_unlocked("exam-paper-1".into()));
        assert_eq!(c.request_open("exam-paper-1".into()), "awaiting_parts");
        at("h4.testnet", 10_001);
        assert_eq!(c.release_part("exam-paper-1".into(), hex(4)), "released");
        assert!(c.is_unlocked("exam-paper-1".into()));
        assert_eq!(c.request_open("exam-paper-1".into()), "open");
    }

    #[test]
    fn single_mode_opens_by_time_only() {
        let mut c = setup();
        at("ops.testnet", 1_000);
        c.create_seal("capsule-01".into(), H.into(), U64(5_000), "single".into(), vec![], vec![], 0, 0, "me".into());
        at("anyone.testnet", 4_999);
        assert_eq!(c.request_open("capsule-01".into()), "early");
        assert!(!c.is_unlocked("capsule-01".into()));
        assert_eq!(c.release_part("capsule-01".into(), hex(0)), "single_mode");
        at("anyone.testnet", 5_000);
        assert!(c.is_unlocked("capsule-01".into()));
        assert_eq!(c.request_open("capsule-01".into()), "open");
    }

    #[test]
    fn alerts_are_operator_only_and_logged() {
        let mut c = setup(); split(&mut c, 2, 2);
        at("ops.testnet", 2_000);
        assert_eq!(c.record_alert("exam-paper-1".into(), hex(9), "early_open".into()), 1);
        let entry = &c.get_log("exam-paper-1".into(), 1, 1)[0];
        assert_eq!(entry.kind, "alert:early_open"); assert_eq!(entry.detail, hex(9));
    }

    #[test]
    #[should_panic(expected = "Only operators may record alerts")]
    fn non_operator_cannot_record_alert() {
        let mut c = setup(); split(&mut c, 2, 2);
        at("h0.testnet", 2_000);
        c.record_alert("exam-paper-1".into(), hex(9), "early_open".into());
    }

    #[test]
    #[should_panic(expected = "Only operators may create seals")]
    fn non_operator_cannot_create() {
        let mut c = setup();
        at("random.testnet", 1_000);
        c.create_seal("capsule-01".into(), H.into(), U64(5_000), "single".into(), vec![], vec![], 0, 0, "me".into());
    }

    #[test]
    #[should_panic(expected = "K must be between 1 and N")]
    fn rejects_bad_threshold() {
        let mut c = setup();
        at("ops.testnet", 1_000);
        c.create_seal("exam-paper-2".into(), H.into(), U64(5_000), "split".into(), vec![acc("a.testnet"), acc("b.testnet")], vec![hex(1), hex(2)], 3, 2, "x".into());
    }

    #[test]
    #[should_panic(expected = "Unlock time must be in the future")]
    fn rejects_past_unlock() {
        let mut c = setup();
        at("ops.testnet", 9_000);
        c.create_seal("capsule-02".into(), H.into(), U64(5_000), "single".into(), vec![], vec![], 0, 0, "x".into());
    }

    #[test]
    fn log_is_capped_but_calls_still_answer() {
        let mut c = setup(); split(&mut c, 2, 2);
        for _ in 0..(MAX_LOG_PER_SEAL + 5) {
            at("mallory.testnet", 2_000); // each call is its own transaction on-chain
            assert_eq!(c.request_open("exam-paper-1".into()), "early");
        }
        let seal = c.get_seal("exam-paper-1".into()).unwrap();
        assert_eq!(seal.log_count, MAX_LOG_PER_SEAL); assert_eq!(seal.dropped_logs, 6);
        assert_eq!(c.get_log("exam-paper-1".into(), 0, 500).len(), 100, "page size is capped at 100");
    }
}
