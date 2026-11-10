import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quotedWhapiMessageId} from '../../supabase/functions/cotironda-piloto-whapi/core.ts';

test('MVP151: WhatsApp reply context recognized only from quoted_id',()=>{
 const id='g0jEG0ZsSobn4yNGGU3TAg-gDYOS60TLw';
 assert.equal(quotedWhapiMessageId({context:{quoted_id:id,quoted_type:'document'}}),id);
 assert.equal(quotedWhapiMessageId({context:{quoted_id:'bad'}}),null);
 assert.equal(quotedWhapiMessageId({context:{quoted_id:'<script>attack</script>'}}),null);
 assert.equal(quotedWhapiMessageId({context:{quoted_id:'A'.repeat(161)}}),null);
 assert.equal(quotedWhapiMessageId({context:{quoted_id:id},type:'text'}),id);
 assert.equal(quotedWhapiMessageId({context:'wrong'}),null);
 assert.equal(quotedWhapiMessageId(null),null);
});
test('MVP151: context authenticated by sender allowlist and exact Whapi outbound id',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../../supabase/piloto/mvp151_supplier_quoted_context.sql',import.meta.url),'utf8');
 assert.match(edge,/const quotedId=quotedWhapiMessageId\(row\)/u);
 assert.match(edge,/equalSecret\(expected,chatHash\)/u);
 assert.match(edge,/p_city:supplierQuotedId\|\|centralSupplier\s*\?'__quoted_supplier_reply__':parsed.city/u);
 assert.match(edge,/cotironda_piloto_link_quoted_text_mvp151/u);
 assert.match(edge,/cotironda_piloto_link_quoted_media_mvp151/u);
 assert.match(sql,/if v_count=1 and p_city is distinct from '__quoted_supplier_reply__'/u);
 assert.match(sql,/o\.whapi_message_id=p_quoted_id/u);
 assert.match(sql,/o\.supplier_key=p_supplier/u);
 assert.match(sql,/o\.state='api_accepted'/u);
 assert.match(sql,/m\.plaintext_sha256=encode\(extensions\.digest\(p_plaintext,'sha256'\),'hex'\)/u);
 assert.match(sql,/for update of m,inbox/u);
 assert.match(sql,/set request_id=rid/u);
});
test('MVP151: client roles cannot invoke privileged association RPC',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp151_supplier_quoted_context.sql',import.meta.url),'utf8');
 assert.match(sql,/revoke all on function\s+public\.cotironda_piloto_link_quoted_text_mvp151/u);
 assert.match(sql,/revoke all on function\s+public\.cotironda_piloto_link_quoted_media_mvp151/u);
 assert.match(sql,/from public,anon,authenticated;/u);
 assert.match(sql,/to service_role;/u);
 assert.doesNotMatch(sql,/create trigger|alter table .* disable|drop table/u);
});
