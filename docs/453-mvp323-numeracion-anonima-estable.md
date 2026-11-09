# Decisión 453 — MVP323: etiquetas anónimas estables en una ronda con llegadas sucesivas

**Fecha:** 09/11/2026. **Autorización:** continuación y corrección de MVP322 bajo «Luz verde», únicamente desarrollo/test. **Sin publicar en Supabase, Vercel, Whapi ni producción**. Seguimiento del problema [Issue #720](https://github.com/ProtectorRudo/Cotironda/issues/720).

## Riesgo detectado
La función SQL `cotironda_piloto_ia_buyer_rubros_mvp227` numeraba sólo los presupuestos *verificados en ese instante* usando `row_number() OVER (ORDER BY md5(request_id||supplier_key))`. Si entra un proveedor adicional por delante del primero según hash, «Presupuesto 1» puede pasar a «Presupuesto 2». Si un proveedor manda otra fuente todavía en revisión, su oferta anterior deja de ser visible temporalmente y los demás presupuestos también pueden renumerarse.

La función independiente `cotironda_piloto_all_suppliers_closed_mvp303` reconstruía la misma numeración variable al cerrar. La nueva pantalla MVP322 refresca cada 45 s; las etiquetas deben continuar señalando siempre al mismo proveedor, sin revelar su identidad antes del cierre.

## Solución

Una **etiqueta anónima estable por la fecha de primera verificación** de cada proveedor, dentro de cada solicitud:
1. Calcular de las revisiones privadas ya existentes `ai_supplier_review_mvp227` `min(finished_at)` **únicamente para fuentes `state='verified'`** de la misma ronda.
2. Ordenar `first_at,supplier_key` y asignar un ordinal 1..N. La clave real permanece únicamente en la consulta privada, jamás en el JSON expuesto.
3. Un proveedor nuevo recibe el siguiente número, sin renumerar los anteriores. Si un proveedor responde con una nueva fuente `review`, queda oculto temporalmente como antes, **pero conserva su número reservado** por la primera verificación. Un reenvío verificado recupera su misma etiqueta.
4. La consulta de cierre MVP303 utiliza exactamente ese mismo origen y orden, para que «Presupuesto N» coincida con la identidad comercial que aparece al terminar la ronda. Los proveedores que nunca tuvieron una oferta verificada no obtienen número, pero figuran como invitados sin respuesta/revisión conforme a MVP303.
5. No se crea tabla nueva ni se mutan los originales, precios, revisiones ni contactos. No hace falta reinferir información con IA ni enviar nuevos WhatsApps.

## Migración segura y alcance
- `supabase/piloto/mvp323_numeracion_anonima_estable.sql`: reemplaza sólo dos funciones RPC existentes, con hash de `pg_get_functiondef` esperado y comprobado en lectura real el 09/11/2026: MVP227 `4ea13c9c96128ea1d40f70a47e52f2f388d744eff3c3da75b479ca63db6f03a6`; MVP303 `facd4403b5d704c58a20cabd782ea4f72b3ff81f404750716ca9d4b0bf141f99`. Si divergen, la migración falla antes de sustituir nada; exige PostgreSQL 17 y reasegura roles `service_role` sin `anon` ni `authenticated`.
- `supabase/tests/ci/mvp323-anonymous-labels-stable-pg17.sql`: base sintética local, crea las **dos funciones reales** desde sus scripts originales, aplica la migración bajo hashes congelados, prueba una ronda con dos ofertas, una tercera que llega después, nueva respuesta pendiente de la primera, token privado y cierre con los nombres comerciales correctamente vinculados, verifica permisos y revierte toda la transacción.
- Workflow `cotironda-mvp323-etiquetas-estables-pg17.yml`: Postgres 17 efímero y solo fixtures, sin contacto real ni conexión a Supabase.
- La nueva numeración **solo se aplica si el código MVP323 es publicado con autorización separada** y en ese momento el guard sigue coincidiendo. No aplicarlo como arreglo fuera de versión ni habilitar los envíos del piloto.

## Criterios de aceptación
- El primer verificado mantiene «Presupuesto 1» y el segundo «Presupuesto 2», aunque un tercer proveedor verifique después, independientemente del orden hash de sus claves.
- Ante última respuesta del primero en revisión, los visibles son «Presupuesto 2» y «Presupuesto 3»; no reaparece el presupuesto anterior no validado.
- Al cierre, cada nombre comercial se vincula solo a su etiqueta verificada actual, con estado de revisión correcto; teléfono y comprador nunca se incluyen.
- El enlace expirado/revocado no muestra datos, no hay ejecución pública de RPC, rollback PG17 y CI verde.
- No hay cambios de envíos, plazos, precios, IVA/flete, comparabilidad ni adjudicación.

**Limitaciones:** la estabilidad exige que la primera revisión `verified` se conserve como historial privado con `finished_at` inmutable, tal como hace el flujo actual. Una intervención administrativa que altere o elimine historial validado o inserte una verificación retroactiva con fecha antigua podría desplazar números; tal cambio debe tratarse como migración de datos excepcional bajo auditoría. El token de Whapi sigue sin rotar por decisión expresa del operador: por eso NO se habilita tráfico automático. Dos controles externos Vercel continúan fallidos por cuota de compilación; no forzar integración.
