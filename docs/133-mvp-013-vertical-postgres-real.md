# 133 — MVP-013: prueba vertical real con PostgreSQL 17, sin «Confirmo»

**31/10/2026 · Issue [#239](https://github.com/ProtectorRudo/Cotironda/issues/239) · trabajo solo en GitHub Actions / PostgreSQL descartable.**

## Qué se consiguió

Se conecta de punta a punta el flujo que hasta ahora estaba probado por módulos separados:

**Webhook con mensaje de proveedor simulado → validación receptor D027 → cifrado AES-GCM D029 → inbox PostgreSQL D028/D030 → trigger de cola D062 → worker D062 → lectura privada D061 → interpretación de texto con evidencias D063 → persistencia de precio original y versión D060 → lectura como comprador autenticado y oferta anónima.**

No se genera «Confirmo» ni mensaje saliente, no se pregunta al proveedor por IVA/flete no aclarados, ni se normaliza arbitrariamente un importe original.

- `src/server/whapi-quote-simple-interpreter-d063.ts` interpreta únicamente una **forma controlada de cotización textual**: línea con cantidad expresa al comienzo, unidad reconocida, palabra de material distintiva y un único importe unitario precedido por `$` en esa misma línea. Ejemplo: `10 bolsas cemento CPC $121.00`. Acepta casos inequívocos de múltiples materiales y nota global expresa `IVA incluido 21%`, pero **no infiere disponibilidad, marca, unidad, IVA, flete, moneda USD, forma de pago ni cantidad**.
- Si el importe se parece a un separador ambiguo (`$12.100` sin centavos), se omite de ese subconjunto automático. Si falta cantidad o se indica un producto ajeno al pedido, no inventa oferta. Si hay dos precios distintos para el mismo material, no elige el más barato.
- `scripts/ci/whapi-pg/mvp-d063-seed.sql` instala únicamente datos ficticios (comprador, proveedor, ronda, invitación, sesión) y un **usuario de PostgreSQL limitado por permisos EXECUTE** a los puertos de inbox, cola, lectura cifrada y oferta. Ese rol no puede leer tablas de mensajes ni versiones o cambiar a `postgres`.
- `scripts/ci/whapi-pg/mvp-d063-e2e.mjs` usa Node22 + driver `pg` contra PostgreSQL17 **real pero descartable** y un cuerpo de webhook local con credenciales aleatorias. Se verifica oferta recibida con IVA desconocido, corrección con IVA 21% incluido y flete sin cargo, replay del mismo mensaje, mensaje ambiguo como revisión interna, baja del proveedor y rechazo posterior.
- `.github/workflows/postgres-rls.yml` prueba **las versiones en tablas reales**, evidencia de origen y deduplicación, ausencia de respuesta «Confirmo» y la lectura de última oferta como comprador con **JWT/sesión reales simuladas en base descartable**. No filtra la identidad del proveedor al comprador.

## Gate de seguridad y producción

**Este CI no recibe WhatsApp real ni utiliza OpenAI ni datos de usuarios:** el webhook es sintético, el intérprete es deliberadamente mínimo y el servidor PostgreSQL existe solo durante el ensayo. **No funciona aún en `cotironda-dev` ni en `cotironda.com`**.

Se verificó que el proyecto Supabase **`cotironda-dev` está activo**, pero tiene 17 migraciones remotas mientras el repositorio conserva 12 históricas. La diferencia de cinco migraciones de laboratorio IA aún está pendiente de reconciliación y #175 exige **backup lógico auténtico, custodiado fuera de GitHub público y prueba de restauración** antes de desplegar migraciones comerciales. Los ensayos de restauración de bases ficticias no satisfacen ese control.

La integración definitiva necesita: credencial de base limitada guardada en el gestor de secretos, scheduler/worker desplegado, webhook Whapi autorizado y consentido, interpretación de documentos PDF/Excel/imagen con IA y límites, y lectura en portal. La zona de entrega debe viajar en toda consulta real. No fusionar ni publicar sin autorización.

## Próximo paso prioritario

Destrabar backup/restauración de la base DEV y activar con datos de **prueba** este circuito en un entorno autorizado, sin proveedores reales hasta completar E2E. El criterio comercial es **comprador manda el pedido, el comercio manda un presupuesto y las ofertas aparecen, sin confirmaciones redundantes**.
