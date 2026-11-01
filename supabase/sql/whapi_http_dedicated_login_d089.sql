-- MVP-057 / D089 — WhatsApp HTTPS dedicated technical LOGIN.
-- PostgreSQL 17 CI ONLY. Do not install on Supabase DEV pending #175.
-- Password NULL means CANNOT authenticate until a private operator sets it,
-- through the DB provider, outside GitHub/ChatGPT.
create role cotironda_whapi_http_login_d085
 login noinherit nosuperuser nocreatedb nocreaterole
 noreplication nobypassrls connection limit 3 password null;
grant cotironda_whapi_http_gateway_d084 to cotironda_whapi_http_login_d085
 with admin false,inherit false,set true;
alter role cotironda_whapi_http_login_d085 set statement_timeout='8s';
alter role cotironda_whapi_http_login_d085 set lock_timeout='2s';
alter role cotironda_whapi_http_login_d085 set idle_in_transaction_session_timeout='8s';
comment on role cotironda_whapi_http_login_d085 is
 'MVP057 CI only: dedicated HTTP LOGIN, no password, no table/role inheritance; sets D084 gateway in a reserved TLS session.';
