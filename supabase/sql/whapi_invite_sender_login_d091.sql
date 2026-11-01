-- MVP-061 / D091: narrow dedicated LOGIN for invitation SEND gateway.
-- Never install in historical DEV before #175 recovery. PASSWORD NULL.
-- D070/Gateway and D068 packet were previously separate. Only these SIX
-- RPCs are needed by D070 sender. Does NOT grant prepare/sweep/reconcile.
create role cotironda_invite_sender_gateway_d091
 nologin noinherit nosuperuser nobypassrls;
create role cotironda_invite_sender_login_d091
 login noinherit nosuperuser nocreatedb nocreaterole
 noreplication nobypassrls connection limit 2 password null;
grant usage on schema cotironda_private to
 cotironda_invite_sender_gateway_d091;
grant execute on function
 cotironda_private.whapi_claim_invite_d070(),
 cotironda_private.whapi_fail_preflight_invite_d070(uuid,uuid),
 cotironda_private.whapi_begin_invite_d070(uuid,uuid),
 cotironda_private.whapi_authorize_invite_d070(uuid,text,text),
 cotironda_private.whapi_finish_invite_d070(uuid,uuid,text,text),
 cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)
to cotironda_invite_sender_gateway_d091;
grant cotironda_invite_sender_gateway_d091
 to cotironda_invite_sender_login_d091
 with admin false,inherit false,set true;
alter role cotironda_invite_sender_login_d091 set statement_timeout='8s';
alter role cotironda_invite_sender_login_d091 set lock_timeout='2s';
alter role cotironda_invite_sender_login_d091 set idle_in_transaction_session_timeout='8s';
comment on role cotironda_invite_sender_login_d091 is
 'MVP061: dedicated Whapi invitation sender (autocommit SQL), no password or table privileges until private provisioning';
