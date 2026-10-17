import {assertUserId,readRecovery,encryptBackup,decryptBackup,sha256,MAX_ENVELOPE} from './backup-crypto.js';
import {validateState} from './engine.js';
export const CONSENT_VERSION='2026-10-17-mac-e2ee-v1';
export function validateCloudConfig(config){
  if(config?.enabled!==true)return null;
  let url;try{url=new URL(config.url);}catch{throw new Error('云端地址未配置');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(config.backend!=='mac'||!['https:',...(local?['http:']:[])].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Mac 备份地址必须使用 HTTPS，本机测试可使用 localhost');
  assertUserId(config.serverId);
  const key=config.serverPublicKey;if(!key||key.kty!=='EC'||key.crv!=='P-256'||typeof key.x!=='string'||typeof key.y!=='string'||'d'in key)throw new Error('Mac 服务器公钥未配置或包含私钥');
  return {...config,url:url.origin};
}
export class BackupConflictError extends Error{constructor(){super('云端已有新版本，已停止自动备份。请重新检查后选择保留哪一份。');this.name='BackupConflictError';}}
export class CloudBackup {
  constructor({client,userId,getState}){this.client=client;this.userId=assertUserId(userId);this.getState=getState;this.recovery=null;this.head=null;this.remoteState=null;this.loaded=false;this.busy=false;this.active=false;this.lastSaved=null;}
  async inspect(){
    if(this.busy)throw new Error('备份处理中，请稍后');
    const head=await this.client.getHead();
    if(head?.user_id!==undefined&&head.user_id!==this.userId)throw new Error('云端用户不匹配');
    this.head=head?.revision?head:null;this.loaded=true;this.remoteState=null;return this.head;
  }
  async unlock(file){
    return this.unlockPrepared(await readRecovery(file));
  }
  async unlockPrepared(recovery){
    if(recovery.userId!==this.userId)throw new Error('这是其他用户 ID 的密钥。旧 ID 的备份请使用“恢复密文文件”。');
    if(recovery.cryptoKey?.type!=='secret'||recovery.cryptoKey.algorithm?.name!=='AES-GCM'||recovery.cryptoKey.algorithm.length!==256||recovery.cryptoKey.extractable!==false)throw new Error('恢复密钥格式无效');
    await this.inspect();if(this.head&&this.head.key_id!==recovery.keyId)throw new Error('恢复密钥与云端记录不匹配');
    if(this.head){
      const blob=await this.client.downloadObject(this.head.object_name);
      if(blob.size>MAX_ENVELOPE)throw new Error('云端备份文件过大');
      const text=await blob.text();if(await sha256(text)!==this.head.sha256)throw new Error('云端备份校验失败');
      this.remoteState=validateState(await decryptBackup(JSON.parse(text),recovery));
    }
    this.recovery=recovery;this.active=false;return this.remoteState;
  }
  async consent(active){await this.client.setConsent(active,CONSENT_VERSION);this.active=active;}
  lock(){this.active=false;this.recovery=null;this.remoteState=null;this.lastSaved=null;this.pending=null;}
  async save(){
    if(this.busy)throw new Error('备份处理中，请稍后');
    if(!this.loaded||!this.recovery||!this.active)throw new Error('请先选择恢复密钥并同意加密备份');
    const state=this.getState();if(!state)throw new Error('演示模式或本机记录读取异常时不上传记录');
    const recovery=this.recovery,valid=validateState(state),serialized=JSON.stringify(valid);
    this.busy=true;
    try{
      const current=await this.client.getHead();
      if((current?.revision||0)!==(this.head?.revision||0)){
        // A publish response can be lost after commit. Recognize our immutable object.
        if(this.pending&&current?.object_name===this.pending.name&&current.sha256===this.pending.digest){this.head=current;this.lastSaved=this.pending.serialized;this.pending=null;}
        else throw new BackupConflictError();
      }
      if(serialized===this.lastSaved)return {unchanged:true,revision:this.head?.revision||0};
      const envelope=await encryptBackup(valid,recovery),text=JSON.stringify(envelope),digest=await sha256(text);
      const name=`${this.userId}/${crypto.randomUUID()}.enc.json`,size=new TextEncoder().encode(text).length;
      await this.client.uploadObject(name,new Blob([text],{type:'application/json'}));
      this.pending={name,digest,serialized};
      let revision;try{revision=await this.client.publishBackup({expectedRevision:this.head?.revision||0,objectName:name,sha256:digest,keyId:recovery.keyId,byteSize:size});}catch(error){if(error?.code==='backup_conflict')throw new BackupConflictError();throw error;}
      if(!Number.isInteger(revision)||revision<1)throw new Error('云端未确认备份版本');
      this.head={user_id:this.userId,revision,object_name:name,sha256:digest,key_id:recovery.keyId,byte_size:size,updated_at:new Date().toISOString()};
      this.lastSaved=serialized;this.remoteState=valid;this.pending=null;return this.head;
    }catch(error){if(error instanceof BackupConflictError)this.active=false;throw error;}finally{this.busy=false;}
  }
}
