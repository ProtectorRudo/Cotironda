# 186 — MVP-066: WhatsApp único con dos roles registrados, sin modo degradado

**01/11/2026 · Issue #345 · Código únicamente, sin Whapi conectado ni despliegue.**

## Regla central aprobada

El número conectado a Whapi es **el número de Cotironda**. Al escribirle, el backend comprueba el **chat entrante real** mediante evento autenticado de Whapi + vínculo privado, previamente verificado, por canal/HMAC del número. Nunca interpreta la palabra «presupuesto», el nombre de contacto o un atributo JSON aportado por el remitente para asignar rol.

- **Arquitecto/comprador habilitado:** ingreso a inbox cifrado comprador D074. D073/D081 preparan su pedido, consulta zona imprescindible si falta y D065/D080/D071 seleccionan únicamente negocios con artículos **activos, declarados y curados**, zona atendida y consentimiento vigente.
- **Negocio/proveedor habilitado:** ingreso a inbox cifrado proveedor D028 asociado a una **única ronda abierta inequívoca**, empresa y consentimiento. D062/D061/D093 preservan el texto original de WhatsApp íntegro y versionado, aunque contenga ítems no pedidos, pallets vacíos, bolsones, flete, descuentos o total divergente. Interpretación/comparación separadas. Si hay dos rondas simultáneas no vinculadas, no adivinar; requiere mecanismo seguro de asignación pendiente.
- **Número sin vínculo, con doble rol, dado de baja o revocado:** ninguna solicitud o cotización atribuible automáticamente. Alta necesita prueba real de control del teléfono y autorización del responsable de la empresa.
- **Al cierre:** anonimato antes del cierre; hasta **dos finalistas por rubro/canasta comparable** (UX-002), solo si cobertura y costos permiten una comparación legítima y ambas partes consienten revelar contactos. No mostrar perdedores ni adjudicar compras dentro de Cotironda. Si no se puede comparar, no inventar ganadores.

## Qué agrega exactamente esta iteración

La ruta Preview D083 activa `exigirAmbosRoles: true` en el receptor D027. Se comprueba que están instalados los **seis puertos requeridos** (resolver/persistir/BAJA de ambos roles), antes de inspeccionar mensajes y antes de escribir. Si falta alguno, se devuelve HTTP 503 y no se promete que el WhatsApp central funciona parcialmente. La función D027 conserva comportamiento histórico solo-proveedor cuando el nuevo requisito no se habilita.

Prueba `tests/unit/mvp066-whapi-central-roles.test.mjs`: falso 503 cuando falta port comprador u opt-out; en camino completo, comprador a inbox comprador, proveedor a inbox proveedor/ronda; desconocido/duplicidad rechazados; compatibilidad histórica sin flag.

## Límites: aún no hay piloto live

El receptor existente distingue ambos roles **solo con vínculos ya registrados**. Falta construir/validar alta voluntaria de compradores por teléfono, instalar infraestructura privada y respaldos/restore auténticos de Supabase DEV (#175), conectar Whapi y su webhook HTTPS con secreto privado y prueba con números autorizados, cargar proveedores/catálogos reales, tratar PDF/Excel/Word/fotos y almacenar bytes originales inmutables en Storage privado.

D093 cifra/conserva texto íntegro en inbox, pero la **pantalla real del comprador todavía no muestra la fuente completa**. No presentar la vista parcial D060 como el presupuesto entero. Falta cierre real con divulgación consentida y auditable a los dos finalistas. El prototipo `/probar/whatsapp` sigue siendo simulación del navegador.

**Prohibido publicar o instalar SQL en Supabase DEV/producción por este PR.** No modifica `main`, Vercel, Whapi, credenciales, teléfonos ni bases de datos. La emisión real sigue apagada por defecto.
