//! Prevent native file/domain operations from overlapping profile replacement.
//! Guards are Send and may span async transport; contention fails, never waits.
use std::sync::atomic::{AtomicUsize, Ordering};

static ACTIVE: AtomicUsize = AtomicUsize::new(0);
const EXCLUSIVE: usize = usize::MAX;
pub struct Operation;
pub struct Lifecycle;

pub fn operation() -> Result<Operation, String> {
    ACTIVE
        .fetch_update(Ordering::AcqRel, Ordering::Acquire, |value| {
            if value >= EXCLUSIVE - 1 {
                None
            } else {
                Some(value + 1)
            }
        })
        .map(|_| Operation)
        .map_err(|_| "Profile maintenance is in progress; no operation started.".to_string())
}

pub fn lifecycle() -> Result<Lifecycle, String> {
    ACTIVE
        .compare_exchange(0, EXCLUSIVE, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| Lifecycle)
        .map_err(|_| {
            "Finish current Records/file operations before profile maintenance.".to_string()
        })
}

impl Drop for Operation {
    fn drop(&mut self) {
        ACTIVE.fetch_sub(1, Ordering::Release);
    }
}
impl Drop for Lifecycle {
    fn drop(&mut self) {
        ACTIVE.store(0, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_gate_excludes_mutations_and_maintenance() {
        let _lock = crate::first_run::test_env_lock().lock().unwrap();
        let active_operation = operation().unwrap();
        assert!(lifecycle().is_err());
        drop(active_operation);
        let maintenance = lifecycle().unwrap();
        assert!(operation().is_err());
        assert!(lifecycle().is_err());
        drop(maintenance);
        assert!(operation().is_ok());
    }
}
