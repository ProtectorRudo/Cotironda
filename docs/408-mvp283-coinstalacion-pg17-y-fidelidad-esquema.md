# Decisión 408 — MVP283: coinstalación de 21 migraciones y límite de fidelidad del laboratorio

Fecha: 06/11/2026 Argentina (07/11 UTC). Autorización **«Luz verde»**: solo desarrollo. Issue #667 y PR #668.

## Estado real auditado, sin modificar

Fuente: consulta directa SQL **solo lectura** en `cotironda-piloto` (PostgreSQL 17.11), sin datos comerciales, teléfonos, tokens, claves ni definiciones completas de funciones.

| Indicador estructural | Piloto |
|---|---:|
| Tablas en `cotironda_piloto_privado` | 63 |
| Columnas en tablas privadas | 428 |
| Tablas privadas con RLS | 63 |
| Vistas privadas | 1 |
| Funciones privadas | 20 |
| Funciones públicas de Cotironda | 112 |
| Triggers no internos del esquema privado | 20 |

Extensiones presentes: `pg_cron`, `pg_net`, `pgcrypto` y `uuid-ossp`. Se verificó que **MVP279/MVP280 no están instalados**. Las 71 migraciones registradas previamente terminan en MVP239. No se cambió ningún permiso, configuración, tarea ni dato.

**No hay un `pg_dump --schema-only` privado montado o accesible por el conector de Supabase.** La herramienta permite consultas SQL estructurales pero no exporta un dump completo del esquema. No es seguro reconstruirlo por inferencia ni publicar una copia potencialmente sensible de funciones privadas en GitHub.

## Implementación y evidencia

- `scripts/piloto/mvp283-cumulative-builder.mjs` construye una transacción **única** PostgreSQL17 partiendo del fixture sintético MVP227 (MVP221/222/223/225/226/227) y controles MVP229/230; añade adaptadores **sintéticos** de Auth/Storage y tablas históricas que usa el piloto (MVP104/MVP110/MVP119/MVP127).
- Aplica **las mismas 21 migraciones de MVP281** (245,248,250,253,256–267,274,276,278–280), en orden, sin repetirlas. No se ejecutan los 11 fixtures por separado: esta sí es una prueba real de **coinstalación** de los 21 sobre la **misma transacción y esquema sintético**.
- Primer ensayo: falló porque el fixture no tenía `delivery_receipts_mvp119`. Segundo ensayo: faltaban columnas de `media_archive_mvp095` exigidas por el gate binario. Ambos problemas del esquema sintético fueron corregidos contrastando metadatos de solo lectura del piloto.
- Tercer ensayo: workflow acumulativo PostgreSQL17 **PASS**. Crea las 21 piezas, comprueba ausencia de invitaciones/outbox y controles IA/despacho/trial apagados, verifica `anon` sin permisos sobre publicación/revisión y hace `ROLLBACK` integral; después no queda esquema del ensayo.
- Guard explícito en CI para **solo** `PGHOST=127.0.0.1|localhost`, puerto `5432`, usuario `postgres` y base `cotironda_ci`. Sin credenciales de proyectos remotos, sin mensajes, sin gasto externo.

## Lo que NO demuestra el ensayo

El baseline sintético **no equivale a un clon del esquema real de 63 tablas, 428 columnas y 112 funciones públicas**. Los cambios instalados en versiones históricas del piloto pueden tener firmas, triggers, constraints, índices, grants, datos o extensiones diferentes. Por lo tanto:

- Resultado **válido**: los 21 SQL no tienen conflicto de DDL en el esquema sintético acumulativo que se probó.
- Resultado **NO obtenido**: aplicación de los 21 a una copia **fiel de MVP239** con su inventario de objetos, funciones y restricciones.
- **No se habilita publicación** ni se declaran completas las siete etapas por estas pruebas.

## Próximo paso técnico obligatorio, sin comprar servicios

Obtener **privadamente** y fuera del repositorio público un dump **solo esquema** de `cotironda-piloto` mediante una conexión administrativa autorizada, según la referencia oficial de Supabase CLI `supabase db dump`. El CLI requiere acceso al proyecto o DSN privado; esas credenciales no están disponibles en esta conversación y no deben exponerse en chat ni CI.

Restaurar el esquema en PostgreSQL17 desconectado/aislado con las estructuras gestionadas de Auth/Storage que correspondan. Ejecutar las 21 migraciones en orden, dentro de una transacción descartable, verificar que:
1. Todas las funciones de `SECURITY DEFINER` mantengan `search_path` seguro y revocaciones correctas.
2. RLS y políticas no habiliten lectura entre empresas; las cuatro puertas de aprobación comprador permanezcan cerradas.
3. No se activen crons ni Whapi, y no salgan eventos HTTP ni mensajes.
4. Los 21 SQL se instalen **sin errores** y el `ROLLBACK` devuelva el esquema al estado original; contrastar huellas del catálogo antes y después.

El respaldo contratado permanece en Plan B. Ninguna copia fiel, backup restaurable, prueba WhatsApp E2E ni despliegue fue ejecutado en esta etapa. No confundir éxito de CI o PR integrado con disponibilidad real del piloto.

## Criterios de liberación

Falta verificación sobre dump real, autorización `Publicalo` para el entorno exacto, control de backup/riesgos, despliegue de Edge compatible, verificación en Vercel (actual cuota limita builds) y prueba E2E con arquitecto y proveedores consentidos. Sin esto se mantiene **NO PUBLICAR**.


## Huella estructural reproducible (solo lectura)

Se agregó `scripts/piloto/mvp283-catalog-fingerprint-readonly.sql`, ejecutado contra el PILOTO real sin consultar ninguna fila comercial ni copiar funciones. PostgreSQL17 informó **63 tablas privadas con RLS, 428 columnas, 411 constraints, 20 triggers, 20 rutinas privadas, 112 rutinas públicas Cotironda**. SHA-256 estructural del catálogo (columnas, tipos, nullability, constraints y triggers, no cuerpos de funciones):

`deef31dbf7f9dd06683cc02b4f2e4e625984e415f129dd717524e265c3a348d2`

Esta huella permite detectar divergencias en un futuro clon y debe recalcularse al momento de obtenerlo; **no** garantiza equivalencia semántica de rutinas, triggers ni extensiones, ni suple los originales de un dump privado. No publicar el dump ni copiar credenciales al repositorio público.
