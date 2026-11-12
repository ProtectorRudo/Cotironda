# Cotironda — estado verificable y relevo entre conversaciones

> **ACTUALIZACIÓN P0 — 11/11/2026: evaluación de código abierto:** [Comparativa ERPNext vs Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Se eligió mantener el núcleo actual y no instalar ERPNext/otra base para el piloto, con reserva de revisarlo si falla un spike real. **P0 no está terminado:** falta matriz de Vercel, política explícita de revelación de originales y tests de acceso. Último dato real: 8 medios archivados con SHA, 4 ligados a request_id (no necesariamente correctos), 0 ofertas anónimas, Auth piloto 0, política originales OFF, consentimientos 0. **Siguiente paso único:** completar P0 de privacidad/empresa/implementación desplegada; luego P1/P2 proyección documental. Rama y PR de esta evaluación independientes, sin deploy.


**FECHA DEL ÚLTIMO RELEVO:** 11/11/2026 (Argentina). Este archivo es un SNAPSHOT, no una consulta en tiempo real.

> **VERCEL, VERIFICADO 11/11/2026:** `cotironda` producción READY es una demo aislada de `main` (SHA `5987f170...`), NO el piloto documental. `cotironda-seguimiento-vista-piloto` tiene producción READY de rama antigua y **previews documentales ERROR**; `cotironda-seguimiento-web-piloto` conserva producción ERROR y previews previas READY. Los commits de documentación activan builds de **Preview automáticos** por la conexión GitHub, aunque no se haya publicado a producción. Antes de P3/P4, identificar URL real autorizada del comprador, revisar build y validar con Auth/ACL. [Evidencia y matriz](P0-ERPNext-vs-Cotironda-evaluacion.md).

**LECTURA OBLIGATORIA:** [Issue #794 — checklist canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan maestro](PILOTO-100-PLAN-MAESTRO.md).

## Actualización de pruebas y bloqueo real (11/11/2026)

El [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797) ahora también incluye la actualización del manifiesto de seguridad MVP324 **sin cambiar su hash base**, tests de regresión y un fixture **PostgreSQL 17 con ROLLBACK** que cubre PDF/XLSX, duplicados, SHA/ruta forjada, varias rondas y token revocado. Unidad general, Deno Whapi, PostgREST y PG17 histórico pasan con commit `c8a937f614a701ea2eb46e366685668021da79ee`. El workflow específico PG17 del nuevo DDL **todavía no aparece ejecutado**; Next.js seguía compilando al registrar esto. Ninguna función nueva está instalada ni habilitada.

**Próxima comprobación concreta antes de seguir:** CI del SHA final (especialmente Next y SQL PG17 específico); test de correlación P2 y política comercial P0. No abrir nuevas ramas de parser ni crear ronda sobre prepared activa.

## Relevo de avance — 11/11/2026 (PR #797)

**Código efectivamente creado:** [PR #797 — MVP354 recepción documental sin IA](https://github.com/ProtectorRudo/Cotironda/pull/797). Incluye nuevo SQL RPC PRIVADO, DTO de ocho campos, tracking opt-in con flag apagado, HTML de contador documental y tests Node. Basado en PR técnico #793. El PR está en borrador, no fusionado ni publicado; NO cambió las Edge live, base, Whapi o producción. Compilaciones automáticas de Preview de GitHub/Vercel no prueban el circuito E2E.

**Ensayo SQL SOLO LECTURA:** token inexistente -> not_found; ronda preparada actual -> `2 despachados / 0 originales acreditados / 2 pendientes`. Esto evita inventar archivos recibidos y no altera datos. Faltan pruebas de DDL PG17 + autorización, regresión y 2 archivos reales; ninguna etapa P1–P5 está aprobada. Respuestas de texto puro aún requieren archivo inmutable propio.

**Siguiente acción única:** completar P0 de política de originales/contactos + auditoría de identidad/ACL y URL real del comprador. Después validar el RPC MVP354 en PostgreSQL17 con rollback y pruebas de ambigüedad/duplicados, implementar P1/P2 para archivos/textos y P3 en la ronda E2E. Ver [Acta 522](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp354-document-receipt-status-20261111/docs/522-mvp354-recepcion-documental-independiente.md).

## Próximo paso ÚNICO
**P0: hacer una auditoría de implementación y consentimiento de originales, SIN modificar producción ni activar E2E.** Hay que leer código actual, qué se desplegó realmente en Supabase/Vercel, las rutas del comprador, las descargas MVP178–207 y la relación entre ronda/invitación/inbox/Storage. Entregar una matriz con pruebas: existe en código / instalado en piloto / demostrado E2E. Resolver explícitamente si los originales de no ganadores se pueden descargar íntegros al cierre sin contradecir la norma de revelar contactos solo de los dos ganadores.

Si el usuario responde **«Luz verde»**, avanzar en rama, con tests, NO desplegar. **«Publicalo»** autoriza solo la versión y el entorno concretamente determinados tras controles. No enviar WhatsApps reales sin un acto de ejecución autorizado.

## Diagnóstico de corte, CON FUENTE, 11/11/2026
- GitHub repo: ProtectorRudo/Cotironda. Rama principal main todavía contiene un contrato temprano, no la implementación piloto completa. Este plan está en PR documental independiente; no confundir con merge/despliegue.
- Supabase piloto: ilggkalaafhtiysyzlmg.
- Rondas: 1 prepared aún activa, 1 draft vigente entre 2 drafts, 4 closed. Fecha de cierre prevista de prepared: 14/11/2026.
- Invitaciones a la ronda preparada: 2. Despachos aceptados: 2. Una respuesta de proveedor vinculada. Zero ofertas anónimas visibles; 1 offer_version histórica, distinta de las ofertas actuales. No hay outbox leased/uncertain.
- PRs #790, #791, #792, #793 en desarrollo y no integrados a main. Recuperación MVP351 documentó publicación solo a Supabase piloto, pero no consiguió convertir PDF ambiguo en oferta verificada. PR #792 última lectura contextual NO está publicado. PR #793 previene preflight que recomiende otra ronda pese a prepared vigente; solo controles read-only.
- Código existente de originales: documentos MVP190/201/207 confirman rutas y Auth preparados pero no activados integralmente; nunca anunciar descarga disponible antes de prueba.
- Issue histórico #750: correlación PDF ambiguo y falta E2E, no resolver alterando fechas o forzando asignaciones.

## Qué NO hacer al retomar
- NO enviar otra solicitud de prueba sobre la ronda prepared viva.
- NO anunciar «2 presupuestos disponibles» solo porque hay 2 envíos/una versión histórica.
- NO continuar con cuarta/quinta relectura de PDFs por inercia.
- NO desbloquear originales de no ganadores sin norma explícita de contacto, aviso y consentimiento.
- NO mezclar Supabase DEV con piloto, ni tokens de seguimiento con Auth comprador.
- NO fusionar PRs apilados ni desplegar por la sola existencia de CI exitoso.

## Formato del próximo relevo: completar antes de cerrar cada etapa

### Relevo — [fecha UTC + ART]
- **Etapa activa:** P0/P1/P2/P3/P4/P5/P6/P7.
- **Último resultado realmente comprobado:** [hecho y fuente: GitHub/SQL/CI/prueba navegador].
- **Criterio pendiente exacto:** [una frase verificable].
- **Próxima acción ÚNICA:** [comando/herramienta/archivo o componente a revisar; no promesa].
- **Versión vigente:** [branch, commit, PR, Supabase SQL/Edge, Vercel URL y entorno solo cuando sean comprobables].
- **Datos E2E:** [comprador, invitados, archivos guardados, asociados, visibles, descargables, todos como conteos, sin identificadores privados].
- **Pruebas pasaron/fallaron:** [nombres, links y SHA de la ejecución].
- **Riesgos y retroceso:** [invariantes, consentimiento, idempotencia, backups].
- **Publicación:** [no / sí, entorno y autorización explícita].
- **Issue #794:** [checklist actualizado con enlaces o queda pendiente].

**Nunca declarar éxito por leer este archivo.** Verificar estado live y evidencias actualizadas antes de afirmar qué funciona.
