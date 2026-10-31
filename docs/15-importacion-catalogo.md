# Importación preliminar de catálogos — Etapa 01

## Estado
El módulo `src/domain/catalogo.ts` normaliza listas declaradas de productos a partir de registros ya extraídos. **No lee todavía Excel/PDF**. No registra ni publica el catálogo en Supabase y nunca marca artículos como habilitados sin confirmación del proveedor.

## Garantías verificadas
- Rubro y unidad deben pertenecer a los tipos admitidos; no se adivinan categorías.
- No confunde bolsas de 25 kg y 50 kg si están en la descripción.
- Rechaza filas inválidas y duplicados exactos conservando números de fila.
- Rechaza más de 2.000 filas por lote (límite técnico provisional).
- No copia precios ni otros datos no solicitados al catálogo provisional.
- Catálogo propuesto = estado "pendiente_confirmacion"; el proveedor decide qué habilitar.
- Las 12 pruebas nuevas pasaron; 21 unitarias en total y comprobación TypeScript aprobada el 29-10-2026.

## Límites
- Esta preparación NO prueba compatibilidad técnica de productos, equivalencia de marcas ni stock real.
- El proceso posterior de importación de archivos con IA se desarrollará en Etapa 02.
- Para integrarlo en un backend hay que verificar autorización por organización, tamaño y contenido de archivos, auditoría y confirmación explícita del proveedor.

## Bloqueo del entorno
Se intentó crear `cotironda-dev` dentro de la organización autorizada. Supabase informó costo mensual inicial **USD 0**, pero rechazó la creación porque la cuenta alcanzó el **límite de dos proyectos gratuitos activos**. No se pausó, eliminó ni modificó ningún proyecto existente.

Alternativas sujetas a decisión del propietario: crear capacidad en un plan pago, liberar una plaza voluntariamente, o realizar las pruebas con PostgreSQL local. **No hay proyecto Supabase de Cotironda creado ni migración aplicada.**
