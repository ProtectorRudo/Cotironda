# Cotironda V2-23 — zona faltante continúa por catálogo V2, no por M221

**Fecha:** 13/11/2026 · **Estado:** rama de desarrollo, no publicado, no se enviaron mensajes · PR #836.

## Bloqueo descubierto en código REAL

La ruta del comprador con **zona de entrega informada desde el principio** ya usaba `ai-central-buyer-v2-d013.ts`, que mediante `puente-sql-rondas-v2-d013.ts` prepara la ronda en la **RPC V2** `cotironda_piloto_v2_shadow_prepare_d013`. La migración para esa RPC y el calendario están preparados en V2-21/V2-22, con sus pruebas PG17, pero **no instalados**.

Sin embargo, la ruta muy frecuente de **pedido sin localidad, seguida de «La Plata»**, seguía importando `ai-central-zone-mvp233.ts` desde el snapshot vivo de Whapi v76. Esa continuación emplea `planificador-piloto-mvp220.ts` y `puente-sql-rondas-mvp221.ts`, que trabajan con M221 histórico y excluyen correspondencias si el rubro difiere.

**Consecuencia de negocio:** dos arquitectos que piden el mismo cemento podrían obtener proveedores diferentes simplemente porque uno informó la localidad en el primer mensaje y el otro al responder la única pregunta de zona. Este problema existiría **aunque** la RPC V2 y calendario fueran instalados correctamente.

## Corrección V2-23

Se creó `supabase/functions/cotironda-piloto-whapi/ai-central-zone-v2-d013.ts` a partir del controlador M233, preservando sus verificaciones:
- mismo mensaje original cifrado, HMAC y SHA256 exacto;
- la localidad se agrega solo al **contexto de lectura**, no a la fuente original persistida;
- ningún producto sin cita literal en el mensaje original;
- sin reintentos económicos cuando el resultado SQL es incierto.

**Únicamente sus imports cambian a:** `planificador-piloto-v2-d013.ts` + `puente-sql-rondas-v2-d013.ts`. Ambos caminos de arquitecto ahora invocan exclusivamente `cotironda_piloto_v2_shadow_prepare_d013` para preparar solicitudes. Si la nueva RPC está ausente o rechaza una operación, el trabajador **no recurre al M221**: devuelve conciliación, no intenta publicar ni enviar WhatsApp.

El generador `scripts/piloto/v2-live76-candidate.mjs` mantiene su SHA de referencia y las prestaciones de la Edge v76 que funciona, sustituyendo solo los imports del comprador inicial V2 y del controlador de zona V2. **No modifica el index histórico ni la Edge publicada.**

Pruebas `tests/unit/v2-23-continuacion-zona-ruteo-v2.test.mjs`:
1. misma solicitud con localidad de entrega informada y otra en dos mensajes ⇒ ambas invocan **solo la RPC V2**;
2. cemento Portland pedido como obra gruesa y listado como ferretería por el proveedor: coincide por producto, no por etiqueta comercial;
3. SHA incorrecto, localidad distinta, material sin prueba original y SQL V2 ausente: fallan cerrados, sin fallback ni envío;
4. generador construye el overlay a partir de snapshot v76 y conserva las comprobaciones de autenticidad y los módulos vigentes;
5. pruebas generales de D013, calendario, aislamiento PG17, Node y Deno typecheck de Whapi siguen como barrera.

CI: `.github/workflows/cotironda-v2-d013-plazo-habil-pg17.yml` ejecuta las pruebas nuevas. El preflight Edge v76, separado, sigue verificando que no se pierde funcionalidad heredada.

## Qué NO cambió y falta para una prueba comercial real

- **NO** se modificó `cotironda-piloto-whapi` activo v76, código principal `index.ts`, migraciones reales de Supabase, la Preview de Vercel, mensajes Whapi o SMS.
- La integración del webhook candidato **todavía usa `publicar:false`** en sus llamadas y contiene caminos heredados de confirmación/aviso. Por lo tanto **este cambio no activa distribución automática** ni debe presentarse como el flujo comercial 100% terminado. Es una precondición para no dividir pedidos por diferencias artificiales de rubro.
- Para cumplir la regla V2 de **cero confirmaciones adicionales del comprador**, queda adaptar el control de publicación y retirar los pasos de revisión históricos del candidato V2 **solo cuando** se pueda verificar en SQL que están autorizados el calendario real, la ronda y los proveedores. No activar `publicar:true` sin esas barreras, porque heredaría plazos o invitaciones de la V1.
- V2-21 y V2-22 deben instalarse **solo con «Publicalo»** en Supabase PILOTO. La política de dos días hábiles sigue OFF y necesita calendario nacional + provincial + local por año acreditado; el usuario no tiene que informar feriados.
- También falta primer comprador con sesión Auth OTP SMS real, consentimiento V2 prospectivo de dos proveedores, enlace privado, originales y breve análisis, vencimiento e informe final, todo verificado WhatsApp→navegador.

## Criterio de cierre para V2-23

**Desarrollo:** pruebas de ambos caminos del comprador sobre RPC V2, sin llamadas M221, fuente original verificada, Deno/Node/PG17 y sin alterar archivo activo.

**Publicación:** requiere orden específica «Publicalo», SHA en entorno real y prueba piloto. **No confundir pruebas sintéticas con WhatsApp real.**
