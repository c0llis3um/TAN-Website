-- 010_fix_pod_update_grant.sql
-- anon role had INSERT but not UPDATE on pods.
-- updatePodContract() was silently failing after every pod creation.

grant update on pods to anon;
grant update on pods to authenticated;

-- Also fix pod_members — organizer needs to update member status
grant update on pod_members to anon;
grant update on pod_members to authenticated;
