# 14 — Auditoría inicial de Etapa 01

**Estado: Etapa 01 en desarrollo; únicamente el sitio preliminar está publicado.**

## Incorporado en rama
- Schema declarativo: organizaciones, miembros, perfiles, categorías, productos, zonas y contactos privados.
- Políticas SQL RLS y privilegios de columna para miembros activos y administradores.
- Filtro conservador por productos confirmados, zona y consentimiento; pruebas unitarias.
- pgTAP estructural sigue preparado para Supabase local; **se ejecutaron pruebas funcionales de SQL/RLS en PostgreSQL 17 efímero** con roles Supabase simulados (ver docs/17).

## Decisiones
- Altas de empresa y miembros desde backend con control explícito (a desarrollar), **nunca** inserción libre desde frontend.
- Contactos y consentimiento de WhatsApp guardados en schema privado.
- Catálogo declarado no es stock garantizado ni equivale a marca técnica exacta.
- Nunca invitar basándose únicamente en rubro; el matching necesita evidencia de producto/condiciones confirmadas.

## Riesgos pendientes
- No existe proyecto Cotironda en Supabase: se probó SQL/RLS en PostgreSQL 17 aislado de GitHub Actions, pero falta repetir con Supabase Auth real y el entorno específico.
- Pruebas de rol anónimo, empresa ajena, suspensión, edición y registro SQL completadas con roles simulados; faltan flujos reales de autenticación y de aplicación.
- No se probó un onboarding web ni una integración de sesión Supabase real.
- Falta normalización técnica robusta, códigos de proveedores y cobertura geográfica.
- GitHub es público: nada de secretos ni datos personales.

## Auditoría estática adicional
Se verificó directamente contra el blob GitHub del esquema corregido: 7 tablas RLS, 17 políticas únicas, acceso restringido a contactos, bloqueo de membresías desde cliente, ausencia de SECURITY DEFINER, privilegios PUBLIC revocados, regex E.164 completa y trigger intacto. **9/9 comprobaciones estáticas**; no equivalen a ejecutar SQL.

Durante revisión se detectó una interpolación accidental de `$` al generar el SQL: se descartó el árbol incorrecto antes del commit y se regeneró el archivo íntegro. Versión corregida auditada con 17 políticas, sin duplicados.

## Verificación Supabase real (29-10-2026)
- Se creó proyecto exclusivo `cotironda-dev` en Supabase región São Paulo, distinto de Viralio/TeHiceEsto.
- Migración inicial `20261029105736` aplicada con éxito.
- 9 tablas, todas con RLS; 5 categorías semilla.
- Se ejecutaron las suites SQL de aislamiento A/B y registro en PostgreSQL **de Supabase real**, sustituyendo el helper de CI por una función temporal. Todas las aserciones pasaron; operaciones con BEGIN/ROLLBACK.
- Tras pruebas: cero empresas, cero membresías, cero registros de alta.
- Advisors de seguridad: sólo observaciones INFO para 2 tablas privadas sin políticas, intencionadamente no expuestas a anon/authenticated; service_role autorizado.
- Performance advisors: índices de claves foráneas opcionales pendientes; índices sin uso por base recién creada.
- **Pendiente**: Supabase Auth de usuarios reales y portal protegido; no activar aplicaciones comerciales sin comprobar E2E.
