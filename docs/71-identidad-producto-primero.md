# 71 — D014: identidad del producto primero, marca y presentación como variantes

**30/10/2026 · Etapa 02 · Issue #115 · rama `feat/02-product-identity-first` · PR hijo de #114.**

## Decisión del propietario
El **producto que cumple la necesidad de obra** es la entidad comercial principal. **Marca y presentación son variantes**, no la llave de selección de proveedores. Si el comprador no exige una marca, cada proveedor puede ofrecer cualquier marca que comercialice dentro del mismo producto y características requeridas. Si la marca está indicada como **obligatoria**, la restricción se respeta. El comprador no debe corregir cada línea antes de distribución; elige entre propuestas después, al cotizar/adjudicar.

## Identidad propuesta — no confundir familia con equivalencia
La IA debe identificar términos y **proponer** un `producto_id` del catálogo curado (por ejemplo, `cemento`, `hidrofugo`, `placa_yeso`, `cable_unipolar`, `pintura_latex`), junto con las especificaciones críticas explícitas de la solicitud. En código de servidor, una base versionada y revisada valida que el ID y las características realmente correspondan. **Nunca autorizar un SKU solo porque la IA atribuyó el mismo producto_id.**

Orden de comparación para *encontrar candidatos*:

1. **Identidad canónica del producto**, no texto literal ni marca. Dos proveedores que llamen de manera diferente al mismo material pueden entrar al conjunto de candidatos.
2. **Compatibilidad técnica esencial**: clase/resistencia/tipo, aplicación, espesor, aislación, norma y dimensiones según rubro. Diferencias conocidas bloquean; ausencia de información abre **consulta técnica**, jamás equivalencia afirmada.
3. **Marca**: flexible por defecto. Una marca sugerida no excluye otras; una marca **expresamente obligatoria** se respeta.
4. **Presentación/embalaje**: bolsa de 25/50 kg, bidón de 4/5 L, pintura de 18/20 L, rollos, etc. Si unidad base y especificaciones verificadas coinciden, calcular envases enteros y excedente determinísticamente, sin inventar precio.

## Primera pieza de código — aislada y sin efectos
`src/domain/identidad-producto.ts` implementa `planificarPorProducto(...)` sin llamadas a red, almacenamiento, IA o WhatsApp. Consume un `BorradorDocumental`, requisitos autenticados por fila (producto_id, cantidad por unidad, unidad base y atributos críticos verificados) y SKUs **confirmados por proveedor**. Produce `plan_producto_primero_sin_envio`: una solicitud por proveedor/ronda con cada línea agrupada y `opciones` de marcas/presentaciones. No multiplica invitaciones aunque el proveedor tenga varias marcas del mismo producto.

Cada opción es **`producto_compatible`** cuando la identidad y todos los atributos críticos son verificables, o **`consulta_especificacion`** cuando falta certeza técnica. Una contradicción explícita (p. ej., RH/RF, CPC/CPN, 1,5/2,5 mm²) se descarta. Cada opción conserva `comparable_como_identico:false`: aun un SKU compatible necesita respuesta de proveedor, disponibilidad, confirmación de oferta y condiciones para una comparación económica correcta. No hay ranking ni precio en este módulo.

## Ejemplos ficticios

| Pedido | Proveedor confirma | Resultado offline |
|---|---|---|
| 20 bolsas de cemento CPC clase 40 de 50 kg | CPC clase 40 marca A y marca B en 25 kg | Una invitación, dos opciones; **40 bolsas de 25 kg** cada una |
| 4 litros de hidrófugo de formulación verificada | Marca alternativa, envase 5 L | 1 envase, 5 L entregados, excedente 1 L |
| 20 litros de látex interior mate | Marca distinta, envase 18 L, misma base/uso/acabado | 2 envases, 36 L, excedente 16 L |
| Placa RH 12,5 mm | Placa RF 12,5 mm | **No se ofrece como equivalente** |
| Cable unipolar 2,5 mm² PVC | 1,5 mm² PVC o 2,5 mm² XLPE | **No se ofrece como equivalente** |
| Cemento sin tipo/resistencia precisados | SKU de cemento confirmado | Consulta sobre especificaciones, sin equiparar |

## Limitaciones y controles reales pendientes
- Los campos `producto_id`, `atributos_criticos`, `especificaciones_verificadas` y `confirmado_por_proveedor` en estas pruebas se suministran desde **fixtures sintéticos**. Un backend futuro deberá construirlos desde catálogos confirmados, reglas técnicas auditadas y fichas, **nunca confiar en banderas del navegador o salida de IA**.
- No se modificó ni sustituyó `planificarDespachoAutomatico` ni `proponerAlternativasDeCotizacion`; este módulo se prueba como **nuevo candidato** de arquitectura para integrar después de auditarlo.
- El motor **no** declara intercambiables marcas, formulaciones, productos normados ni especificaciones distintas sin evidencia. Para Ceresita/hidrófugo y Tacurú/ligante se mantienen relaciones condicionadas de #112; D014 **no autoriza homologación** ni elimina alertas técnicas.
- La relación costo/beneficio se evalúa más adelante con cotizaciones reales del proveedor: tamaño de envase, cantidad efectivamente comprada, excedente, IVA, flete y pago. No comparar totales de canastas dispares.
- Sin inferencias OpenAI reales, envíos, colas, cambios Supabase/Vercel/DNS ni publicación.

## Evidencia técnica
`tests/unit/identidad-producto.test.mjs` prueba marcas alternativas, marca obligatoria, presentaciones por BigInt, agrupación por proveedor, datos/atributos dudosos, exclusión por rubro/zona/consentimiento, retención de duplicados, productos parecidos, cemento CPC/CPN, placa RH/RF, electricidad y decimales.

Referencias técnicas: [Durlock, placas RH/RF/estándar](https://durlock.com/files/biblioteca/archivos/creditosleedplacasest-rh-rf.pdf); [Durlock, aplicaciones RH](https://durlock.com/files/biblioteca/archivos/ambientes-h%C3%BAmedos-durlock.pdf).

**Nota de alcance:** esta decisión D014 sobre identidad precede y limita la futura política P007 de alternativas funcionales. P007, sus criterios de homologación real, UI/ranking y trazabilidad de catálogos permanecen pendientes. El estado CI del commit final se registrará después de ejecutar GitHub Actions.

## Rectificación posterior D015 (30/10/2026)
El propietario aclara que el **derecho a cotizar** no puede exigir identidad de marca, envase ni especificaciones que el comprador no haya indicado. El motor de este documento evalúa **compatibilidad técnico-comercial** de variantes y es demasiado exigente como puerta única de invitación. D015 añade un contrato independiente (`src/domain/invitaciones-por-producto.ts`) que invita por producto canónico confirmado en el catálogo, mostrando diferencias conocidas sin homologarlas. El futuro circuito usa D015 para consultar proveedores y este control D014 para evaluar ofertas confirmadas. Ver [docs/72](72-invitacion-producto-primero.md). Ambos módulos siguen offline.
