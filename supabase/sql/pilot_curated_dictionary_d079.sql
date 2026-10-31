-- MVP-030 / D079. EXPLICIT CURATED PILOT REFERENCE DATA.
-- This is NOT a migration and must NOT run against Supabase DEV before #175.
-- Run ONLY after D065 + D066 exist, via authorized operator/migration role,
-- transactionally, with Whapi sending OFF and a verified DEV restore.
-- No supplier/company/customer/contact/phone is inserted here.
-- No business capability is implied by these labels or locations.
do $d079$
declare
 v_categories int;
 v_maps int;
 v_labels int;
 v_city int;
begin
 -- Keep the category vocabulary already present in Etapa 01.
 select count(*) into v_categories
 from public.catalog_categories
 where code in('corralon','pintureria','construccion_seco',
               'electricidad','sanitarios') and is_active=true;
 if v_categories<>5 then
  raise exception 'd079_categories_missing_or_inactive' using errcode='23514';
 end if;
 -- Seed exact family -> rubro mapping, never product name/price equivalence.
 if exists(
  select 1 from (values
    ('cemento_gris_obra','corralon'),
    ('hidrofugo','corralon'),
    ('pintura_latex','pintureria'),
    ('placa_yeso','construccion_seco'),
    ('cable_unipolar','electricidad'),
    ('cano_pvc','sanitarios')
  ) as expected(code,category)
  join cotironda_private.item_rubros_d065 existing
   on existing.product_code=expected.code
  where existing.category_code<>expected.category
 ) then raise exception 'd079_category_conflict' using errcode='23514';end if;

 if exists(
  select 1 from (values
    ('cemento_gris_obra','Cemento gris para obra'),
    ('hidrofugo','Hidrofugo para mezclas'),
    ('pintura_latex','Pintura latex'),
    ('placa_yeso','Placa de yeso'),
    ('cable_unipolar','Cable unipolar'),
    ('cano_pvc','Caño PVC')
  ) as expected(code,label)
  join cotironda_private.item_display_d066 existing
   on existing.product_code=expected.code
  where existing.display_label<>expected.label
 ) then raise exception 'd079_label_conflict' using errcode='23514';end if;

 if exists(select 1 from cotironda_private.delivery_localities_d065
  where alias_key='la plata' and
   (province<>'Buenos Aires' or city<>'La Plata'))
 then raise exception 'd079_locality_conflict' using errcode='23514';end if;

 insert into cotironda_private.item_rubros_d065(product_code,category_code)
 values
 ('cemento_gris_obra','corralon'),
 ('hidrofugo','corralon'),
 ('pintura_latex','pintureria'),
 ('placa_yeso','construccion_seco'),
 ('cable_unipolar','electricidad'),
 ('cano_pvc','sanitarios')
 on conflict (product_code) do nothing;

 insert into cotironda_private.item_display_d066(product_code,display_label)
 values
 ('cemento_gris_obra','Cemento gris para obra'),
 ('hidrofugo','Hidrofugo para mezclas'),
 ('pintura_latex','Pintura latex'),
 ('placa_yeso','Placa de yeso'),
 ('cable_unipolar','Cable unipolar'),
 ('cano_pvc','Caño PVC')
 on conflict (product_code) do nothing;

 insert into cotironda_private.delivery_localities_d065
  (alias_key,province,city)
 values('la plata','Buenos Aires','La Plata')
 on conflict (alias_key) do nothing;

 select count(*) into v_maps from cotironda_private.item_rubros_d065
 where product_code in('cemento_gris_obra','hidrofugo','pintura_latex',
                       'placa_yeso','cable_unipolar','cano_pvc');
 select count(*) into v_labels from cotironda_private.item_display_d066
 where product_code in('cemento_gris_obra','hidrofugo','pintura_latex',
                       'placa_yeso','cable_unipolar','cano_pvc');
 select count(*) into v_city from cotironda_private.delivery_localities_d065
 where alias_key='la plata' and province='Buenos Aires' and city='La Plata';
 if v_maps<>6 or v_labels<>6 or v_city<>1 then
  raise exception 'd079_incomplete_dictionary' using errcode='23514';
 end if;
end;$d079$;
