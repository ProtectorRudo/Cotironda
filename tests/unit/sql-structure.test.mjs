import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../../supabase/schema.sql', import.meta.url),'utf8');
test('todas las tablas expuestas llevan RLS',()=>{
  for(const table of ['organizations','organization_members','catalog_categories','supplier_profiles','supplier_categories','supplier_products','supplier_delivery_areas']){
    assert.ok(sql.includes('alter table public.'+table+' enable row level security;'),table);
  }
});
test('contactos WhatsApp en esquema no expuesto',()=>{
  assert.match(sql,/create table cotironda_private\.supplier_contacts/);
  assert.match(sql,/revoke all on schema cotironda_private from public, anon, authenticated/);
});
test('no hay concesion de crear miembros a usuario autenticado',()=>{
  assert.doesNotMatch(sql,/grant\s+(insert|all)\s+on\s+public\.organization_members\s+to\s+authenticated/i);
});
test('no se crea funcion con elevacion de privilegios',()=>{
  assert.doesNotMatch(sql,/security definer/i);
});
test('politicas de escritura exigen rol de gerente',()=>{
  assert.match(sql,/create policy supplier_products_update_manager/);
  assert.match(sql,/membership_role in \('owner','manager'\)/);
});
