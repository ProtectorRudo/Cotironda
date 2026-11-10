# MVP198 — ronda sin ofertas no paraliza los finalistas del piloto

**Solo desarrollo, sin publicación de SQL ni Edge.**
El primer cierre pendiente en `cotironda-piloto` (6/11 a la 01:34 ART)
corresponde a una ronda sin cotizaciones. Las dos rondas con presupuestos
v9 verificados cierran después (7/11). No hay motivo comercial para inventar
finalistas en la ronda vacía ni permitir que bloquee todas las siguientes.

## Auditoría de datos reales — solo lectura

En el entorno `cotironda-piloto`, la función privada MVP172 devuelve:
- Ronda anterior: `capacity_or_empty`, **0** cotizaciones.
- Ronda siguiente: `private_inputs`, **2** cotizaciones, **2** artículos,
  fuente v9 y libro económico conciliado por los 4 renglones.
- Ronda posterior: `private_inputs`, **2** cotizaciones, **3** artículos,
  fuente v9 y libro económico conciliado por los 6 renglones.
- Estado: **3** rondas `prepared`, **0** `closed`, cron de cierre activo,
  **0** planes y **0** avisos. Activación v196 no instalada y finalistas OFF.
- La comprobación de estructura real verificó existencia de
  `private_round_inputs_mvp172`, función inmutable de edición,
  invitaciones, presupuestos, versiones textuales y enlaces por token.

El planificador previo MVP196 recorría las rondas cerradas por deadline,
incluía una ronda aunque no tuviera cotizaciones y terminaba
con `unverified_source` si el primer expediente no era `private_inputs`.
Eso habría bloqueado el lote completo al vencer primero la ronda vacía.

## Corrección

En la **misma RPC** `cotironda_piloto_commercial_due_mvp196`:
- Una ronda sin `supplier_media_quotes_mvp098` se omite del selector,
  conservando el cierre cron normal y sus datos: **no gana nadie**.
- Una ronda con presupuesto pero sin fuente verificada suma una alerta
  `skipped_unverified`, **sin planificarla ni bloquear otra**.
- Se inspecciona una ventana acotada de hasta 10 veces `p_limit`
  (máximo 100 candidatas), y se devuelve un máximo de `p_limit`
  rondas probadas `private_inputs`. No se saltea evidencia insegura
  hacia un candidato; si una ronda no está acreditada, se ignora.
- El último control de envío y contacto vuelve a exigir una invitación
  con estado `prepared`. Una invitación cancelada invalida incluso
  un certificado antiguo HMAC/SHA v9. La primera planificación también
  exige invitación vigente, no solo que la fila exista.

## Pruebas de aceptación

PostgreSQL17, transacción reversible, incorpora una solicitud cerrada
sin ofertas, otra con presupuesto de fuente incompleta y una tercera
v9 válida. La consulta limitada a un candidato debe encontrar solo la
última, `skipped_unverified=1`, sin falsos finalistas. Comprueba
invitación cancelada y rehabilitada, revocación del comprador/proveedor,
fuente sustituida o texto posterior, enlace privado vencido/revocado,
ACL, RLS y modo sin mensajes.

## Restricciones

- No se instala la nueva RPC ni se activan envíos; siguen pendientes
  autorización `Publicalo` para solo PILOTO, un smoke read-only del
  Edge, una nueva ronda prospectiva, cierre real, ranking homogéneo,
  originales descargables y prueba E2E.
- La ventana 10× es un control acotado del piloto, no un scheduler
  multiempresa a gran escala: monitorizar `skipped_unverified` antes
  del despliegue masivo para evitar silencios.
- Sin cambios de `main`, producción, WhatsApp, identidad o compras.
