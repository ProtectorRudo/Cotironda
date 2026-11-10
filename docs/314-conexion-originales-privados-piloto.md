# Conectar originales privados a comprador verificado — desarrollo

Alcance acotado: une la protección HTTP ya existente (MVP190), el selector
privado de archivos (MVP192) y el control de identidad telefónica del mismo
proyecto PILOTO (MVP191), **sin crear ningún endpoint HTTP ni habilitar envíos**.

## Circuito diseñado

1. El servidor verifica por Supabase Auth **PILOTO** la sesión real, su
   `auth.sessions`, el teléfono confirmado y el vínculo con la empresa.
   Nunca acepta ID de usuario, empresa, sesión, teléfono o token del navegador.
2. Un RPC autenticado con el JWT normal de ESA sesión verifica por ronda el
   vínculo WhatsApp↔Auth (MVP191), sin `service_role`.
3. Para listar originales, un RPC **exclusivo del servidor** (MVP192, con
   `service_role`) recibe IDs del usuario y `session_id` obtenidos de
   Auth, no del request. Selecciona **todos** los documentos de proveedores
   consentidos y sus revisiones vigentes, sin depender de ranking.
   El catálogo enviado al comprador se reduce a etiquetas neutrales, formato
   e ID opaco: sin identidad, ruta, hash ni teléfono.
4. Para descargar, el mismo RPC server-only obtiene evidencia de **un** ID
   opaco. El nuevo adaptador convierte esa evidencia a la barrera MVP161,
   construye `sesion` SOLO desde Auth verificado, rechaza empresa o ronda
   distinta y entrega el control al manejador MVP190.
5. MVP190 lee los bytes exclusivamente de Storage privado, verifica SHA-256,
   vuelve a comprobar sesión, vínculo, consentimiento y misma fuente después
   del I/O y responde attachment con no-store. Ni URLs firmadas ni documentos
   históricos pasan al comprador.

## Límites y activación

- Es un **servicio sin ruta expuesta**. No instalar funciones SQL, política,
  OTP ni configurar SMS, portal, Vercel, Whapi, dominio, `main` o producción.
- `habilitado` debe quedar **false** hasta que existan Auth PILOTO real,
  consentimientos prospectivos por proveedor y ronda nueva realmente cerrada.
- El callback `verificarSesionAutentica` exige JWT validado (no
  `getSession` sin verificación) más empresa actual, y el callback
  `verificarVinculoPiloto` deberá realizar RPC MVP191 bajo ese JWT.
- El código de unión aún no implementa el SDK de Supabase, OTP, ruta Next.js,
  interfaz de descargas ni rate limiting, por lo que **NO hay descarga real
  publicada ni un E2E positivo**.
- Nunca usar el enlace privado de seguimiento WhatsApp para obtener originales.

## Pruebas de aceptación

`tests/unit/originales-piloto-conexion-segura.test.mjs` comprueba:
catálogo completo con lista blanca, sesiones de diferente identidad, revocación
antes y después de Storage, SHA de bytes, fuente reemplazada, consentimiento
ausente, rondas/empresas cruzadas, URLs inválidas, bandera OFF, datos de SQL
inyectados, y cero exposición de secretos. Requiere CI completo verde.

## Estado PILOTO al auditar (04/11/2026, consulta solo lectura)

- 4 fuentes originales archivadas; 0 rondas cerradas.
- 0 usuarios y 0 sesiones en `auth` del PILOTO.
- La política de consentimiento MVP178 y el selector MVP192 **no instalados**.
- No usar los cuatro archivos históricos para demostrar una autorización
  prospectiva inexistente.

## Criterio de publicación futura

Con autorización `Publicalo en cotironda-piloto`:
realizar backup/preflight, instalar política **OFF**, OTP Auth con
proveedor autorizado y gasto aprobado, probar cuenta genuina, empresa A/B y
consentimiento nuevo; luego instalar funciones, cablear endpoint + UI con
rate-limit y ensayar descarga real, hash, revocación y regresión. Hasta entonces
conservar todas las vías de descarga inactivas. Reversión: deshabilitar flag,
retirar endpoint, y después revertir SQL si se hubiera instalado.

Issues #525/#529: **siguen abiertos**.
