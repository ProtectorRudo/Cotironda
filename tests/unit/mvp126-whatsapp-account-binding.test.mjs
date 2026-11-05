import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp126_web_link_and_role_dashboard.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp126_role_dashboard_smoke_rollback.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');

test('MVP126: private account and challenge tables are RLS guarded and exclude anon access',()=>{
 for(const table of ['web_link_challenges_mvp126','web_account_links_mvp126']){
  assert.match(sql,new RegExp('alter table cotironda_piloto_privado\\.'+table+' enable row level security','u'));
  assert.match(sql,new RegExp('revoke all on table cotironda_piloto_privado\\.'+table,'u'));
 }
 assert.match(sql,/create unique index if not exists web_link_active_participant_mvp126/u);
 assert.match(sql,/create unique index if not exists web_link_active_user_mvp126/u);
 assert.match(sql,/where revoked_at is null/u);
 assert.doesNotMatch(sql,/grant (?:select|insert|update|delete) on table .* to (?:anon|authenticated)/iu);
});

test('MVP126: code is cryptographically generated, stored hashed, short lived, rate limited and consumed once',()=>{
 assert.match(sql,/extensions\.gen_random_bytes\(12\)/u);
 assert.match(sql,/encode\(extensions\.digest\(code,'sha256'\),'hex'\)/u);
 assert.match(sql,/expires_at <= issued_at \+ interval '10 minutes'/u);
 assert.match(sql,/interval '2 minutes'/u);
 assert.match(sql,/n>=8/u);
 assert.match(sql,/for update of wc/u);
 assert.match(sql,/wc\.consumed_at is null/u);
 assert.match(sql,/wc\.issued_at<received/u);
 assert.match(sql,/wc\.expires_at>clock_timestamp\(\)/u);
 assert.match(sql,/proof_message_hmac text not null unique/u);
 assert.match(sql,/on conflict do nothing returning id into link_id/u);
 assert.match(sql,/revoke all on function public\.cotironda_piloto_complete_web_link_mvp126\(/u);
 assert.match(sql,/to service_role;/u);
});

test('MVP126: both login and WhatsApp link require live verified non-banned Auth session',()=>{
 assert.match(sql,/uid:=auth\.uid\(\)/u);
 assert.match(sql,/claims:=auth\.jwt\(\)/u);
 assert.match(sql,/s\.id=sid::uuid and s\.user_id=uid/u);
 assert.match(sql,/s\.not_after is null or s\.not_after>clock_timestamp\(\)/u);
 assert.match(sql,/u\.deleted_at is null and not u\.is_anonymous/u);
 assert.match(sql,/u\.banned_until is null or u\.banned_until<clock_timestamp\(\)/u);
 assert.match(sql,/u\.email_confirmed_at is not null or u\.phone_confirmed_at is not null/u);
 assert.match(sql,/auth\.sessions s/u);
});

test('MVP126: browser dashboard separates buyer rounds and supplier invitation/own quotes',()=>{
 assert.match(sql,/where r\.buyer_key=bound\.participant_key/u);
 assert.match(sql,/where i\.supplier_key=bound\.participant_key/u);
 assert.match(sql,/ov\.supplier_key=bound\.participant_key/u);
 assert.match(sql,/quotes_received_unverified/u);
 assert.match(sql,/my_quote_versions/u);
 assert.match(sql,/limit 50/u);
 assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'original_quote'/u);
 assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'chat_hmac'/u);
 assert.doesNotMatch(sql,/grant execute on function public\.cotironda_piloto_my_rounds_mvp126\(\)\s*to (?:anon|public);/iu);
});

test('MVP126: signed Whapi source identity is checked against stored inbox and opted-in participant',()=>{
 assert.match(sql,/part\.chat_hmac=p_chat_hmac/u);
 assert.match(sql,/part\.consent_at is not null and part\.opted_out_at is null/u);
 assert.match(sql,/i\.message_hmac=p_message_hmac and i\.chat_hmac=p_chat_hmac/u);
 assert.match(sql,/i\.participant_key=p\.key and i\.kind='text'/u);
 assert.match(sql,/i\.plaintext_sha256=encode\(extensions\.digest\('VINCULAR '\|\|normalized,'sha256'\),'hex'\)/u);
 assert.match(sql,/i\.received_at>clock_timestamp\(\)-interval '10 minutes'/u);
 assert.match(sql,/wc\.desired_role=p\.participant_role/u);
 assert.match(edge,/const webLinkCode=row\.type==='text'/u);
 assert.match(edge,/\^VINCULAR \(\[A-F0-9\]\{24\}\)\$/u);
 assert.match(edge,/row\.type==='text'&&!webLinkCode/u);
 assert.match(edge,/cotironda_piloto_complete_web_link_mvp126/u);
 assert.match(edge,/p_message_hmac:messageHash,p_code:webLinkCode/u);
 assert.match(edge,/if\(webLinkCode\)\{/u);
 assert.match(edge,/if\(webLinkCode\)\{[\s\S]{0,1500}?continue;\s*\}/u);
 assert.match(edge,/if\(outcome\(out\.data\)==='quote_recorded'\)/u);
});

test('MVP126: rollback-only smoke covers two roles, invalid code, wrong chat and logout',()=>{
 assert.match(smoke,/mvp126_wrong_code_linked/u);
 assert.match(smoke,/mvp126_replay_linked/u);
 assert.match(smoke,/mvp126_wrong_chat_attached/u);
 assert.match(smoke,/mvp126_buyer_round_listing_missing/u);
 assert.match(smoke,/mvp126_supplier_dashboard_failed/u);
 assert.match(smoke,/mvp126_supplier_competitor_count_leaked/u);
 assert.match(smoke,/mvp126_logout_not_enforced/u);
 assert.doesNotMatch(smoke,/\bcommit\s*;/iu);
});
