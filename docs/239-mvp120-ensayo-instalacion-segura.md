# MVP-120 — ensayo reproducible antes del corte PILOTO

**03/11/2026 · Issue #451 · NO-GO comercial hasta respaldo externo verificable y prueba real WhatsApp.**

## Comprobación efectuada

- GitHub, base MVP-119: commit bcfbfcacb6f47c8c0daeba0b50d41fb15dc4e206; CI 7/7 PASS tras corregir la prueba obsoleta de status de webhook.
- Supabase PILOTO exclusivamente, PostgreSQL 17.11: 15 pasos SQL de MVP101–119 más ampliación a 25 artículos y puerta de seguridad MVP118, aplicados solo dentro de una transacción reversible. Resultado **PASS con ROLLBACK** comprobado.
- Cuatro fixtures ejecutados en SAVEPOINT independientes con reversión: MVP112 ronda completa 1+2 sintética, MVP115 dos parciales, MVP117 pedidos de 9 y 25 artículos, MVP119 estados de entrega autenticados sintéticos. No hubo mensajes reales.
- Estado previo de Supabase: tres participantes, dos invitaciones, dos líneas de pedido y dos originales privados en Storage. Se consultaron solamente cantidades.
- Edge instaladas: Whapi v33, seguimiento v7; finalistas no instalado. Lectura del sistema desplegado: todavía faltan **13 componentes** de la base. No se cambiaron flags de envío.

## Herramienta de preparación

El comando **node scripts/ops/mvp120-pilot-rehearsal.mjs --check** arma el guion con 15 scripts y cuatro fixtures, con orden fijo y hash SHA256. Solo informa el resumen; no conecta a ninguna base, ni modifica configuración ni manda WhatsApps.

Con **--sql** imprime la transacción reversible completa: BEGIN, SET LOCAL, sentencias aprobadas, SAVEPOINT y ROLLBACK por cada fixture, ROLLBACK total y verificación final de ausencia de los nuevos componentes. El runner rechaza scripts que intenten iniciar o cerrar transacciones por su cuenta. No dispone de modo de instalación. Para ejecutar este SQL en un equipo confiable se utiliza PostgreSQL 17 y **psql -X -v ON_ERROR_STOP=1**, usando credenciales en variables privadas y **jamás** contra producción. No copiar contraseñas, DSN, originales ni tokens al repositorio o al chat.

## Requisito indispensable antes de modificar los datos reales

La [documentación oficial de Supabase](https://supabase.com/docs/guides/platform/backups) aclara que el plan Free carece de respaldos diarios incluidos y que el dump de base **no respalda los bytes de Storage**. El proyecto PILOTO conserva datos y dos archivos privados: no se encontró prueba de exportación externa cifrada y restauración auténtica de ambas fuentes. Un snapshot dentro de la misma base no satisface ese requisito.

No instalar permanentemente SQL, cambiar endpoints Edge activos ni habilitar finalistas hasta tener un respaldo recuperable fuera del proyecto, con verificación de integridad. Los cambios SQL actuales son principalmente aditivos, pero también modifican funciones y constraints.

## Criterios de aprobación para el piloto

1. Backup externo protegido de PostgreSQL y de todos los objetos privados Storage; restauración probada en aislamiento y hash/inventario cotejado, sin mostrar contenido.
2. Congelar commit exacto, auditar permisos, consentimientos, cupos, costos, secretos y RLS. Conservar aislada la portada cotironda.com.
3. Aplicar la pila de 15 scripts en un corte transaccional, verificar cantidades y RLS. Mantener OFF la activación de avisos de finalistas y bloquear rondas históricas.
4. Desplegar coordinadamente Edge Whapi, seguimiento y finalistas con el worker de finalistas apagado; confirmar configuraciones privadas y callbacks status.post. Distinguir mensaje aceptado por API de entregado.
5. Portal Next.js Preview de igual commit con vista anónima y token seguro.
6. Validación auténtica con un arquitecto y dos negocios: pedir zona cuando falta, otro pedido con zona, envío de PDF específico por proveedor, recepción de dos presupuestos en formatos distintos, extras/cargos originales, actualización anónima, cierre a cuatro días (o ensayo con reloj controlado) y un aviso consentido por destinatario.
7. Solo anunciar ranking económico cuando IVA, flete, importes, disponibilidad y condiciones se hayan comprobado contra cada fuente. Casos dudosos quedan en revisión. No adjudicar automáticamente.

**Resultado MVP120:** ensayo integral SQL reutilizable y documentado; no se afirma que el piloto esté publicado ni que tres teléfonos hayan recibido mensajes.