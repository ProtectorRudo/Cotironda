# Decisión 449 — MVP319: continuar sin respaldo, con pruebas aisladas del circuito de despacho/aviso

**Fecha:** 08/11/2026 (ART). **Orden del responsable:** «Avancemos sin respaldo». **Alcance:** código y pruebas en rama de desarrollo; no desplegar a Supabase piloto, Vercel, Whapi ni producción y no activar gates/cron.

## Alcance real de la prueba MVP319

Combinamos **código real** de `continuarDespachoMvp314`, `despacharSolicitudCentralMvp223` y `avisarCompradorTrasLoteMvp315`, inyectando SQL RPC y un transporte Whapi **ficticios, sin conexiones HTTP**. El escenario empieza desde una ronda **ya interpretada/publicada** y contiene materiales sintéticos y números imposibles de contactar porque no existe envío real. Incluye:
- Un pedido preparado en La Plata y 2 proveedores: dos leasing/ID remoto aceptados -> un aviso privado al comprador -> reejecución idempotente, sin segundo aviso.
- 5 proveedores: dos por tick, tres ticks; no se notifica al comprador antes de los cinco ID aceptados.
- Una confirmación remota incierta: se conserva `uncertain`, no se reenvía, no se anuncia al comprador.
- Revocación del comprador inmediatamente antes del envío: el aviso se detiene y no se reintenta.
- Gates apagados: cero llamadas SQL y cero salidas.
- El enlace del comprador se genera con token efímero de 256 bits; no se revela al proveedor.

**No es E2E real:** este test no cubre entrada WhatsApp del arquitecto, interpretación de IA documental, creación de rondas reales, descarga/recepción de presupuestos PDF/Excel, comparación comercial, publicación en la vista, cierre, contacto ni disponibilidad de Whapi. Es una regresión de **despacho y aviso**. No asumir que al pasar habilita los envíos.

## Whapi: posible ruta gratuita, no activada

La página oficial de [Whapi precios](https://whapi.cloud/es/price) anuncia **Developer Sandbox gratis** (aprox. hasta 5 conversaciones activas/mes, 150 mensajes/día, 1000 solicitudes API/mes, 30 verificaciones de números por día). Es una alternativa para una prueba **acotada** con un comprador y dos proveedores, siempre que los límites permitan esos chats y el propietario pueda habilitarla para el **mismo canal** del piloto. Es distinta del plan Developer Premium mensual.

Antes de utilizarla, comprobar desde el panel de Whapi, sin imprimir tokens:
1. ¿El canal vinculado actual puede pasar a **Sandbox gratis**, o requiere crear/reenlazar otro canal? Verificar estado real, límites y vigencia.
2. ¿Se mantienen credenciales, número y webhooks, o hay que actualizar secrets de Supabase? No tocar keys sin decisión explícita ni inventar endpoints.
3. Contar chats reales que consumiría la prueba (comprador + 2 proveedores = **3**, si los tres son conversaciones activas nuevas). Reservar margen, verificar acumulados previos y no superar cuota.
4. Verificar que Sandbox admite envío/recepción de archivos PDF/Excel y webhooks requeridos. Probar con **un único mensaje controlado** solo después de autorización explícita de publicación y cuenta activa.
5. No automatizar reintentos: una respuesta ambigua de WhatsApp obliga conciliación, nunca doble despacho.

## Criterios de aceptación

- [x] Se diseñó una prueba integrada offline usando tres módulos reales y dobles de transporte/SQL; sin cambios de esquema ni consultas a datos personales.
- [ ] GitHub CI Node 22 verifica los cinco escenarios y pruebas previas; no declarar aprobado antes de revisar último SHA.
- [ ] Confirmación de Whapi Sandbox en la cuenta concreta, con límites no superados.
- [ ] Backup real **no existe**; no instalar migraciones sobre datos reales sin plan de recuperación explícito.
- [ ] Publicación real del piloto requiere orden «Publicalo», preflight de hashes/permiso y WhatsApp verificablemente operativo.
- [ ] La E2E real completa sigue pendiente.

## Contención de costos y seguridad

El test es gratuito y no consume OpenAI API, Supabase externo, Whapi ni Vercel. El modo Sandbox es una **posibilidad comercial**, no una credencial comprobada. Los cupos del worker MVP314 (20 intentos globales, 8 por comprador) **no sustituyen** los límites mucho más bajos de Sandbox. Para una prueba real hay que aplicar el menor de ambos límites y evitar invitaciones adicionales.

**Decisión:** continuar aumentando la confianza del circuito sin respaldos ni gastos, sin confundir pruebas aisladas con el piloto real listo. Mantener todo OFF y comprobar manualmente la cuenta Sandbox antes de nuevas invitaciones.
