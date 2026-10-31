# 88 — D025 / Etapa 03: consulta autenticada del comprador (solo lectura)

**30/10/2026 · Issue #149 · rama `feat/03-buyer-round-readonly` apilada sobre #148.**

## Entrega y límite exacto
La primera conexión web de rondas está preparada como `GET /api/rondas/[rondaId]`. Se utiliza `@supabase/ssr` existente, `auth.getUser()` y RPC `public.buyer_round_overview_v1(p_round_id)`; **no usa service_role ni URL PostgreSQL**, ni acepta `user_id`, `organization_id`, `role` o `supplier_id` como parámetros de autorización.

La consulta está **deshabilitada por defecto**: requiere bandera server-only `COTIRONDA_ROUNDS_READ_ENABLED=true`, `VERCEL_ENV=preview`, proyecto exacto DEV, clave publishable, registro público apagado y la autorización Auth previa de `entornoAuthConfigurado`. Por el diseño actual de Auth preview (ramas permitidas específicas), no basta con activar la bandera para que funcione en un despliegue cualquiera. **No habilitarla ni desplegarla en esta entrega.**

## Control SQL
`supabase/sql/round_buyer_overview_d025.sql` (solo CI, **no migración oficial ni instalado en DEV**) declara rol `cotironda_rounds_reader` NOLOGIN/NOBYPASSRLS, con SELECT únicamente sobre organizaciones, miembros, rondas e ítems. No recibe grants de invitaciones, borradores, eventos, ofertas, contactos, Storage o Auth.

- RLS de defensa en profundidad restringe miembros activos y rondas a su empresa compradora.
- Función privada `buyer_round_overview_v1` SECURITY DEFINER **propiedad del rol limitado**, con `search_path=''`. Verifica claims de PostgREST de rol, sub, session_id, correo verificado y no anonimato. Además exige que `cotironda_private.is_session_verified` confirme **ahora** que la sesión existe, corresponde al usuario y no fue revocada.
- Verifica en tablas actuales `organization_members.status='active'` y `organizations.organization_type in ('buyer','both')`. Si la ronda no existe o es de otra empresa no retorna filas en ambos casos.
- Wrapper público `public.buyer_round_overview_v1` SECURITY INVOKER con EXECUTE solo authenticated, sin SELECT directo a tablas privadas.
- Proyección cerrada: UUID, `programada/abierta/cerrada/cancelada`, inicio, fin e ítems con `line_no,product_code,quantity,unit`. **No hay supplier_org_id, alias, número de proveedores, precio, oferta, hash, contacto ni documento.**

El SQL depende de D024, de las doce migraciones de identidad y de Auth Hook `cotironda_email_verified`. No está listo para una instancia sin el hook habilitado. Si falta, **se rechaza** la lectura.

## HTTP, protección de datos y pruebas
- `src/server/rondas-lectura-http.ts` valida método GET, UUID v4, actor SSR verificado y respuesta con **claves exactas**; falla cerrado ante cualquier columna extra o payload anómalo, nunca filtra mensajes SQL.
- Respuestas con `Cache-Control: private, no-store`, `Vary: Cookie, Authorization` y `nosniff`. Si no existe/otra empresa: mismo 404. Si Supabase falla: 503.
- `apps/portal/lib/rondas-read-rpc.ts` permite una única RPC sin parámetros de identidad. `apps/portal/app/api/rondas/[rondaId]/route.ts` usa SSR y el mismo cliente por solicitud.
- `tests/unit/rondas-lectura-http.test.mjs` verifica función deshabilitada, sesión ausente/revocación en puerto SQL, falsa empresa, inyección de PII, exceso de campos, cachés y formato RPC.
- `supabase/tests/ci/100_round_buyer_overview.sql` simula dos empresas y un JWT en PostgreSQL 17 efímero, verifica propia/cross-tenant/suspendida/revocada. Se ejecuta después de D024 como paso CI **sin crear una migración trece** ni alterar el historial de 12. Todos los datos sintéticos se revierten.

## Qué NO está terminado
No hay autenticación de escrituras, endpoint de proveedor, creación de ronda, recepción de precio, equivalencias validadas por servidor, confirmación por transacción, rankings disponibles comercialmente ni Whapi. El SQL y endpoint no están instalados ni desplegados y no se habilitaron banderas. Para integración DEV se necesita reconciliar las migraciones históricas, el estado real de Auth Hook y las políticas de exposición, y probar el flujo completo en entorno aislado.

**Fase posterior D026**: puerta de escritura server-only con versionado e idempotencia bajo PostgreSQL y permisos por empresa; sin permitir precio ni equivalencia inventados.
