// SOLO fixtures CI sin secretos. Nunca usar como autenticación real.
const projectRef='qkercsoqhehbenbbncwk';
const uid='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const payload={
 iss:'https://'+projectRef+'.supabase.co/auth/v1',
 aud:'authenticated',role:'authenticated',sub:uid,
 session_id:sid,is_anonymous:false,cotironda_email_verified:true,
 iat:1760000000,exp:1893456000
};
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')
 +'.'+Buffer.from(JSON.stringify(payload)).toString('base64url')
 +'.ci_not_a_real_signature';
const user={id:uid,email:'ci-only@example.invalid',
 email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false};
const session={access_token:token,refresh_token:'ci_refresh_fake_only',
 token_type:'bearer',expires_in:3600,expires_at:1893456000,user};
module.exports={projectRef,uid,sid,token,user,session};
