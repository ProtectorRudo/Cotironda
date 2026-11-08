# Decisión 430 — MVP304: WhatsApps consentidos de TODOS los proveedores al cierre

**Fecha:** 07/11/2026. **Estado:** **PUBLICADO SOLO EN EL PILOTO**, sin activar nombres ni teléfonos (gate OFF, 0 consentimientos). Ver [reporte 431](431-publicacion-mvp303-304-piloto.md). Instrucción del producto: al vencimiento se identifican todos los negocios invitados, no dos finalistas. Esta decisión **complementa** la [429](429-mvp303-revelar-todos-proveedores-al-cierre.md).

## Problema y política operativa
La ronda cerrada muestra identidad comercial de todos los proveedores (incluso quien no cotizó). El comprador necesita poder CONTACTAR a los que lo hayan autorizado, sin adelantar la liberación ni inventar teléfonos.

La base real `cotironda-piloto`, comprobada solo lectura el 07/11, tiene **3 contactos cifrados**, **0 consentimientos explícitos vigentes de revelado**, 8 invitaciones históricas y 2 proveedores registrados. Por tanto **no** habilitamos automáticamente ningún número al comprador: estar dado de alta o cotizar **no sustituye consentimiento para compartir el WhatsApp**.

## Decisión
- Los NOMBRES comerciales de todos los proveedores invitados y consentidos se revelan tras **estado cerrado + plazo vencido + enlace privado autorizado + activación prospectiva MVP303**.
- El WHATSAPP aparece individualmente si y solo si el proveedor aprobó **COTI CONTACTOS SI** desde su canal autenticado, existe número cifrado correctamente vinculado, y no hay revocación `COTI CONTACTOS NO` ni baja de participación.
- **No hay máximo 2** contactos ni filtro por ranking o cobertura. Si aprobaron 5, aparecen 5; si ninguno aprobó, todos los nombres siguen visibles pero **sin teléfonos**.
- Los comerciantes NO reciben automáticamente el número del comprador. Nunca hay adjudicación automática, ganador, presión comercial ni mensaje saliente con este bloque.
- Al estar fuera el período gratuito de Whapi, la autorización nueva solo podrá capturarse cuando vuelva a operar el canal o por un futuro proceso autenticado equivalente con comprobación del mismo nivel. **No fabricar consentimientos mediante SQL ni asumir autorización por registro.**

## Implementación técnica en desarrollo
- `supabase/piloto/mvp304_contactos_consensuados_todos_cierre.sql`: RPC read-only `cotironda_piloto_all_supplier_contacts_mvp304(token_hash)`, **solo service_role**, que revalida la autorización del listado MVP303 y el token del comprador; une invitaciones reales, rol proveedor, consentimiento vigente, `participant_channels_mvp109`, origen WhatsApp de la frase exacta, canal autenticado y AAD HMAC. Devuelve cifrado en un JSON **privado de servicio**. Nunca retorna el teléfono ni contacto del comprador.
- `src/domain/ia-central/contactos-consentidos-cierre-mvp304.ts`: descifrado AES-GCM y contraste HMAC SHA256 de dirección WhatsApp y canal. Rechaza alteraciones, duplicación, etiquetas con PII y payloads adicionales. Sólo devuelve `{nombre,whatsapp}` para el comprador ya autorizado y si los nombres coinciden 1 a 1 con los del listado MVP303. Si los nombres se repiten o no concuerdan, no se libera número alguno.
- `supabase/functions/cotironda-piloto-seguimiento/index.ts`: Edge usa la RPC service_role después del gate MVP303 y descifra internamente usando claves **ya existentes**; no agrega nuevas, ni envía mensajes, ni interfiere con ofertas. Resultado reducido independiente `contactos_proveedores_cierre`.
- `piloto/seguimiento-web/api/estado.js` agrega segunda whitelist: sólo enlaces de teléfono numéricos en proveedor ya visible y ronda cerrada; jamás nombres de otras rondas, ciphertext, HMAC, precio ni contacto de comprador.
- `piloto/seguimiento-web/site.js`: cada negocio aparece identificado; si aprobó, botón «Contactar por WhatsApp» abre `https://wa.me/<número>` sólo por clic; si no, «Contacto no habilitado para compartir». Nunca se envía un WhatsApp automáticamente.
- Pruebas `tests/unit/mvp304-contactos-consentidos-cierre.test.mjs` con AES/HMAC real en Node 22, proxy y UI, junto con `supabase/tests/ci/mvp304-contactos-consentidos-postcierre-pg17.sql` en PostgreSQL17 desechable y la ronda ficticia MVP284/303 en UNA transacción con ROLLBACK, sin costos ni llamadas externas.

## Protección y límites
1. Token del comprador y activación previa MVP303, cierre temporal y estado `closed` obligatorios; no filtrar con un estado de navegador inventado.
2. La frase de consentimiento debe estar registrada como mensaje WhatsApp autenticado de **ese proveedor y su mismo chat** (no basta registro, proveedor genérico ni la palabra escrita por operador).
3. Revocación/baja se consulta al momento de cada petición. Sin consentimiento no hay contacto; **la lista de nombres no depende de eso**.
4. El teléfono sólo se muestra al comprador con bearer de esa ronda. Un enlace compartido podría permitir que quien lo posea vea datos: usar enlace de alta entropía, revocable, expirable, sin logs, referrer-policy no-referrer y no persistir cache. Las páginas usan POST y `textContent`.
5. Duplicación de nombre comercial bloquea los números hasta desambiguar; no conectar por intuición un número a la empresa equivocada.
6. Las pruebas de archivos cifrados en SQL usan texto **ficticio**, NO validan AES; las unitarias validan WebCrypto con claves de prueba. No se accedió a secretos de producción.
7. **Luz verde** permite desarrollar y probar, no instalar migración ni activar gate. **Publicalo** requerirá autorización posterior para entorno piloto, orden seguro y activación prospectiva; no tocar rondas históricas.
8. Queda pendiente una prueba E2E con canal Whapi activo que incluya consentimiento genuino, cotización, cierre, vista móvil y revocación real. Nunca declararla hecha con simulaciones.

### Compatibilidad
La lógica antigua MVP109/MVP110 de finalistas sigue instalada pero su activación está OFF: **no reactivarla**. Se reutiliza únicamente el **cifrado y registro de consentimiento MVP109**, no su planificador, top 2, cola de mensajes ni condiciones de adjudicación.

Esta decisión actualiza README, AGENTS.md y CHANGELOG y mantiene el historial por trazabilidad.

## Resultado comprobado — 07/11/2026

- [PR #698](https://github.com/ProtectorRudo/Cotironda/pull/698) **integrado** (squash) solo a `feat/mvp174-supplier-packaging-equivalence`; commit `27cdc3cd6a45fe8bf4039717b2604e801b9468bd`.
- Último SHA del PR `e7bd756a4d65b00f3fe3b569e3516d33cde7ef5c`: **19/19 controles GitHub CI verdes** incl. Edge/Deno, seguridad, PostgreSQL17, Next.js y proxy.
- Suite de regresión focal **21/21 PASS**; PostgreSQL17 de la integración MVP284 + MVP303 + MVP304: **PASS** de 0, 1 y 2 teléfonos consentidos; revocación de consentimiento, revocación de enlace y gate de publicación OFF correctamente bloqueados. La migración REAL MVP109 (con el trigger inmutable original MVP101) se montó dentro del laboratorio efímero; ROLLBACK completo validado.
- Pruebas WebCrypto confirman cifrado AES-GCM/HMAC con cuatro proveedores consentidos, aunque la prueba SQL esté centrada en las dos cuentas de proveedores existentes en la ronda sintética.
- No cambios en Supabase/Vercel/Whapi reales; WhatsApp sigue con período de gracia vencido. El MVP304 no está desplegado ni activado; no se pagaron servicios, no se enviaron mensajes ni se alteraron contactos.
- Estado real de consentimientos específicos: **0**, por lo que una instalación futura no habilitará números hasta que cada proveedor autorice. El nombre comercial puede revelarse tras cierre con el gate prospectivo MVP303 aprobado, pero nunca por condición económica, solo por pertenencia a ronda.
- **Siguiente paso para una publicación futura** (`Publicalo`): instalar MVP303 y MVP304 en piloto con gate OFF, auditar ACL y RLS, publicar Edge de seguimiento y Vercel, habilitar gate prospectivo explícito SOLO para nuevas rondas y registrar consentimientos genuinos del proveedor vía WhatsApp. Luego E2E genuino con Whapi operativo. No reactivar MVP110 de dos finalistas.
