import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp105_live_approved_anonymous_tracking.sql',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp105_smoke_rollback.sql',import.meta.url),'utf8');
const page=readFileSync(new URL(
 '../../site/seguimiento/app.js',
 import.meta.url),'utf8');

test('MVP105: only an approved latest revision may become anonymously visible',()=>{
 for(const keyword of [
 'buyer_tracking_mvp091','t.revoked_at is null','t.expires_at>now_',
 'p.participant_role','p.consent_at is not null','p.opted_out_at is null',
 'anonymous_offers_mvp091','a.revision_no','latest.last_revision',
 'a.public_text','a.supplier_key'
 ])assert.ok(sql.includes(keyword),keyword);
 assert.match(sql,/jsonb_build_object\('label','Presupuesto '\|\|seq,'text',safe.public_text\)/);
 assert.match(sql,/row_number\(\) over\(order by a.supplier_key\)/);
 assert.match(sql,/'state',case when status='closed' and now_>=cutoff/);
 assert.match(sql,/'state','cancelled','received_count',n/);
 assert.match(sql,/'can_open',false,'offers','\[\]'::jsonb/);
 assert.doesNotMatch(sql,/original_quote|return.*supplier_key/i);
});
test('MVP105: page updates approved prices before close without exposing HTML',()=>{
 assert.match(page,/data\.can_open === true && Array\.isArray\(data\.offers\)/);
 assert.match(page,/if \(data\.state === 'waiting'\)/);
 assert.match(page,/card\(offers, offer.label, offer.text\)/);
 assert.match(page,/heading\.textContent = title/);
 assert.match(page,/detail\.textContent = description/);
 assert.doesNotMatch(page,/\binnerHTML\b/);
 assert.match(page,/setInterval\(\(\) =>/);
 assert.match(page,/location.hash.slice\(1\)/);
 assert.match(page,/credentials: 'omit'/);
});
test('MVP105: reversible tests cover live projection and stale rejection',()=>{
 for(const t of ['mvp105_live_anonymized_offer_not_visible',
  'mvp105_wrong_token_access','mvp105_old_revision_leak',
  'mvp105_revoked_token_leak','mvp105_cancelled_round_leak']){
   assert.ok(smoke.includes(t),t);
 }
 assert.match(smoke,/anonymous_offers_mvp091/);
 assert.match(smoke,/revision_no,public_text,approved_by/);
 assert.match(smoke,/rollback;/);
});
