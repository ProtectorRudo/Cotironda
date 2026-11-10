import test from 'node:test';
import assert from 'node:assert/strict';
import {inspeccionarWebhookMvp332} from '../../scripts/piloto/mvp332-whapi-bundle-readonly.mjs';
import {prepararMvp336Overlay} from '../../scripts/piloto/mvp336-whapi-overlay-candidate.mjs';

test('MVP336: manifest MVP332 permanece intacto y overlay agrega 1 módulo sin deploy',()=>{
 const old=inspeccionarWebhookMvp332();
 assert.equal(old.candidate_files,61);
 const result=prepararMvp336Overlay();
 assert.equal(result.file_count,62);
 assert.equal(result.original_manifest_preserved,true);
 assert.equal(result.outbound_whatsapp_messages,0);
 assert.equal(result.db_mutated,false);
 assert.equal(result.production_published,false);
 assert.match(result.source,/import \{correlacionAutomaticaMvp291\} from '\.\/supplier-auto-correlation-mvp336\.ts';/u);
 assert.doesNotMatch(result.source,/from '\.\/supplier-auto-correlation-mvp291\.ts';/u);
 assert.equal(inspeccionarWebhookMvp332().candidate_files,61);
});
test('MVP336: source index alterado no puede saltar huella pinned del webhook',()=>{
 assert.throws(()=>prepararMvp336Overlay({source:'not a source'}),
  /mvp333_|mvp335_|mvp336_/u);
});
