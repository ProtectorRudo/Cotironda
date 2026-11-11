# Acta 504 — B5k + B5l: publicación controlada y prueba privada de PDF histórico 2

**Fecha:** 11/11/2026. **Autorización:** «Publicalo» para **`cotironda-piloto` exclusivamente**.
**Código fuente desplegado:** `339330f88d7539d953f7eec239f236fa99eb0236`, [PR #776](https://github.com/ProtectorRudo/Cotironda/pull/776), apilado sobre [#775](https://github.com/ProtectorRudo/Cotironda/pull/775), ambos sin merge.
**Estado:** desarrollo publicado solamente como servicio privado en Supabase piloto; no Vercel, WhatsApp ni producción. Se mantienen los PR en draft.

## Revisión previa

- GitHub: **6/6 workflows SUCCESS** sobre el commit fuente, incluidos Node, Deno PDF.js, PostgreSQL 17 con ROLLBACK, aislamiento/PostgREST y Next.js. Regresión B5l: **3.901 tests**, 3.891 aprobados, 10 omitidos, cero fallidos.
- Edge anterior: `cotironda-piloto-v2-shadow` **v7 ACTIVE**, 20 archivos, autenticación interna vigente. Todos los flags apagados. B5k no instalado, B5j 2 privados, B5i 2, B5h 2, B5g 2, B5d 3; **un único PDF histórico B5j con `currency_ambiguous`**, cero ofertas públicas anónimas y cero mensajes salientes pendientes.
- Supabase changelog actual y guía RLS/deployment consultados. No se introdujeron paquetes nuevos ni se cambiaron credenciales.

## Instalación

1. Migración `cotironda_v2_b5k_private_currency_source_with_b5l_20261111` aplicada **con éxito** en el proyecto `ilggkalaafhtiysyzlmg`: flag privado `b5k_only` **FALSE por defecto**, exclusión de modos B5h/B5i/B5j, nueva tabla `cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k`, RLS ON y RPC de claim/finish restringidas a `service_role`.
2. Postmigración: todos los flags OFF, tabla nueva vacía; roles `anon` y `authenticated` sin SELECT ni EXECUTE en RPC privadas, claim devuelve `disabled`.
3. Edge sombra desplegada: **v8 ACTIVE**, 23 archivos, SHA de empaquetado `d4adbd590a5c4381e9fabdd0fe0cb746bb651438f046f706b1c68b044376c40b`. Se conservaron las 20 dependencias previas salvo los tres módulos con cambios específicos (entrypoint, handler, conciliación B5j), y se agregaron los tres módulos nuevos (cotejo B5k, trabajador B5k, cobertura B5l). Preservadas autenticación interna, lector/documentos WhatsApp y ausencia de llamadas LLM de B5k/B5l.
4. Se habilitó **temporalmente** `enabled=true,b5k_only=true,b5h_only=false,b5i_only=false,b5j_only=false`, solo para la relectura histórica privada. Se llamó exactamente **una vez** al puente interno existente con token leído de Vault *dentro de la base*, sin exponer el secreto. `pg_net` solicitud **2475**, HTTP **200**.
5. Se creó **un diagnóstico** B5k en estado `private_diagnosed`; cero leases. Se apagaron los **cinco flags** y se confirmó en SQL `enabled=false,b5h_only=false,b5i_only=false,b5j_only=false,b5k_only=false`; la RPC de claim vuelve a devolver `disabled`.

## Diagnóstico del PDF histórico 2 — datos anonimizados

| Control | Resultado observado |
|---|---|
| Origen | PDF único histórico con B5j `currency_ambiguous` |
| Estado | `private_diagnosed` |
| Moneda | `uniform_dollar_symbol_iso_unstated` |
| Materiales con total y precio unitario respaldados por símbolo en original | 3/3 y 3/3 |
| Símbolo en celda del total candidato | Sí |
| **Moneda ISO (ARS/USD) certificada** | **NO** |
| Comprobación económica | `fiscal_or_freight_ambiguous` |
| Materiales con aritmética individual cotejada | 3/3 |
| Condiciones localizadas por conciliación B5j | 5/5 |
| Balance económico final | **No establecido** |
| Cobertura B5l | `line_assignment_ambiguous` |
| Renglones visibles del PDF.js | 13, una página |
| Filas atribuidas cuando B5l se detuvo | 8; restantes 5 **no evaluadas completamente**, no necesariamente omitidas |
| Líneas fuente cotejadas | 5/5 |
| Condiciones atribuidas por B5l al detenerse | 4/5 |
| Publicable / rankeable / revelar contactos | **NO / NO / NO** |
| Fuente verificada / cobertura total | **NO / NO** |

### Bloqueos específicos descubiertos

**Flete sin tratamiento económico probado:** en los datos extraídos hay una mención expresa de **flete** que no declara precio ni expresa que esté incluido o sea gratuito. Hay también una mención a entrega. **No inferir flete cero, incluido ni cobrado aparte.** B5j lo clasificó correctamente como `fiscal_or_freight_ambiguous`; todavía NO se verificó el balance final de la factura. No se detectó mención explícita de IVA en estas condiciones, lo cual **no** significa que IVA esté incluido o excluido.

**Atribución de condición dentro del renglón:** B5l cotejó las cinco líneas documentales, pero encontró una condición comercial cuyo texto se superpone con una fila material. El algoritmo se detuvo en `line_assignment_ambiguous` tras cuatro condiciones de cinco; no afirmar que cinco filas estén omitidas, pues el censo quedó detenido antes del final. Debe corregirse la atribución de subceldas/segmentos dentro de la misma fila con evidencia PDF.js, sin descartar condiciones ni duplicar valores.

### Seguridad y efectos comprobados

- En postflight, **cinco flags OFF**, RPC de claim `disabled`, un resultado B5k completo, cero leases.
- Las auditorías previas **B5d=3, B5g=2, B5h=2, B5i=2, B5j=2** sin cambios.
- **Cero versiones nuevas de oferta** creadas durante la prueba; **cero ofertas anónimas públicas**, cero WhatsApps pendientes.
- Tabla B5k RLS ON, roles públicos sin acceso SELECT/claim/finish. Supabase Security Advisor devuelve `rls_enabled_no_policy` (INFO) para tabla privada: es intencional porque el acceso está restringido a servicio.
- **No** se publicaron propuestas ni contactos; no hubo modificaciones en Whapi, Vercel ni producción.

## Siguiente paso comercial recomendado

**No crear otra serie de diagnósticos independientes**. Corregir dentro de B5j/B5l la interpretación de flete no cotizado como condición *no informada* (mantener subtotal verificable y total final sujeto a gastos) y la atribución segmentada de condiciones en filas compartidas. Luego probar presupuesto completo por WhatsApp con compradores y proveedores reales autorizados: registrar ofertas por rubro, cobertura de ítems, subtotales comparables y condiciones faltantes, sin mostrar un total final no certificado; al cierre, revelar identidades según reglas. La moneda ISO no se presupone por el símbolo `$`.

**Alcance de la autorización ejecutada:** solo publicación de diagnóstico privado B5k+B5l en piloto. El circuito E2E **no** se declara finalizado.
