-- Solo cotironda-piloto. Etiquetas de RUBRO, no variedades inferidas.
-- Exige que el mismo proveedor ya tenga arena y piedra en su catálogo.
WITH proveedores AS (
 SELECT participant_key, max(line_no) AS ultima_linea
 FROM cotironda_piloto_privado.catalogue_lines
 WHERE participant_key IN ('corralon_ailin','corralon_nahuel')
 GROUP BY participant_key
 HAVING bool_or(family_code IN ('arena_fina','arena_gruesa'))
    AND bool_or(family_code='piedra_partida')
), rubros AS (
 SELECT 1 AS orden,'arena_generica' AS familia,
  'Arena sin subtipo especificado (categoría de cotización)' AS descripcion
 UNION ALL
 SELECT 2,'piedra_generica',
  'Piedra sin subtipo especificado (categoría de cotización)'
)
INSERT INTO cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
SELECT p.participant_key,p.ultima_linea+r.orden,r.descripcion,r.familia,
 'curated_family'
FROM proveedores p CROSS JOIN rubros r
WHERE p.ultima_linea<=498
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.catalogue_lines c
  WHERE c.participant_key=p.participant_key AND c.family_code=r.familia
 );
