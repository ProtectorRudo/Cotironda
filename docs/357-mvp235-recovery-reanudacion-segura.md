# Decisión 357 — El reloj del pedido no es el reloj de la reanudación (MVP235)

## Hallazgo
MVP233 permite continuar, horas después, un pedido de IA Central terminado en
`needs_zone`. La RPC vuelve a poner ese intento en `reserved` sin modificar
`created_at`, que representa la creación histórica del pedido. El cron de
conciliación MVP230 usaba exclusivamente ese timestamp y podía enviar el intento
recién reanudado a revisión en la siguiente ejecución (cada cinco minutos).

## Cambio de seguridad
Se modifica solo el reloj efectivo de las **reservas de compradores** en
`cotironda_piloto_privado.ai_central_reconcile_mvp230`:

`greatest(a.created_at, coalesce(z.claimed_at, a.created_at))`

donde `z` proviene de la asociación unívoca `ai_zone_replies_mvp233`.
La regla se aplica al restablecimiento desde una ronda persistida,
al envío a revisión y al conteo pendiente; un mensaje reservado que no fue
reanudado conserva la conducta original. No se altera `created_at`.

## Límites
- Exclusivamente Supabase `cotironda-piloto`; sin afectar producción.
- No se llama a OpenAI, Whapi, ni a funciones de envío.
- No se reintentan `api_accepted` ni `uncertain`.
- Los controles de creación, despacho y ventana temporal permanecen OFF.
- Conserva la conciliación de presupuestos y leases de proveedor previa.
- La función vive en esquema privado; sin acceso EXECUTE para público.

## Criterios
PG17 con ROLLBACK: reanudación reciente de pedido antiguo no se interrumpe,
reanudación efectivamente vencida pasa a revisión, ausencia de reanudación
continúa cerrándose, cuotas/reintentos y permisos no se relajan.
Requerida verificación de SQL ejecutado en piloto y luego E2E real mañana.

## Instalación y verificaciones del piloto (5/11/2026)

- SQL instalado como `piloto_mvp235_recuperacion_segura_zona` en el
  proyecto Supabase exclusivo `cotironda-piloto`.
- Workflow PG17 de MVP235 en GitHub Actions: **SUCCESS** tras corregir
  el cierre del cuerpo PL/pgSQL detectado en la primera ejecución.
- Verificación SQL remota: definición activa usa la antigüedad efectiva de
  la última reanudación, consulta `dry_run` sin pendientes.
- Privilegios: `anon` y `authenticated` no ejecutan el RPC privado.
- Cron de conciliación activo. Tres controles de IA desactivados; tres
  rondas históricas conservadas; cero respuestas de zona consumidas.
- No se modificaron las rondas, no hubo salidas Whapi ni despliegues a
  producción. La prueba E2E con WhatsApp real queda pendiente.
