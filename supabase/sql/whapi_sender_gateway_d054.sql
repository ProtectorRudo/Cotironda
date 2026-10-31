-- D054 / Issue #211: least-privilege sender role, PostgreSQL17 CI only.
-- D053 reply_gateway has reconciliation authority; NEVER give that to a
-- sending worker. Only the following operational RPCs are granted.
create role cotironda_reply_sender_d054 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_reply_sender_d054;
grant execute on function
 cotironda_private.whapi_lease_reply_d047(),
 cotironda_private.whapi_finish_reply_d047(uuid,uuid,boolean,text),
 cotironda_private.whapi_begin_send_d053(uuid,uuid),
 cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text)
 to cotironda_reply_sender_d054;
-- Explicitly no permission to reconcile uncertain messages nor read internals.
revoke all on function
 cotironda_private.whapi_sweep_uncertain_d053(),
 cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)
 from cotironda_reply_sender_d054;
