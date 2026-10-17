import {assertUserId,unbase64url,base64url} from './backup-crypto.js';
export class MacApiError extends Error{constructor(status,code){super(code);this.name='MacApiError';this.status=status;this.code=code;}}
export function createMacClient(config,{storage=globalThis.localStorage,appPath='/',fetcher=globalThis.fetch}={}){
 const storageKey=`yueji.mac.identity:${appPath}:${config.serverId}`;let credential=null,verified=false,verifiedAt=0,endpoint=config.url,lastDiscovery=0;
 async function discover(){
  if(!config.discovery||Date.now()-lastDiscovery<30000)return;
  const response=await fetcher(new URL('./mac-endpoint.json',import.meta.url),{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new TypeError('network: Mac 入口暂时不可达');
  const value=await response.json();let url;try{url=new URL(value.url);}catch{throw new Error('Mac 入口配置无效');}
  if(value.version!==1||value.serverId!==config.serverId||url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Mac 入口身份无效');
  if(endpoint!==url.origin){endpoint=url.origin;verified=false;}lastDiscovery=Date.now();
 }
 function check(value){assertUserId(value?.userId);if(value.serverId!==config.serverId||typeof value.accountToken!=='string'||unbase64url(value.accountToken,32).length!==32)throw new Error('恢复文件中的 Mac 身份无效');return {userId:value.userId,accountToken:value.accountToken,serverId:value.serverId};}
 async function request(path,{method='GET',body,auth=true,blob=false,identity=credential}={}){
  if(auth&&!identity)throw new MacApiError(401,'not_authenticated');if(auth)await verifyServer();const headers={};if(auth)headers.Authorization=`Bearer ${identity.userId}.${identity.accountToken}`;
  if(body!==undefined)headers['Content-Type']='application/json';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
  try{
   const response=await fetcher(endpoint+path,{method,headers,body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:controller.signal});
   if(!response.ok){let code='endpoint_unavailable';try{const value=await response.json();if(typeof value.error==='string')code=value.error;}catch{}throw new MacApiError(response.status,code);}
   return blob?response.blob():response.json();
  }catch(error){lastDiscovery=0;verified=false;throw error;}finally{clearTimeout(timeout);}
 }
 async function verifyServer(){
  await discover();if(verified&&Date.now()-verifiedAt<30000)return;
  const nonce=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const response=await request('/v1/server?nonce='+nonce,{auth:false});
  if(response.serverId!==config.serverId||response.nonce!==nonce)throw new Error('Mac 服务器身份不匹配，已停止连接');
  const key=await crypto.subtle.importKey('jwk',config.serverPublicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unbase64url(response.signature,64),new TextEncoder().encode(`yueji-mac-server:1:${config.serverId}:${nonce}`)))throw new Error('Mac 服务器签名无效，已停止连接');
  verified=true;verifiedAt=Date.now();
 }
 function objectPath(name){if(!credential||!name.startsWith(credential.userId+'/'))throw new Error('备份归属不匹配');return '/v1/objects/'+encodeURIComponent(name.slice(credential.userId.length+1));}
 return {
  async connect({create=false}={}){
   await verifyServer();const raw=storage.getItem(storageKey);
   if(raw){try{credential=check(JSON.parse(raw));}catch{throw new Error('恢复身份读取失败，请选择原恢复文件，不要清空记录');}try{await request('/v1/identity');}catch(error){if(error.status!==401)throw error;await request('/v1/identities',{method:'POST',body:credential,auth:false});}}
   else if(create){credential={userId:crypto.randomUUID(),accountToken:base64url(crypto.getRandomValues(new Uint8Array(32))),serverId:config.serverId};storage.setItem(storageKey,JSON.stringify(credential));await request('/v1/identities',{method:'POST',body:credential,auth:false});}
   return credential?.userId||null;
  },
  async restoreIdentity(file){
   if(file?.kind!=='yueji-recovery-key'||file.version!==2)throw new Error('恢复文件不含 Mac 身份，请使用原 ID 的密文文件恢复');
   const next=check(file);await verifyServer();const result=await request('/v1/identity',{identity:next});if(result.userId!==next.userId)throw new Error('Mac 身份核对失败');
   storage.setItem(storageKey,JSON.stringify(next));credential=next;return next.userId;
  },
  recoveryIdentity(){if(!credential)throw new Error('恢复身份尚未连接');return {serverId:config.serverId,accountToken:credential.accountToken};},
  getHead:()=>request('/v1/head'),
  getConsent:()=>request('/v1/consent'),
  setConsent:(active,version)=>request('/v1/consent',{method:'PUT',body:{active,version}}),
  uploadObject:(name,blob)=>request(objectPath(name),{method:'PUT',body:blob}),
  downloadObject:name=>request(objectPath(name),{blob:true}),
  publishBackup:metadata=>request('/v1/publish',{method:'POST',body:metadata}).then(value=>value.revision)
 };
}
