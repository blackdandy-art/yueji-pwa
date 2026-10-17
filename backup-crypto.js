// Web Crypto only. Recovery keys never leave the user's device in a request.
export const MAX_PLAINTEXT=32*1024*1024;
export const MAX_ENVELOPE=45*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function assertUserId(id){if(typeof id!=='string'||!UUID.test(id))throw new Error('用户 ID 无效');return id;}
export function base64url(bytes){let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unbase64url(text,max=MAX_ENVELOPE){if(typeof text!=='string'||text.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('加密文件编码无效');let bytes;try{bytes=Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));}catch{throw new Error('加密文件编码无效');}if(bytes.length>max||base64url(bytes)!==text)throw new Error('加密文件编码无效');return bytes;}
export async function sha256(value){const bytes=typeof value==='string'?encoder.encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function createRecovery(userId,identity){assertUserId(userId);const value={kind:'yueji-recovery-key',version:identity?2:1,userId,key:base64url(crypto.getRandomValues(new Uint8Array(32)))};if(identity){assertUserId(identity.serverId);if(unbase64url(identity.accountToken,32).length!==32)throw new Error('恢复身份凭据无效');value.serverId=identity.serverId;value.accountToken=identity.accountToken;}return value;}
export async function readRecovery(input){
  if(!input||input.kind!=='yueji-recovery-key'||![1,2].includes(input.version)||Object.keys(input).some(k=>!(input.version===2?['kind','version','userId','key','serverId','accountToken']:['kind','version','userId','key']).includes(k)))throw new Error('不是月记恢复密钥文件');
  if(input.version===2){assertUserId(input.serverId);if(unbase64url(input.accountToken,32).length!==32)throw new Error('恢复身份凭据无效');}
  assertUserId(input.userId);const bytes=unbase64url(input.key,32);if(bytes.length!==32)throw new Error('恢复密钥长度无效');
  return {userId:input.userId,keyId:(await sha256(bytes)).slice(0,32),cryptoKey:await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])};
}
const aad=(userId,keyId)=>encoder.encode(`yueji-backup:1:A256GCM:${userId}:${keyId}`);
export function validateEnvelope(value){
  if(!value||value.kind!=='yueji-encrypted-backup'||value.version!==1||value.alg!=='A256GCM'||Object.keys(value).some(k=>!['kind','version','alg','userId','keyId','iv','ciphertext'].includes(k)))throw new Error('不是支持的加密备份');
  assertUserId(value.userId);if(!/^[a-f0-9]{32}$/.test(value.keyId)||unbase64url(value.iv,12).length!==12)throw new Error('加密备份参数无效');
  const ciphertext=unbase64url(value.ciphertext,MAX_PLAINTEXT+16);if(ciphertext.length<16)throw new Error('加密备份不完整');return value;
}
export async function encryptBackup(state,recovery){
  const bytes=encoder.encode(JSON.stringify(state));if(bytes.length>MAX_PLAINTEXT)throw new Error('记录超过备份大小上限，请先导出本地备份');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(recovery.userId,recovery.keyId),tagLength:128},recovery.cryptoKey,bytes);
  return {kind:'yueji-encrypted-backup',version:1,alg:'A256GCM',userId:recovery.userId,keyId:recovery.keyId,iv:base64url(iv),ciphertext:base64url(new Uint8Array(ciphertext))};
}
export async function decryptBackup(value,recovery){
  validateEnvelope(value);if(value.userId!==recovery.userId||value.keyId!==recovery.keyId)throw new Error('恢复密钥与此备份不匹配');
  let bytes;try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64url(value.iv,12),additionalData:aad(value.userId,value.keyId),tagLength:128},recovery.cryptoKey,unbase64url(value.ciphertext,MAX_PLAINTEXT+16));}catch{throw new Error('备份无法解密：密钥错误或文件已损坏');}
  try{return JSON.parse(decoder.decode(bytes));}catch{throw new Error('解密后的记录格式无效');}
}
