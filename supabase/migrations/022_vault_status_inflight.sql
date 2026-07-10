-- Migration 022: in-flight vault_status states
--
-- Adds 'depositing' and 'withdrawing' to the vault_status enum so vault-deposit and
-- vault-withdraw can atomically claim a pod_escrows row (guarded UPDATE ... WHERE
-- vault_status = <expected precondition> ...) before submitting any on-chain
-- transaction. This prevents a concurrent or duplicate/retried invocation from also
-- passing the precondition check and submitting its own on-chain transaction.
--
-- A row left at 'depositing' or 'withdrawing' after a function invocation means either:
--   (a) a genuine concurrent call is still in flight, or
--   (b) a previous invocation's on-chain transaction succeeded (or, for SIMULATED
--       pods, its computation completed) but the follow-up DB write failed — the
--       function's response in that case has reconciliationNeeded: true and logs
--       the details needed to fix it.
-- Either way, a stuck row requires a human to confirm on-chain state before manually
-- resetting vault_status (back to 'none'/'deposited' to allow retry, or forward to
-- 'deposited'/'withdrawn' to reflect a deposit/withdrawal that actually completed).

alter type vault_status add value if not exists 'depositing';
alter type vault_status add value if not exists 'withdrawing';
