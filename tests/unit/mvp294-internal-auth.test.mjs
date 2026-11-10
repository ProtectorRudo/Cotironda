import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeRecoveryMvp294,safeSameMvp294,validInternalServiceKeyMvp294} from '../../supabase/functions/cotironda-piloto-auto-recovery/internal-auth-mvp294.ts';

const dedicated='S'.repeat(64);
const jwt=['x'.repeat(50),'y'.repeat(80),'z'.repeat(48)].join('.');
const modern='sb_secret_'+'v'.repeat(48);
const baseline={
 privateHeader:dedicated,privateExpected:dedicated,
 apikeyHeader:'',authorizationHeader:'',
 legacyServiceRole:jwt,secretKeysJson:JSON.stringify({default:modern})
};

test('constant-time comparator handles unequal length and byte differences',()=>{
 assert.equal(safeSameMvp294(dedicated,dedicated),true);
 assert.equal(safeSameMvp294(dedicated,dedicated+'!'),false);
 assert.equal(safeSameMvp294(dedicated,dedicated.slice(0,-1)+'K'),false);
 assert.equal(safeSameMvp294('', ''),true);
});

test('current sb_secret_ backend credential + independent dedicated key required',()=>{
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern}),true);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern,privateHeader:'bad'}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:'sb_publishable_'+'v'.repeat(48)}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern+'x'}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern,privateExpected:'short'}),false);
});

test('legacy JWT recognized only if EXACT project credential and private key match',()=>{
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:'Bearer '+jwt}),true);
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:'Bearer '+jwt,secretKeysJson:''}),true);
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:'Bearer '+jwt+'x'}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:'Bearer other'}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:jwt}),false);
});

test('no mixed-mode acceptance, header substitution or key alone',()=>{
 assert.equal(authorizeRecoveryMvp294({...baseline}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern,authorizationHeader:'Bearer '+jwt}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern,privateHeader:''}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:modern,secretKeysJson:'not-json'}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,authorizationHeader:'Bearer '+modern}),false);
 assert.equal(authorizeRecoveryMvp294({...baseline,apikeyHeader:jwt}),false);
});

test('formats admitted only for admin secrets, never user bearer',()=>{
 assert.equal(validInternalServiceKeyMvp294(modern),true);
 assert.equal(validInternalServiceKeyMvp294(jwt),true);
 assert.equal(validInternalServiceKeyMvp294('sb_publishable_foo'),false);
 assert.equal(validInternalServiceKeyMvp294('Bearer '+jwt),false);
 assert.equal(validInternalServiceKeyMvp294(''),false);
});
