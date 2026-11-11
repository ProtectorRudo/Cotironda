# Acta 500 — B5j, conciliación económica privada y determinista

**Fecha:** 11/11/2026. **Autorización:** «Luz verde», solo desarrollar, probar y documentar.
**Branch:** feat/v2-b5j-economic-total-reconciliation-20261111.
**Destino previsto:** únicamente Supabase cotironda-piloto; NO instalar
SQL ni desplegar Edge sin una futura orden «Publicalo».

## Hechos reales heredados, no suposiciones

Dos PDF históricos privados de Ailín contienen una única cifra coincidente
con el total previamente transcrito, en una celda debajo de los materiales y
alineada con sus importes (B5i real). En ellos:
- PDF 1: 2 materiales, cero cargos/descuentos independientes y 3 condiciones.
- PDF 2: 3 materiales, 2 notas sin importe y 5 condiciones.
- B5f cotejó los 7 renglones; identificó los descuentos de materiales
  mediante columna geométrica, pero no certificó el total documental.
- B5h no encontró rótulo explícito de total; B5i solo determinó su posición.
- No hay motivo para comparar ambos PDF entre sí como si fueran ofertas
  de proveedores diferentes, ni para mostrarlos en el ranking.

## Decisión de diseño B5j

1. Núcleo puro y determinista: centavos y cantidades usando bigint y las
   reglas existentes B5. No hace cálculos económicos mediante un modelo.
   Reutiliza el cotejo B5 del original SHA y los descuentos de la fuente
   de texto o columna PDF.js. Redondea el precio efectivo unitario como
   el verificador B5 existente y respeta el total que el proveedor escribió.
2. No descuenta una segunda vez una bonificación ya incluida en el total
   del material. Un descuento adicional con alcance incierto se marca
   discount_scope_ambiguous. Un cargo adicional solo entra en la suma
   si tiene importe y concepto explícito en fuente.
3. IVA ausente sigue sin informarse, no significa «sin IVA».
   IVA incluido/excluido explícitamente se registra como tal; porcentajes
   o menciones sin tratamiento económico explícito no disparan cálculos
   inventados. Igual para flete/entrega. Condiciones comerciales extraídas
   por IA necesitan corroboración literal en el original.
4. Si la suma difiere por un centavo, se informa grand_total_differs, sin
   tolerancia arbitraria. Si coincide, solo grand_total_balances_private.
   Ni el segundo estado es verificación comercial integral, pues B5f aún
   marca full_document_covered=false.
5. El ledger nuevo B5j contiene exclusivamente códigos cerrados,
   contadores pequeños, estados de menciones IVA/flete y banderas siempre
   falsas de source_verified/can_publish/can_rank/can_reveal_contacts.
   Jamás guarda precios, texto del presupuesto, SHA en diagnósticos, nombres,
   teléfonos, posiciones del PDF ni contactos.
6. SQL B5j selecciona solo los dos históricos del nuevo ledger B5i
   con coincidencia alineada debajo de la tabla. Es nueva versión, no
   borra ni reescribe B5d/B5g/B5h/B5i. Requiere SHA, proveedor vigente,
   consentimiento activo, archivo no vinculado a ronda y privado. Una
   entrada por archivo/versión, máximo 2/h, transacciones protegidas.
7. Modo SQL b5j_only DEFAULT FALSE y exclusivo frente a b5h_only/b5i_only.
   La Edge atiende B5j antes de B5i/B5h/B2. Si queda cola vacía o falla
   el estado del modo, NUNCA cae hacia lectura IA o distribución.
   Se preservan credenciales, Whapi, cron, Vercel, cierre y ranking.

## Criterios de aceptación

- Test de sumas exactas, descuentos explícitos por ítem, IVA sin mención,
  IVA incluido, IVA excluido, tasa sin tratamiento, flete gratis, cargo
  separado, importe de entrega no asignable, dos descuentos con alcance
  ambiguo, totales con centavo diferente y condiciones no corroboradas.
- Test de fuente/cobertura, originales SHA, lectura de PDF real sintético,
  ruta exclusiva y protección de resultados.
- PostgreSQL 17 rollback: flags, RLS, roles, dos PDFs elegibles,
  revocaciones, duplicados, protección contra PII/importes en diagnósticos,
  fuentes preservadas y cero modificaciones persistentes del test.
- Regresión completa Node, Deno y build Next.js, lector Whapi firmado sin
  cambios y PR draft hasta que el nuevo cambio esté realmente probado.

## Restricción comercial

B5j NO publica ni adjudica ofertas. Aunque el total dé exactamente la
suma de los artículos, pueden existir renglones no reconocidos, descuentos
sobre factura, IVA no aclarado, flete, promociones o cláusulas relevantes.
La habilitación al comprador requerirá auditar cobertura integral y las
reglas de equivalencia/pagos antes de mostrar cualquier resultado
supuestamente verificado.

**Piloto real:** B5j no desplegado. Hasta autorización distinta,
Supabase queda Edge V2 v6 con V2/B5h/B5i OFF; B5i real 2/2 privado.
