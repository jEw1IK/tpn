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
