-- 008_pod_failed_status.sql
-- Add FAILED to pod status enum so split-brain rollbacks can be recorded.

alter type pod_status add value if not exists 'FAILED';
