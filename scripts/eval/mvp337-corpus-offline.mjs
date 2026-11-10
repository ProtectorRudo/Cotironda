/** MVP337: machine-readable offline contract report, not an AI benchmark. */
import {presupuestosMvp337} from '../../tests/fixtures/mvp337-presupuestos-heterogeneos.mjs';
import {
 planificarEvidenciaMvp337,corroborarLecturasMvp337
} from '../../src/domain/ia-central/ingesta-evidencia-flexible-mvp337.ts';
const formats=new Set(),all=new Set();
let rows=0,lots=0,ready=0,failed=0,long=0,withoutTotals=0;
for(const example of presupuestosMvp337){
 if(all.has(example.id))throw Error('duplicate_fixture_id');
 all.add(example.id);formats.add(example.format);
 const plan=planificarEvidenciaMvp337({
  format:example.format,sourceSha256:example.sha256,rows:example.rows
 });
 const audit=corroborarLecturasMvp337(plan,example.reading,example.reading);
 if(plan.state!=='planned'||audit.state!=='ready_for_independent_source_audit'||
    audit.agreed!==example.expectedRows||audit.economicPublicationAllowed||
    plan.economicPublicationAllowed)failed++;
 else ready++;
 rows+=example.rows.length;lots+=plan.lots.length;
 if(example.rows.length>25)long++;
 if(!example.hasDeclaredTotal)withoutTotals++;
}
const report=Object.freeze({
 version:'mvp337',environment:'offline_synthetic_only',
 sources:presupuestosMvp337.length,
 formats:[...formats].sort(),formats_count:formats.size,
 rows_observed:rows,batches:lots,examples_over_25_rows:long,
 examples_without_declared_total:withoutTotals,
 evidence_gate_pass:ready,evidence_gate_fail:failed,
 ai_readings_executed:0,real_pdfs_read:0,real_photographs_read:0,
 real_excel_read:0,whatsapp_messages_sent:0,
 economic_offers_published:0,production_ready:false,
 note:'All model outputs are controlled synthetic fixtures, not inferred readings.'
});
if(all.size!==192||formats.size!==12||failed!==0||rows<1000||
   long<12||withoutTotals<48)throw Error('mvp337_offline_corpus_gate_failed');
console.log(JSON.stringify(report,null,2));
