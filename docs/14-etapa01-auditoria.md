# 14 — Auditoría inicial de Etapa 01

**Estado: en desarrollo, sin despliegue.**

## Incorporado en rama
- Schema declarativo: organizaciones, miembros, perfiles, categorías, productos, zonas y contactos privados.
- Políticas SQL RLS y privilegios de columna para miembros activos y administradores.
- Filtro conservador por productos confirmados, zona y consentimiento; pruebas unitarias.
- Pruebas estructurales pgTAP preparadas, pendientes de ejecutar.

## Decisiones
- Altas de empresa y miembros desde backend con control explícito (a desarrollar), **nunca** inserción libre desde frontend.
- Contactos y consentimiento de WhatsApp guardados en schema privado.
- Catálogo declarado no es stock garantizado ni equivale a marca técnica exacta.
- Nunca invitar basándose únicamente en rubro; el matching necesita evidencia de producto/condiciones confirmadas.

## Riesgos pendientes
- Sin proyecto Cotironda en Supabase ni CLI local: no se ha probado SQL/RLS en PostgreSQL.
- Tests estructurales no bastan; faltan pruebas de rol anon, empresa ajena, suspensión y alta/edición.
- No se probó un onboarding web ni una integración real.
- Falta normalización técnica robusta, códigos de proveedores y cobertura geográfica.
- GitHub es público: nada de secretos ni datos personales.
