/**
 * MVP-070 — one broad, fictional, price-free builders-merchant catalogue,
 * used IDENTICALLY by the two independent pilot shop panels. It is sample
 * content, not a supplier declaration, stock verification or confirmed D080
 * mapping. No names, contact numbers, costs or business records.
 */
export const MATERIALES_CORRALON_DEMO_MVP070=Object.freeze([
 // Cementos, cales y preparados
 'Cemento CPC 50 kg',
 'Cemento CPN 50 kg',
 'Cemento de obra 25 kg',
 'Cal aérea hidratada 25 kg',
 'Cal hidráulica 25 kg',
 'Yeso tradicional 30 kg',
 'Hidrófugo Ceresita 1 litro',
 'Hidrófugo líquido 4 litros',
 'Adhesivo para cerámicos 25 kg',
 'Pastina para juntas 1 kg',
 'Mortero de asiento 30 kg',
 'Revoque grueso premezclado 30 kg',
 'Revoque fino premezclado 30 kg',
 // Áridos, agregados y embolsados
 'Arena fina a granel',
 'Arena gruesa a granel',
 'Piedra partida 6/20 a granel',
 'Piedra partida 10/30 a granel',
 'Cascote para relleno a granel',
 'Tosca para relleno a granel',
 'Bolsón de arena fina 1 m3',
 'Bolsón de piedra partida 1 m3',
 // Ladrillos y bloques
 'Ladrillo común macizo',
 'Ladrillo hueco 8x18x33 cm',
 'Ladrillo hueco 12x18x33 cm',
 'Ladrillo hueco 18x18x33 cm',
 'Bloque de hormigón 12x19x39 cm',
 'Bloque de hormigón 19x19x39 cm',
 'Bloque de hormigón celular HCCA',
 'Ladrillo refractario',
 // Aceros, mallas y fijaciones
 'Hierro ADN 420 6 mm',
 'Hierro ADN 420 8 mm',
 'Hierro ADN 420 10 mm',
 'Hierro ADN 420 12 mm',
 'Hierro ADN 420 16 mm',
 'Malla electrosoldada 15x15 4,2 mm',
 'Malla electrosoldada 15x15 6 mm',
 'Alambre recocido 1 kg',
 'Alambre galvanizado 1 kg',
 'Clavos punta París 2 pulgadas',
 'Clavos punta París 3 pulgadas',
 'Alambre para atar 1 kg',
 // Cubiertas, losas e impermeabilización
 'Vigueta pretensada 3 m',
 'Vigueta pretensada 4 m',
 'Ladrillo de telgopor para losa',
 'Membrana asfáltica aluminizada 4 mm',
 'Fieltro asfáltico en rollo',
 'Teja francesa cerámica',
 // Accesorios y descartables
 'Bolsón vacío para escombros',
 'Pallet vacío de madera',
 'Balde de albañil 10 litros',
 'Carretilla de obra 90 litros'
] as const);

export const LISTADO_AMBOS_CORRALONES_MVP070=
 MATERIALES_CORRALON_DEMO_MVP070.join('\n');

export const PEDIDO_COMUN_DEMO_MVP070=
 '20 bolsas de cemento CPC 50 kg, 5 litros de hidrófugo. Entrega: La Plata.';
