# MVP-106 — primera comprobación independiente contra archivo original

02/11/2026 · Issue #423 · desarrollo apilado sobre PR #422. **No publicado, no instalado y sin envíos WhatsApp reales**.

## Alcance exacto
Los controles MVP-101/102/103 ya almacenaban todos los renglones que transcribió la IA, comprobaban que ambas lecturas coincidieran y hacían la auditoría decimal. Eso **NO demostraba** correspondencia con el original. MVP-106 agrega un comprobador determinista de cobertura para proveedores que manden un archivo **TXT o CSV en texto plano**: usa los bytes descargados y validados por SHA256 desde Whapi, no texto inventado por el modelo.

La nueva función `checkSupplierTextSource` lee con UTF-8 estricto, rechaza archivos vacíos, demasiado grandes, con caracteres de control, formatos distintos, disposición que no pueda corroborar, preguntas/ambigüedades, un renglón no localizado, cifras que no aparecen realmente, unidades/cantidades que no se encuentran, cargos monetarios omitidos o el TOTAL ausente/diferente. Conserva también el nombre de cada concepto extra, pallets, bolsones, flete, IVA y descuentos negativos; verifica el orden de **todos** los renglones. No modifica jamás los originales ni «arregla» un precio. Deja pendientes los archivos más complejos en vez de truncar o inventar.

Se almacenan solo `message_hmac`, hash del archivo, cantidad de renglones, estado y motivo en `supplier_source_checks_mvp106` (RLS sin SELECT API, inmutabilidad y RPC exclusivamente para service_role). El ingreso requiere doble lectura coincidente, auditoría económica previa, rol/consentimiento, ronda/invitación habilitada, archivo archivado y SHA igual. Ni el estado positivo `source_text_covered` implica identificación del negocio verificada, redacción segura de datos personales o autorización de la oferta para ranking. `source_verified=false`, `publication_allowed=false` y `ranking_allowed=false` siguen fijos.

## Pruebas
- `tests/unit/mvp106-fidelidad-documento-txt-csv.test.mjs`: seis grupos con casos reales de cadena de caracteres en archivo TXT/CSV: cemento, pallets, bolsones, flete, IVA, descuento y total; precios distintos, descuento positivo, cantidad inventada, IVA omitido, importe extra no reconocido, contacto/CUIT, documento ilegible, otras extensiones, preguntas y correcciones.
- `mvp106_smoke_rollback.sql`: PostgreSQL 17 de Supabase PILOTO, migraciones MVP-101..106 dentro de **UNA** transacción con `ROLLBACK`; resultado **PASS**: archivo de proveedor autenticado, dos lecturas acordadas, suma exacta, texto cotejado, foto/PDF sin prueba textual, hash falsificado y renglón faltante bloqueados, anti-replay, RLS, inmutabilidad, sin crear oferta económica. Consulta final confirmó `rolled_back=true`.
- CI GitHub por comprobar en el PR. Cero mensajes reales y cero cambios persistentes de datos.

## Limitación que no debe esconderse
El archivo de Word, Excel, PDF o imagen se conserva privado, se lee dos veces con IA, pero **todavía no tiene lector independiente de fuente para autorizar todos sus importes**; requiere extraer contenido con librerías por formato y resolver páginas, celdas e imágenes. TXT/CSV con tablas multilineales, identidades/PII, estructuras complejas o texto no cotejable también quedan para revisión. Una concordancia textual no revela contactos ni publica ofertas. Aun falta **la proyección anónima generada automáticamente, condiciones y ranking de comparables, selección y comunicación mutua de finalistas, además de toda la prueba E2E real**.
