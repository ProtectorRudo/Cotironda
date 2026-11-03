# MVP148 — Despacho por pedido auténtico, sin ventana temporal artificial

03/11/2026 · [Issue #501](https://github.com/ProtectorRudo/Cotironda/issues/501). Exclusivamente `cotironda-piloto` (`ilggkalaafhtiysyzlmg`); no modificar main/producción.

## Diagnóstico real
El arquitecto reenvió a las 16:30 Argentina, la función Whapi v41 captó 3 líneas exactas, creó ronda `469cb459-5f00-49c2-b0b9-bc8b11e5c900` y el enlace privado tuvo resultado `api_accepted`. Las dos invitaciones y dos PDF outbox quedaron `pending` sin `leased_at`. Predicados de envío devolvían `false`: la tabla `next_round_window_mvp091` había vencido antes de la nueva ronda y el predicado legado solo aceptaba cemento/hidrófugo. `allow_document_send_mvp099` es para archivos con doble lectura, no aplica a este pedido de texto. Los dos proveedores tienen arena_fina, piedra_partida y cemento_gris_obra `curated_family`.

## Decisión técnica
Reemplazar **solo** `cotironda_piloto_privado.allow_next_pilot_send_mvp091(uuid,text)`, conservando la firma exacta y los RPC `claim_whapi_v1` y `authorize_whapi_v1`. Aceptar múltiples rondas reales del único comprador autorizado; usar origen confirmado en `whapi_inbox` + `source_hmac` + chat del comprador. Mantener autorización por solicitud (ronda abierta, invitado preparado, catálogo curado por cada uno de todos los renglones, proveedor identificado, zona, consentimientos vigentes, BAJA, sin oferta previa, 1..8 renglones). Los teléfonos nunca se consultan por SQL ni se exponen. Únicamente los dos proveedores existentes del ensayo.

No crear nuevas invitaciones ni lease, ni retransmitir mensajes `uncertain`; al cambiar el SQL las dos filas permanecen `pending` hasta una ejecución legítima del transportador Whapi con webhook autenticado. El frontend de seguimiento sigue pendiente por separado (Issue #497).

## Verificación y rollback
1. Ejecutar en `BEGIN` / `ROLLBACK` el `CREATE OR REPLACE FUNCTION` + SELECT para autorización exacta: 2 autorizados, remitente ajeno denegado y vieja ronda con ofertas denegada, sin claims.
2. Después de CI y comparación, aplicar una sola vez SQL de `supabase/piloto/mvp148_per_request_catalogue_dispatch.sql` únicamente a PILOTO.
3. Comprobar ACL (`anon`, `authenticated`, `service_role` sin `EXECUTE` en función privada), regresiones CI y estado de colas.
4. Para comprobar el transporte verdadero, usar un evento WhatsApp legítimo del contacto de prueba; jamás inyectar webhooks sin autenticación ni llamar `claim` manualmente. Revisar `api_accepted` y mensaje ID real.
5. **Rollback**: restablecer el cuerpo versionado en `supabase/piloto/mvp091_next_round_limited_dispatch.sql` con `CREATE OR REPLACE`, sin borrar filas existentes. Implicaría volver a bloquear nuevas rondas si su ventana expiró. La cola conserva el estado.

No alterar valores económicos, privacidad ni producción.
