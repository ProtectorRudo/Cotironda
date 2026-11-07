# Decisión 360 — Proveedor manda aviso y después un archivo (MVP238)

## Caso objetivo
El proveedor contesta «Te paso el presupuesto» y, en un segundo WhatsApp,
adjunta un Excel/PDF o imagen. No debe reenviar la lista de materiales,
repetir la ronda ni etiquetar el archivo manualmente.

## Garantías
1. El aviso **no es una cotización**: no provoca mensaje de agradecimiento,
   comparación ni análisis económico. El guard `esAvisoAdjuntoProveedorMvp238`
   es determinista, de una sola línea, sin cantidades, importes ni términos
   comerciales. Los demás mensajes siguen el circuito original.
2. El aviso solo se registra si un RPC existente lo enlazó previamente con
   **una única ronda** a partir del remitente consentido y del despacho
   `api_accepted` del mismo proveedor. Se verifica SHA256 de texto original.
3. Cuando llega el archivo, **primero** se archiva y verifica el SHA del
   contenido. Únicamente después puede intentar consumir el aviso.
4. Una asociación automática exige mismo emisor y chat, aviso previo
   reciente (máximo diez minutos), mismo pedido, ronda abierta, ningún
   mensaje intercalado, ningún otro aviso pendiente y ninguna invitación
   enviada en el medio. Un aviso se usa con **un único archivo**.
5. Si hay dos avisos, otro remitente, pérdida de fuente, archivo antiguo,
   nuevo despacho, mensaje intermedio o conflicto, no se atribuye por
   parecido de materiales: se conserva en revisión sin abrir contacto.
   Un aviso previo no consumido mantiene bloqueada la atribución genérica
   durante 24 horas si la continuación no es segura (`context_blocked`);
   no se «salta» al último pedido aunque sea el único abierto.
6. Las respuestas con ID citado de WhatsApp mantienen el mecanismo previo
   de asociación fuerte, sin inferir por conversación.
7. Se guarda asociación `prior_supplier_preamble` en la fuente original,
   además de la relación privada aviso → archivo. El enlace y los dos
   registros de fuente se escriben en **una misma transacción**.
8. No se inventan totales ni precios, y no se envían WhatsApps salientes
   con esta corrección.

## Alcance técnico
- `ai_supplier_preambles_mvp238`: tabla privada con HMAC, emisor interno,
  ronda interna, SHA y una vinculación de archivo de un solo uso. RLS
  activo y sin permisos directos para usuarios ni `service_role`.
- RPCs `cotironda_piloto_ia_note_supplier_preamble_mvp238` y
  `cotironda_piloto_ia_attach_supplier_media_mvp238` con
  `SECURITY DEFINER`, `search_path=''` y ejecución solo por `service_role`.
- El RPC original MVP225 sigue resolviendo archivos sin aviso y con
  ID citado. Si hay dos avisos válidos no se fuerza una ronda.
- Una asociación bloqueada por aviso anterior queda registrada una sola
  vez en `ai_supplier_unresolved_mvp237` con estado
  `context_blocked`, SHA y proveedor interno; no guarda precios,
  teléfono ni compradores, y no reintenta envío alguno.
- La migración amplía el enum CHECK de `association`, sin reescribir
  presupuestos históricos.

## Puerta de aprobación
Pruebas Node de lenguaje libre, citas y negaciones. PostgreSQL 17
sintético con rollback: SHA/texto adulterado, remitente diferente, vínculo
válido, archivo duplicado, segundo archivo, dos avisos, mensaje
intermedio, invitación posterior y ACL/RLS. Deno typecheck y CI global.

**Estado verificado 06/11/2026:** integrado mediante PR #617 en la
rama de desarrollo, SQL MVP238 instalado y Edge Whapi **v54 ACTIVE**
en `cotironda-piloto`. Los tres gates siguen OFF, no enviamos WhatsApps,
producción no modificada. Queda prueba real de adjuntos con dos rondas
simultáneas para el cierre definitivo (decisión 362).
