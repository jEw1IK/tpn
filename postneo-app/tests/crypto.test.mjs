import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,unlockWithPassphrase,unlockWithRecovery,importDataKey,encryptJson,decryptJson,rewrapWithPassphrase,rewrapRecovery,normalizeRecoveryCode,toB64,fromB64} from '../lib/crypto.ts';

test('хранилище: фраза и код восстановления открывают один и тот же ключ, чужая фраза — нет', async () => {
 const {record,recoveryCode,rawKey}=await createVault('тёплое молоко 2026');
 assert.match(recoveryCode,/^([0-9A-Z]{5}-){5}[0-9A-Z]$/);
 assert.equal(toB64(await unlockWithPassphrase(record,'  тёплое молоко 2026 ')),toB64(rawKey));
 assert.equal(toB64(await unlockWithRecovery(record,recoveryCode.toLowerCase().replaceAll('-',' '))),toB64(rawKey));
 await assert.rejects(unlockWithPassphrase(record,'тёплое молоко 2025'),/другой ключ/);
 await assert.rejects(createVault('короткая'),/не короче 12/);
});

test('запись шифруется и читается, другой ключ не читает, формат v1', async () => {
 const {rawKey}=await createVault('фраза отделения номер один');
 const key=await importDataKey(rawKey);
 const sealed=await encryptJson(key,{surname:'Ярошенко',birth_weight:1450,medicines:[{drug:'ampsul'}]});
 assert.match(sealed,/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
 assert.deepEqual(await decryptJson(key,sealed),{surname:'Ярошенко',birth_weight:1450,medicines:[{drug:'ampsul'}]});
 const other=await importDataKey((await createVault('совсем другая фраза 2')).rawKey);
 await assert.rejects(decryptJson(other,sealed),/другой ключ/);
 assert.notEqual(await encryptJson(key,{a:1}),await encryptJson(key,{a:1}));
});

test('смена фразы не трогает ключ данных; код восстановления переобёртывается новой солью', async () => {
 const {record,recoveryCode,rawKey}=await createVault('первая фраза отделения');
 const next=await rewrapWithPassphrase(record,rawKey,'вторая фраза отделения');
 const updated={...record,...next,recovery_wrapped_key:await rewrapRecovery(rawKey,next.kdf_salt,recoveryCode)};
 assert.equal(toB64(await unlockWithPassphrase(updated,'вторая фраза отделения')),toB64(rawKey));
 assert.equal(toB64(await unlockWithRecovery(updated,recoveryCode)),toB64(rawKey));
 await assert.rejects(unlockWithPassphrase(updated,'первая фраза отделения'));
 assert.equal(normalizeRecoveryCode('abc-d0 oil'),'ABCD0011');
 assert.deepEqual([...fromB64(toB64(new Uint8Array([1,2,255])))],[1,2,255]);
});

test('ключ без фразы: пароль врача и код приглашения открывают ту же копию, чужой нет', async () => {
 const {createVaultForAdmin,unlockWithRecovery,wrapForPassword,unwrapWithPassword,generateInviteCode,inviteCodeId,wrapForInvite,unwrapWithInvite,toB64}=await import('../lib/crypto.ts');
 const {record,recoveryCode,rawKey,adminWrap}=await createVaultForAdmin('admin-password-1');
 assert.equal(record.wrapped_key,'');
 assert.equal(toB64(await unwrapWithPassword(adminWrap,'admin-password-1')),toB64(rawKey));
 assert.equal(toB64(await unlockWithRecovery({...record,created_at:''},recoveryCode)),toB64(rawKey));
 await assert.rejects(unwrapWithPassword(adminWrap,'admin-password-2'),/другой ключ/);
 const code=generateInviteCode();assert.match(code,/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
 const id=await inviteCodeId(code);assert.match(id,/^[0-9a-f]{64}$/);assert.equal(await inviteCodeId(code.toLowerCase().replaceAll('-',' ')),id);
 const inv=await wrapForInvite(rawKey,code);
 const fromInvite=await unwrapWithInvite(inv,code.toLowerCase());
 const doctorWrap=await wrapForPassword(fromInvite,'doctor-pass-1');
 assert.equal(toB64(await unwrapWithPassword(doctorWrap,'doctor-pass-1')),toB64(rawKey));
 await assert.rejects(unwrapWithInvite(inv,generateInviteCode()));
});
