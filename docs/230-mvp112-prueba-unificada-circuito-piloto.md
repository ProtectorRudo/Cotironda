# MVP-112 — una ronda de punta a punta, sin datos comerciales ni WhatsApps reales

**Fecha:** 02/11/2026 · **Issue:** #435 · **Base:** PR #434. Esta rama incorpora MVP101–111 mediante ancestro GitHub, sin integrar todavía a `main` ni desplegar.

## Resultado verificado hoy

Se ejecutó en el proyecto PostgreSQL 17 **cotironda-piloto** una sola transacción que contenía las migraciones apiladas MVP101–MVP110 y `supabase/piloto/mvp112_roundtrip_e2e_rollback.sql`.

En **dos rondas sintéticas de un mismo arquitecto** (una con 2 proveedores que cubren el artículo y otra con un proveedor parcial) se comprobó toda la secuencia conectada:

1. Registrar solicitud de comprador y artículo objetivo (La Plata, cemento CPC 50 kg, 20 bolsas).
2. Dos invitaciones con remitentes enrolados, compra original y renglones adicionales de flete, total declarado literal, 2 propuestas de proveedor ficticias y archivo archivado SHA256.
3. Doble lectura concordante de oferta, integridad económica decimal, marca privada de cotejo de fuente, proyección Cotironda propia **solo si coinciden los controles**.
4. Enlace privado vigente del arquitecto con **2 cotizaciones anónimas visibles DURANTE la ronda**, todos los importes y adicionales, sin claves de negocios ni teléfonos.
5. Rechazo de selección prematura. Vencimiento real del reloj PostgreSQL manteniendo plazo **96 horas** (fecha inicial sintética anterior), ejecución de `cotironda_piloto_close_due_v1` y `cotironda_piloto_prepare_finalists_due_mvp110`.
6. Cobertura correcta: **dos alternativas completas** en un caso; **una alternativa** cuando la segunda era parcial. Nunca ranking engañoso por totales, IVA desconocido, marcas o equivalencias inventadas.
7. Sin consentimiento específico no se genera ningún aviso ni aparece la información de finalistas en el enlace.
8. Después de una autorización de contacto por cada una de las partes, el outbox crea exactamente **3 avisos** en el caso completo y **2** en el parcial (comprador + cada finalista). Duplicar la llamada genera **0** avisos adicionales.
9. Reserva única de cada mensaje con token, comprobación de consentimiento justo antes del envío, aceptación **simulada** de Whapi, rechazos de doble finalización y de token de seguimiento inválido.
10. Revocación posterior del consentimiento → el enlace deja inmediatamente de revelar contactos.

Resultado: **PASS**, respuesta final `fully_reversible=true` tras `ROLLBACK`. No hay datos de prueba persistidos, no cambió el cierre de una ronda de cliente, no salió ningún mensaje Whapi.

### Qué demuestra, y qué no

**Demuestra:** integración efectiva de las RPC de SQL, privacidad de la vista de seguimiento, selección de cobertura, consentimiento de tres participantes, cola e idempotencia en un mismo caso de negocio. Los tests Node previos prueban separadamente el cifrado AES-GCM/HMAC, armado de mensajes y la lectura de archivos TXT/CSV/Word/Excel sencillos.

**No demuestra:** que las funciones Edge que están desplegadas sean idénticas al código de GitHub; que Whapi entregue los mensajes a teléfonos reales; que el modelo interprete **cualquier** lenguaje, imagen, PDF o Excel complejo; ni que los presupuestos puedan ordenarse económicamente con IVA/flete/pago/stock y combinarse entre dos negocios. Tampoco demuestra fuente documental byte por byte dentro del test SQL: usa un SHA y cotización ficticios. Las pruebas Node verifican por separado documentos Office genuinos.

## Auditoría de preparación real / NO-GO

Se ejecutó `mvp112_readiness_readonly.sql` contra la base piloto **sin modificarla**. Resultado confirmado:

- **NO_GO: 12 requisitos SQL NO instalados** (espejo proveedor, doble lectura, montos exactos, acuse, comprobación de fuente, proyección segura, selección, cifrado de contacto, consentimiento, outbox, RPC de worker, revelación del enlace).
- WhatsApp inbound y outbound habilitados en banderas de **base**, al igual que archivo privado de medios. Esto NO equivale a que la lógica nueva esté desplegada ni a que haya números para todos.
- En Supabase, las funciones activas eran `cotironda-piloto-whapi` v33 y `cotironda-piloto-seguimiento` v7. **No se halló el worker nuevo `cotironda-piloto-finalistas`** instalado.
- El proyecto Vercel `cotironda-portal-dev` tenía como último despliegue READY consultado un commit anterior al PR apilado; no prueba la UI nueva.
- Los controles de CI GitHub en la base de trabajo #434 dieron 5/5 PASS. El ensayo unificado #435 es nueva capa de prueba.

Por tanto **NO se le puede pedir al usuario que envíe hoy una cotización y prometer ronda automática completa**. No hacer despliegue, migración ni mensajes reales sin el comando `Publicalo` y entorno autorizado.

## Guion para ensayo real futuro (solo después del GO)

Usar un arquitecto y dos proveedores previamente enrolados/consentidos en La Plata. Sin nombres ni números en archivos de prueba públicos. En WhatsApp, el arquitecto puede pedir en su lenguaje natural, por ejemplo:

> Hola, necesito presupuesto de 20 bolsas de cemento CPC de 50 kg, con entrega en La Plata. Avisen si hay flete o adicionales.

El bot debería contestar que tiene los datos y entregar el enlace privado de Cotironda, sin pedir confirmaciones. Cada proveedor recibe **solo rubro y zona que vende** y envía un archivo de cotización prueba con todos los artículos y cualquier adicional/término real. Para el primer ensayo automatizado usar TXT/CSV o DOCX/XLSX **sencillo verificado**. Un PDF o foto seguirá internamente en revisión si no hay comprobación independiente; NO se publicarán cifras no verificadas.

Para permitir intercambio de contacto una sola vez, las tres personas deben enviar al bot `COTI CONTACTOS SI`; también pueden revocar con `COTI CONTACTOS NO`. Esto no es confirmación de cada oferta, sino autorización de divulgación al cierre. Durante la ronda, el portal muestra solo cotizaciones verificadas anónimas. Tras el plazo normal de 4 días, muestra hasta dos alternativas completas, sin afirmar que son los precios más bajos cuando no hubo comparación equivalente. Los tres reciben avisos si los envíos están habilitados y la cola confirma aceptación de API.

## GO/NO-GO antes de activar

- [x] Prueba conectada PostgreSQL 17 de dos coberturas y cierre, con rollback
- [x] Rechazo de prematuro, sin consentimiento, token falso, envío duplicado y baja
- [x] Tests de originales TXT/CSV/Word/Excel simple en código anterior
- [ ] Fusionar y auditar TODOS los PR apilados, sin saltos de migraciones
- [ ] Verificar que el piloto recibe las 12 migraciones nuevas y que RLS/roles siguen protegidos
- [ ] Desplegar Edge Whapi/seguimiento/finalistas **solo** en entorno piloto autorizado
- [ ] Verificar versión efectiva del worker, secrets, scopes, cupos, Whapi callback, fecha/hora
- [ ] Comprobar conversión fiel de PDF/foto (de lo contrario: revisión humana interna, sin fricción al proveedor)
- [ ] Validar fuentes Office complejas (tablas, fórmulas, formatos) y límites 3 MiB/25 o 8 líneas
- [ ] Confirmar equivalencias, IVA, flete, pago, stock y comparación económica determinista; parciales/combinación de dos proveedores
- [ ] Prueba REAL con tres teléfonos y cierre; registrar recepción, entrega y contacto seguro
- [ ] Autorizar publicación si la prueba piloto pasa

**Decisión:** el circuito se puede **ensayar internamente con una sola ronda SQL**, pero no aprobar un lanzamiento real de WhatsApp antes de resolver las casillas de NO-GO. No falsificar avance por pruebas verdes.
