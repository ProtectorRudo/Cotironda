# Cotironda — estado verificable y relevo entre conversaciones

> **ACTUALIZACIÓN P0 — 11/11/2026: evaluación de código abierto:** [Comparativa ERPNext vs Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Se eligió mantener el núcleo actual y no instalar ERPNext/otra base para el piloto, con reserva de revisarlo si falla un spike real. **P0 no está terminado:** falta matriz de Vercel, política explícita de revelación de originales y tests de acceso. Último dato real: 8 medios archivados con SHA, 4 ligados a request_id (no necesariamente correctos), 0 ofertas anónimas, Auth piloto 0, política originales OFF, consentimientos 0. **Siguiente paso único:** completar P0 de privacidad/empresa/implementación desplegada; luego P1/P2 proyección documental. Rama y PR de esta evaluación independientes, sin deploy.


**FECHA DEL ÚLTIMO RELEVO:** 11/11/2026 (Argentina). Este archivo es un SNAPSHOT, no una consulta en tiempo real.

**LECTURA OBLIGATORIA:** [Issue #794 — checklist canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan maestro](PILOTO-100-PLAN-MAESTRO.md).

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
