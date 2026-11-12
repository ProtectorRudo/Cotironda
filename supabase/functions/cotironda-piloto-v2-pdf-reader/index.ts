/** Dedicated private PDF extraction (no WhatsApp or buyer catalog).
 * Deploy only with verify_jwt=false and a long dedicated shared secret,
 * or the Supabase gateway will reject the opaque Authorization header.
 * Security is enforced in pdf-core.ts with constant-time digest checking.
 */
import {resolverPdfPrivadoV2} from './pdf-core.ts';
import {readPdfPositioned} from '../cotironda-piloto-whapi/supplier-source-pdf-general.ts';

Deno.serve(req=>resolverPdfPrivadoV2(req,
 Deno.env.get('COTIRONDA_PILOT_V2_PDF_SHARED_SECRET')??'',
 readPdfPositioned
));