# Acta 479 — MVP344: BIG BAG en publicación anónima con cotejo económico

**Fecha:** 10/11/2026. **Estado:** SOLO DESARROLLO; sin SQL al piloto, sin Whapi ni llamadas de IA.
**Dependencias:** PR #742 (MVP336) y PR #752 (MVP343 mínimo).
**Prioridad:** primero circuito funcional E2E, luego medición detallada de costos.

## Hallazgo confirmado en Supabase piloto, solo lectura

- Último PDF de Ailín retenido: 3 artículos, uno empieza con Cemento y dos con BIG BAG.
- El total declarado y los importes de cada línea tienen formato monetario interpretable por el parser del sistema. **Esto no acredita balances correctos, IVA, flete, condiciones ni ausencia de errores de fuente**.
- El campo unanswered del borrador está vacío. No se detectaron señales de contactos según los patrones consultados, lo que no sustituye comprobación independiente de privacidad.
- El publicador MVP107 actualmente carece del prefijo BIG BAG en su lista permitida. Por eso, aunque MVP336 asocie el PDF a la ronda correcta, **los dos artículos quedarían excluidos de la vista anónima** por el filtro de calidad.
- El PDF sigue sin asociación definitiva, motivo insufficient_material_evidence. El PR #752 prepara recuperarlo sin reenvío.
- Inventario Edge Function piloto: webhook v75, 61 archivos; recovery v10, 25 archivos. No se modificaron. Los módulos de control comercial comparados coinciden con su versión de GitHub, pero aún falta verificación integral del bundle.

## Migración mínima

Archivo: supabase/piloto/mvp344_aceptar_big_bag_anonimo_sin_relajar_privacidad.sql

- Exige definición previa de public.cotironda_piloto_publish_source_text_mvp107(text) y comprueba que exista **una única aparición exacta** de la lista original de prefijos.
- Reemplaza solamente esa lista para admitir el patrón big[ -]?bags? (BIG BAG, BIG-BAG, BIGBAG). No acepta cualquier nombre, ni remueve verificaciones de montos o privacidad.
- Mantiene autorización por empresa/proveedor, ronda vigente, archivo almacenado, corroboración de ambas lecturas, fuente original verificada, aritmética balanceada, consentimiento y zona.
- Preserva detección de WhatsApp, CUIT, teléfonos, correos, enlaces, domicilios y contactos.
- La proyección sigue siendo **anónima**, no ranking ni adjudicación. Permisos REVOKE para PUBLIC/anon/authenticated; solo service_role ejecuta la función.

## Ensayo transaccional PostgreSQL 17

Script mvp344-bigbag-publicacion-privada-pg17.sql encadenado al paquete MVP336 y final ROLLBACK.

1. Reutiliza un PDF comercial **sintético** 15/2/1 y valida que sin chequeo de fuente no se pueda publicar.
2. Exige dos lecturas coherentes, montos balanceados y comprobación de fuente antes de publicar los 3 productos, cantidades y total, de forma anónima.
3. Intenta publicar por segunda vez: no se duplica.
4. Otro presupuesto **sintético** con el texto BIG BAG de Arena WhatsApp 22112222, aun con precio equilibrado, debe ser rechazado por privacidad.
5. No altera oferta económica final, ranking, mensajes ni contactos y hace ROLLBACK.

Las pruebas de CI simulan el dictamen independiente source_text_covered; eso **no verifica un PDF auténtico**. En el piloto solo el lector real puede producir ese resultado a partir del original privado.

## Qué falta para la prueba con Ailín y Nahuel

- No se instaló SQL MVP336/MVP344 en piloto, ni se actualizó webhook v75/recovery v10.
- Hace falta verificar SHA, texto, montos, cantidades, condiciones y alcance del PDF real antes de mostrar precios.
- Se requiere publicación coordinada SQL/webhook/worker **solo tras una orden Publicalo**, respaldo/reversión adecuados y prueba del enlace del arquitecto.
- Quedan ensayo real con el segundo proveedor y cierre/revelación. Esta corrección es concreta, no soporte universal de todos los formatos.

**Decisión:** remover el bloqueo BIG BAG sin sacrificar privacidad o fidelidad comercial.
