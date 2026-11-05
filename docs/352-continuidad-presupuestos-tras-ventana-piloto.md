# Decisión 352 — Continuidad de respuesta sin habilitar nuevos envíos

Fecha: 2026-11-05. Referencias #597 y #529. Único proyecto activo: `cotironda-piloto`.

## Problema verificado

La prueba MVP229 admite nuevas solicitudes IA durante **90 minutos**,
mientras las rondas creadas dentro de esa ventana pueden permanecer
abiertas **5 días**. El webhook exigía que el permiso de prueba
estuviese aún activo también para asociar y leer la respuesta del
proveedor. En consecuencia, una cotización recibida luego del
vencimiento quedaba archivada sin análisis, incluso si era respuesta
a un PDF auténtico ya despachado.

## Resolución

- El comprador **solo puede crear/publicar y enviar mientras**
  `ai_trial_control_mvp229` esté activo y los gates privados MVP226
  y MVP222 lo autoricen. Nada extiende la ventana ni permite nuevos
  despachos después del cierre.
- El proveedor `corralon_ailin`/`corralon_nahuel`, consentido y
  no dado de baja, puede **responder hasta el cierre** de una ronda IA
  si existe un despacho propio `api_accepted` con ID Whapi real y
  hora de aceptación. Trabajo `pending`, `leased` o `uncertain`
  **no habilita** el análisis de ofertas.
- La prueba puede vencer e incluso apagarse administrativamente:
  la respuesta a un trabajo previamente aceptado continúa solo por
  vínculo mvp225, verificación SHA/AES y cuota mvp227. El RPC entrega
  `state='continuation'` y `quote_link=true`, pero siempre
  `buyer=false` y `dispatch=false`.
- El cálculo económico continúa privado por rubro; no adjudica,
  revela contactos ni publica documentos sin los permisos de cierre.

## Casos de prueba

PG17 sintético, con rollback, verifica que el proveedor siga habilitado
tras expirar la ventana y apagar los tres gates, mientras que el comprador
queda deshabilitado. Si un despacho previo se vuelve `uncertain`,
el proveedor ya no queda autorizado por ese único envío. Contactos
ajenos y roles públicos no tienen acceso. Las pruebas del webhook
aseguran que nunca se despache sin una ronda nueva publicada.

Limitación que permanece: aún hace falta completar la prueba E2E con
WhatsApps y la recuperación de archivos PDF/Excel/fotos, zona faltante,
cierre y originales. La continuidad se aplica únicamente a mensajes
legítimos de una ronda nueva, no a invitaciones históricas.
