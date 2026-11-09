# Acta 455 / MVP325 — Publicación controlada MVP322–324 en Cotironda piloto

**Fecha:** 09/11/2026 (ART). **Orden expresa:** «Publicalo», después de integrar [PR #719](https://github.com/ProtectorRudo/Cotironda/pull/719) y [PR #722](https://github.com/ProtectorRudo/Cotironda/pull/722). **Entorno autorizado:** únicamente Supabase `cotironda-piloto` y sitio Vercel **`cotironda-seguimiento-vista-piloto`**. No corresponde a publicación del proyecto Vercel principal `cotironda` ni de producción comercial. Sin nuevos envíos WhatsApp y sin activar cron.

## 1. Preflight de lectura real

- Supabase proyecto **`ilggkalaafhtiysyzlmg`**, PostgreSQL **17.11**, funciones existentes `cotironda_piloto_ia_buyer_rubros_mvp227(text)` y `cotironda_piloto_all_suppliers_closed_mvp303(text)` con los SHA256 de baseline esperados: `4ea13c9c96128ea1d40f70a47e52f2f388d744eff3c3da75b479ca63db6f03a6` y `facd4403b5d704c58a20cabd782ea4f72b3ff81f404750716ca9d4b0bf141f99`.
- `ai_auto_release_gate_mvp306`, `ai_batch_gate_mvp314`, `ai_buyer_notice_gate_mvp315`: los tres **`enabled=false`**.
- Cero `ai_dispatch_jobs_mvp222` pendientes, reservados o inciertos. Se observaron tres participantes, cinco rondas y siete originales en `cotironda-piloto-originals`. `anon` y `authenticated` no tenían ejecución de las RPC privadas.
- Edge `cotironda-piloto-seguimiento`: **v25 ACTIVE**, `verify_jwt=false` con autenticación propia, 29 archivos. Auditoría MVP324 de GitHub confirma que solo cambia la proyección MVP322 de `index.ts`; para el siguiente paquete se requieren 33 archivos (los 29 antiguos, MVP322 y tres dependencias transitivas).
- Vercel destino preexistente: proyecto separado `prj_0kZzvuzEg7vL4FzsqbdARKeoHzLk`, alias `cotironda-seguimiento-vista-piloto.vercel.app`, antes asignado a `dpl_85FEqz2eZkEjPsXKd9HMThpX9aiw`. Compilación candidata **READY**, `dpl_APjHh976TX7GD2KB3Esrz3YUxgGD`, commit revisado `9ab239ebc76d9291bc0f7d2b9170457e37af02d9`.

## 2. Cambios aplicados efectivamente

**SQL MVP323:** migración Supabase `20261109130018` denominada `cotironda_piloto_mvp323_etiquetas_anonimas_estables_sin_envios` aplicada con éxito. Se ejecutaron en una sola transacción `BEGIN`/guardias previas de versión/hash, bloqueos/timeout y revisión de gates OFF, las dos RPC reemplazadas, guardias posteriores de ACL/ordinal y `COMMIT`. Sin `ALTER TABLE`, `DROP`, modificaciones de ofertas ni actividades de WhatsApp.

Huellas después de aplicar:
- Buyer MVP227 SHA256: `fbf961028746a1d68ff7a9f3ff645b8677b392c5192bbdbe256a279b2d4bcd1f`.
- Reveal MVP303 SHA256: `5f9db475a16897ee5931045f2817ba77c037cc0590ad2a117daff6654b4d358c`.
- Ambas contienen `first_verified AS (`; `service_role` conserva EXECUTE, `anon`/`authenticated` no ganaron acceso.

**Edge seguimiento:** desplegada exclusivamente `cotironda-piloto-seguimiento` **v26 ACTIVE**, conservando `verify_jwt=false` porque la ruta aplica su autenticación interna del token privado. Se suministró un paquete con **33 archivos**: 28 idénticos a la versión viva, `index.ts` que agrega únicamente la proyección MVP322, `src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts` y los tres módulos transitivos `auditoria-condiciones-mvp167.ts`, `auditoria-descuentos-mvp166.ts`, `comparacion-ofertas.ts`. El backend confirma ACTIVE y v26, pero la API de lectura solo devolvió los **primeros 30 archivos**. No fue posible comprobar mediante esa API que los tres últimos queden listados; la llamada de despliegue sí envió los 33. El funcionamiento HTTP real **no** fue confirmado desde este entorno (DNS/salida restringidos).

**Web piloto:** sin nueva compilación pagada, se reutilizó el preview Vercel **READY** `dpl_APjHh976TX7GD2KB3Esrz3YUxgGD` con SHA `9ab239ebc76d9291bc0f7d2b9170457e37af02d9`; se actualizó únicamente el alias público del proyecto aislado piloto: <https://cotironda-seguimiento-vista-piloto.vercel.app/>. Lectura posterior de Vercel confirma que el alias apunta al despliegue correcto y que dicho despliegue está READY. No se alteraron otros alias ni el proyecto Vercel principal `cotironda`. Se usa el entorno de preview de ese despliegue existente, sin desplegar a producción comercial.

## 3. Verificación posterior de solo lectura

- Ambas RPC, llamadas con hash de token deliberadamente inválido, responden `{"state":"not_found"}`, sin información de ofertas ni contactos.
- Tres flags de automatización siguen **OFF**, cero trabajos inciertos, **3 participantes, 5 rondas, 7 archivos originales**.
- Edge `cotironda-piloto-whapi` permanece **v70 ACTIVE**; `cotironda-piloto-ai-batch` **v1 ACTIVE**, sin activación. Edge seguimiento **v26 ACTIVE**.
- La consulta del registro `ai_supplier_review_mvp227` encontró **un registro, cero en `state='verified'`**. De tres tokens de seguimiento vigentes consultados, una proyección respondió `rubros_por_articulo` y dos `not_found`. No se mostraron ni extrajeron los tokens o datos de contacto. **El sistema nuevo no dispone todavía de una cotización IA Central verificada para verificar la aparición real de tarjetas**, independientemente de que existan ofertas de rutas anteriores.
- La nueva vista preliminar incluye artículos con importes por renglón *acreditados*, suma sin mezcla de monedas, parcialidad/cobertura y condiciones IVA/flete/pago. **La suma no equivale necesariamente al total final del original** y no se usa para posicionar ofertas de coberturas distintas. Las etiquetas están protegidas por el criterio de primera verificación histórica.

## 4. Limitaciones, riesgos y próximos controles

- **No se probó mediante HTTP ni navegador real** desde este entorno la página, el endpoint Edge v26 ni el proxy `api/estado`: el acceso web externo a estos dominios fue bloqueado por el entorno. Que Vercel indique READY y Supabase ACTIVE demuestra despliegue aceptado, **no** una ronda real funcional de punta a punta.
- No hay todavía una cotización IA Central `verified` en el piloto actual; se requiere prueba posterior con presupuesto nuevo verificado, usuario de prueba o navegación desde móvil. No afirmar que las tarjetas mostraron importes reales.
- Se reconoce la **ausencia de backup restaurable comprobado**; el usuario eligió explícitamente continuar sin gasto. La migración se instaló transaccionalmente y el código anterior se conserva en GitHub para recuperación controlada, pero **esto no reemplaza un backup**.
- Token Whapi previamente expuesto sigue sin rotar por decisión del operador. Los nuevos envíos automáticos quedaron apagados; no se enviaron mensajes, no se instalaron cron ni se cambiaron canales.
- Los errores externos de build-rate-limit del proyecto Vercel principal no impidieron reutilizar un preview READY del proyecto **piloto**. No contratar planes ni intervenir en cuotas.
- Control futuro indispensable: obtener respuesta HTTP real del sitio y su API, revisar logs de Edge y Vercel, probar token inválido y válido desde navegador sin publicarlo, recibir una nueva cotización IA Central verificada y comprobar artículo/suma/ocultamiento/cierre. Documentar resultados sin información personal.

**Resultado de esta acta:** publicación técnica y direccionamiento del piloto completados; **certificación funcional E2E pendiente**.
