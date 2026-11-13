# Cotironda V2 D016 · calendario de La Plata 2026 — CANDIDATO SIN APROBAR

**Fecha de verificación de fuentes: 13/11/2026.**
**Desarrollo y pruebas solamente.** NO INSTALADO, NO APROBADO,
NO PUBLICADO. No enviar WhatsApps ni afectar plazos históricos.

## Decisión operativa comercial

Para la primera prueba de corralones y proveedores B2B de La Plata, el plazo
`business_two_days` cuenta **dos días hábiles siguientes** a la creación
de la solicitud y vence a las **18:00 hora de Buenos Aires**. Sábados,
domingos, feriados nacionales obligatorios y feriados especiales con efecto
en la **Provincia de Buenos Aires** no cuentan. Los días **no laborables
turísticos** y los **feriados optativos para el comercio** sí cuentan
como hábiles en este calendario general: que un organismo público,
universidad o un proveedor particular cierre no implica una obligación de
cierre para todos los comercios.

Esta convención necesita aprobación comercial explícita antes de
activarse; si los feriados locales optativos cambian la disponibilidad
real de proveedores, se revisará la política sin inventar datos ni
modificar calendarios de rondas ya creadas.

## Normativa contrastada y reglas especiales

- [Calendario oficial del Tribunal Fiscal bonaerense 2026](https://www.tfaba.gov.ar/Apartados/feriados.asp)
  informa los traslados del **15/6** (Güemes) y **23/11** (Soberanía,
  conmemoración del 20/11), más feriados nacionales y el **19/11 local**.
- [DNU nacional 1103/2026](https://www.argentina.gob.ar/normativa/nacional/norma-430580/texto):
  **9/11** feriado nacional, **10/11** solo CABA y Córdoba,
  **11/11** feriado especial Provincia de Buenos Aires.
- [Resolución 516/2026 del gobierno bonaerense](https://normas.gba.gob.ar/ar-b/resolucion/2026/516/631224):
  feriados locales de noviembre **optativos para industria y comercio**.
  El **19/11**, aniversario de La Plata, no se agregará
  automáticamente a `v2_business_holidays`. Requiere evaluar si el
  operador decide aplicar un criterio diferente.
- [Resolución nacional 164/2025](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-164-2025-421799):
  **23/3, 10/7 y 7/12** son días **no laborables** turísticos, no feriados
  nacionales obligatorios del comercio.
- [Calendario de UNLP 2026](https://www.quimica.unlp.edu.ar/dias-feriados-y-no-laborables-2026-res-nro-3265-25/)
  muestra asuetos propios de la universidad que tampoco se trasladan
  automáticamente a la actividad comercial.

## Datos candidatos

Archivo SQL: `supabase/piloto/v2_d016_calendario_la_plata_2026_CANDIDATE.sql`

- Localidad: `la plata` (coincide con el CHECK de PostgreSQL real).
- Año: `2026`, revisión `lp_v2_r1`.
- Incluye **18 fechas** nacionales/provinciales obligatorias, cada
  una con fuente URL verificable, incluida la del 20/6 en sábado
  por integridad del calendario.
- Excluye **23/3, 10/7, 7/12, 19/11, 10/11 y 20/11** por
  los motivos explicados arriba.
- Graba `approved_at = NULL` intencionalmente: **no autoriza
  calcular ni cerrar rondas V2 reales**. El cálculo SQL exige calendario
  aprobado ANTES de crearse cada ronda.
- Sólo admite PILOTO con marcador `cotironda_d016_pilot_project_ref`
  comprobado por Vault y falla si encuentra una revisión ya usada,
  datos previos o conflicto. No actualiza datos históricos, políticas
  V2, `auth`, cron ni Whapi.
- **2027 NO ESTÁ INCLUIDO**, sin fecha de aprobación simulada. Una
  ronda que cruce el año debe esperar una revisión `2027` oficial,
  compatible con la misma revisión y aprobada antes de esa ronda.
  Nunca aprobar o fechar un calendario retrospectivamente.

## Casos de aceptación — horario de cierre 18:00 AR

| Pedido creado | Segundo día hábil esperado | Motivo |
| --- | --- | --- |
| Viernes 13/11/2026 | Martes 17/11/2026, 18:00 | Lun 16 y mar 17 |
| Jueves 19/11/2026 | Martes 24/11/2026, 18:00 | Vie 20 cuenta; lun 23 feriado nacional |
| Viernes 20/11/2026 | Miércoles 25/11/2026, 18:00 | Lun 23 feriado; mar 24 y mié 25 |
| Lunes 9/11/2026 | Jueves 12/11/2026, 18:00 | Mar 10 cuenta en PBA; mié 11 feriado |
| Jueves 24/12/2026 | Martes 29/12/2026, 18:00 | Vie 25 Navidad; lun 28 y mar 29 |

Los ejemplos usan fechas de creación sintéticas. No alteran ni
reanclan solicitudes ya existentes.

## Cómo se verificó

`tests/unit/v2-d016-calendario-legal.test.mjs` valida lista exacta,
fuentes, exclusiones y ausencia de aprobación automática. El fixture
`supabase/tests/ci/v2-d016-calendario-legal-pg17.sql` recrea
**restricciones de tablas reales en PostgreSQL 17**, instala este
candidato en una transacción de CI con marcador falso de proyecto,
comprueba 18 fechas, calendario todavía no aprobado, año 2027 ausente,
cinco ejemplos y ejecuta `ROLLBACK`. Ningún dato llega a Supabase PILOTO.

## Gate antes de «Publicalo» PILOTO

Confirmar si el acuerdo comercial B2B incorpora o excluye el 19/11 y
días no laborables optativos; contrastar actualizaciones de feriados
provinciales/municipales que afecten la entrega de materiales; comprobar
calendario íntegro, URL/evidencia y fuente de revisiones; validar
consentimientos de originales y políticas V2; ejecutar SQL por única
vez y **aprobar solo mediante operación administrativa explícita**,
nunca por el script candidato; comprobar cron/worker y E2E real.

**No es una aprobación tácita.** No se envía ningún pedido ni se
generan rankings o adjudicaciones.
