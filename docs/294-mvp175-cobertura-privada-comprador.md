# MVP175 — Cobertura comercial en el seguimiento privado

**04/11/2026 · Solo desarrollo · #529 / #535.** Continúa MVP174/PR #549.

## Objetivo

El comprador visualiza un resumen de cobertura en la página existente cotironda.com/seguimiento mediante su enlace privado de WhatsApp. No se pide una nueva cuenta, formulario ni confirmación al comercio. Son **conteos de cruces entre artículos y cotizaciones**, nunca un ranking por precio ni una certificación de identidad técnica.

## Seguridad y arquitectura

1. El navegador conserva el enlace de 256 bits en el fragmento de URL y lo envía por HTTPS POST al endpoint de seguimiento, no por GET.
2. La Edge de seguimiento consulta la RPC MVP091 actual. Solamente con estado waiting/closed y can_open=true consulta la nueva RPC privada MVP175.
3. MVP175 vuelve a comprobar hash del token, expiración, revocación, rol/consentimiento del comprador y estado de ronda; no acepta que el navegador elija un request_id arbitrario. Reutiliza el selector privado MVP172, con EXECUTE solo para service_role.
4. El módulo resumen-cobertura-comprador-mvp175.ts utiliza el diagnóstico real MVP172/174 para reducir todo a números acotados por ronda. **No hay mensajes, originales, HMAC, SHA, teléfonos, nombres de proveedores ni importes en la respuesta adicional**.
5. La vista site/seguimiento muestra coincidencias comerciales, envases sin acreditar, casos aún no evaluados y diferencias. Solo texto seguro (textContent), con verificaciones de banderas, cantidades enteras y consistencia. El resumen desaparece al revocar, cancelar o invalidar el enlace. Ningún precio se recalcula en el navegador.
6. Si la verificación de cobertura falla, se omite el resumen sin romper el seguimiento habitual ni publicar datos parciales.

**Ejemplo de lectura:** 2 proveedores que cotizan 3 artículos generan 6 cruces de cobertura; no son 6 presupuestos distintos.

## Ensayo real de permisos, sin persistencia

El SQL exacto del nuevo selector se ejecutó en PostgreSQL 17 de cotironda-piloto dentro de BEGIN/ROLLBACK, **sin instalarlo**. Dos enlaces de comprador vigentes recuperaron **2 rondas / 4 presupuestos / 5 artículos** sin mostrar tokens ni hashes. Permisos: anon=false, authenticated=false, service_role=true. Hash adivinado o formato inválido respondió not_found. Se confirmó ROLLBACK.

## Pruebas

- Suite MVP175 de fuente y privacidad: las dos rondas representativas, restricciones v9/SHA, estado, datos ajenos, permisos de SQL y contrato Edge.
- Suite MVP175 DOM: navegador simulado, visualización legítima, cancelación y revocación, datos malformados, no filtración de campos adicionales.
- CI Deno compila el entrypoint exacto de la Edge de seguimiento, además de los checks habituales de Next.js, PostgreSQL, PostgREST, unitarios y web.
- **La RPC ya está instalada SOLO en cotironda-piloto; la nueva Edge y la web del comprador NO están desplegadas/publicadas**. PR de desarrollo apilado sobre #549. No se enviaron WhatsApp ni se habilitaron ranking, finalistas o descarga de originales.

## Próximos criterios de aceptación

Tras CI verde: revisar ACL y permisos con un nuevo ensayo; integrar en PILOTO solamente bajo revisión de rollback, validar con los dos enlaces reales y comprobar que ninguna empresa vea otra ronda. Para precio comparable y descarga de TODOS los originales tras cierre aún faltan reglas y verificaciones independientes.
## Comprobación de instalación en PILOTO — 04/11/2026

- Después de las 2.028 pruebas unitarias PASS y **6/6 checks GitHub CI PASS** del código, se instaló la migración aditiva `mvp175_buyer_coverage_token_gated_pilot_only` exclusivamente en el proyecto Supabase `cotironda-piloto`. No se alteraron tablas, cotizaciones o mensajes.
- El smoke POST-instalación confirmó: `rpc_installed=true`; `anon_can_execute=false`; `authenticated_can_execute=false`; `service_can_execute=true`; 2 enlaces vigentes recuperaron 2 rondas, 4 ofertas y 5 artículos. Hash falso devuelve `not_found`. 0 outbox a finalistas, 0 finalistas activos.
- Se guardó `supabase/piloto/mvp175_buyer_coverage_smoke_readonly.sql` para repetir esa auditoría sin imprimir ningún token ni hash.
- **La Edge de seguimiento actual y el sitio Cotironda NO se desplegaron** en este avance. Activar la vista es una etapa posterior: requiere verificar rollback, comprobar enlace real en navegador y revisar cuota de Vercel. No se habilitan ranking, contacto, originales descargables ni adjudicaciones.
- Las pruebas del navegador incluyen ahora el caso en que un enlace se revoca o la red falla *después* de mostrar datos: la vista elimina las ofertas antiguas para que no queden visibles.
