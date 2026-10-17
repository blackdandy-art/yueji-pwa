import {createMacClient} from './mac-client.js';
import {CLOUD_CONFIG} from './cloud-config.js';
import {CloudBackup,BackupConflictError,validateCloudConfig,CONSENT_VERSION} from './cloud-backup.js';
import {loadDeviceKey,saveDeviceKey,removeDeviceKey} from './device-key.js';
import {createRecovery,readRecovery,decryptBackup,MAX_ENVELOPE} from './backup-crypto.js';
import {validateState} from './engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createCloudUI({getState,restore,confirm,download,appPath}){
  let config,configError='',backup=null,client=null,working=false,agreed=false,armed=false,timer=null,message='',isError=false,restoring=false,localKey=null,localEnvelope=null,retries=0,generation=0,startWanted=false;
  const pausedKey=`yueji.cloud.paused:${appPath}`;
  try{config=validateCloudConfig(CLOUD_CONFIG);}catch{configError='Mac配置无效，已停止连接。请联系维护者。';}
  const status=text=>{message=text;isError=false;};
  function render(){
    const host=document.querySelector('#cloud-settings');if(!host)return;
    if(config){
      const badge=document.querySelector('.local-badge'),side=document.querySelector('.sidebar-bottom strong');
      const summary=!getState()?'Mac 备份已暂停':armed?(working?'加密备份中':message.startsWith('本机')?'本机已保存 · Mac待备份':'已开启加密备份'):'Mac 备份未开启';
      if(side)side.textContent='本机记录 · 可选加密备份';if(badge)badge.textContent=summary;
      let mobile=document.querySelector('#cloud-save-status');if(!mobile){mobile=document.createElement('p');mobile.id='cloud-save-status';mobile.className='cloud-save-status';mobile.setAttribute('role','status');mobile.setAttribute('aria-live','polite');document.querySelector('.topbar')?.after(mobile);}mobile.textContent=summary;
    }
    const active=document.activeElement?.dataset?.cloudAction;
    const disabled=working?'disabled':'';
    const connection=config?`<p class="privacy-copy">无需注册。记录先在此设备加密，再直接保存到维护者的 Mac。</p>${backup?`<label>用户 ID<output class="cloud-id">${esc(backup.userId)}</output></label><p class="privacy-copy">请保存恢复文件，可用于找回原 ID 与记录。</p><div class="action-row"><button class="button secondary" data-cloud-action="inspect" ${disabled}>检查Mac版本</button>${backup.loaded&&!backup.head?`<button class="button secondary" data-cloud-action="generate" ${disabled}>生成并下载恢复密钥</button>`:''}</div>${!backup.recovery?`<label class="cloud-file">选择已保存的恢复密钥<input type="file" data-cloud-file="unlock" accept=".json,application/json" ${disabled}></label>`:''}${backup.recovery?`<p>密钥已解锁 · Mac${backup.head?'版本 '+backup.head.revision:'尚无备份'}</p><label class="settings-check"><input type="checkbox" data-cloud-consent ${agreed?'checked':''} ${disabled}>我同意在此设备保管加密密钥，并将全部记录自动加密备份到维护者的 Mac。</label><details><summary>备份范围与恢复说明</summary><p class="privacy-copy">包含经期、房事、心情、症状、日记、照片、计划及设置。Mac 可见 ID、时间和文件大小，维护者无法解密内容。恢复密钥只由你保管；丢失密钥后管理员也不能恢复。本设备会保管不可导出的加密密钥，供下次打开时自动备份。网页关闭时不能继续上传，Mac 休眠、关机或断网时暂不能接收，未完成的数据会在重新连通后补传。停止备份不删除已经保存在 Mac 的历史密文，如需删除请联系维护者。</p><p class="privacy-copy">Mac 备份服务：${esc(config.url)}；保存期限：内部测试期间保留历史版本，退出测试可请求删除。请先另存 JSON 备份。</p></details><div class="action-row"><button class="button primary" data-cloud-action="save" ${working||!agreed?'disabled':''}>${working?'处理中…':'开启 / 立即备份'}</button><button class="button secondary" data-cloud-action="restore" ${working||!backup.remoteState?'disabled':''}>从Mac恢复</button></div><div class="action-row"><button class="text-button" data-cloud-action="stop" ${disabled}>停止后续备份</button><button class="text-button" data-cloud-action="lock" ${disabled}>锁定密钥</button></div>`:''}`:`<button class="button secondary" data-cloud-action="connect" ${disabled}>${working?'连接中…':'连接并生成用户 ID'}</button><label class="cloud-file">用恢复文件找回原 ID<input type="file" data-cloud-file="identity" accept=".json,application/json" ${disabled}></label>`}`:'<p class="privacy-copy">Mac 备份尚未接入，当前记录仍只保存在本机。接入前不会上传记录。</p>';
    host.innerHTML=`<h2>Mac 加密备份</h2>${connection}<p class="cloud-status ${isError?'form-error':'privacy-copy'}" role="status" aria-live="polite">${esc(configError||message||(backup?(armed?'自动备份已开启。':'尚未开启自动备份。'):''))}</p><details class="cloud-local-restore"><summary>恢复密文文件</summary><p class="privacy-copy">用于原匿名身份丢失后的恢复。向维护者提供原用户 ID 取得密文；恢复密钥保留在你自己的设备，不要交给维护者。</p><label class="cloud-file">原恢复密钥<input type="file" data-cloud-file="local-key" accept=".json,application/json" ${disabled}></label><label class="cloud-file">加密备份文件<input type="file" data-cloud-file="local-backup" accept=".json,application/json" ${disabled}></label><button class="button secondary" data-cloud-action="local-restore" ${working||!localKey||!localEnvelope?'disabled':''}>解密并恢复到本机</button></details>`;
    if(active)host.querySelector(`[data-cloud-action="${active}"]`)?.focus();
  }
  async function run(action){
    if(working)return;working=true;isError=false;render();
    try{await action();}catch(error){
      const transient=error?.code!=='storage_limit'&&(error?.name==='AbortError'||error?.name==='TimeoutError'||error?.code==='endpoint_unavailable'||error?.status===429||error?.status>=500||Number(error?.statusCode)>=500||/fetch|network|timeout|load failed/i.test(error?.message||''));
      isError=true;
      if((armed||startWanted)&&transient){message='本机已保存，Mac尚未完成。网络恢复后自动重试。';clearTimeout(timer);timer=setTimeout(()=>armed?run(()=>save(false)):start(),Math.min(300000,5000*2**Math.min(retries++,6)));}
      else{armed=false;startWanted=false;message=error?.code==='storage_limit'?'备份未完成：Mac 存储已达上限，记录仍在本机，请联系维护者。':error instanceof BackupConflictError?error.message:error instanceof Error&&/^(恢复|Mac|这是其他|加密|备份|不是|记录超过|演示模式)/.test(error.message)?error.message:'操作未完成。记录仍在本机，请检查网络、Mac配置及存储空间后重试。';}
    }finally{working=false;render();}
  }
  async function connect(automatic=false){
    if(!config||!window.isSecureContext||!crypto?.subtle)throw new Error('备份需要 HTTPS 与支持加密的浏览器');
    client||=createMacClient(config,{appPath});
    let userId=await client.connect();
    if(!userId){
      if(automatic){status('原身份未在此浏览器中，请选择恢复文件找回原 ID。');return;}
      const previous=localStorage.getItem(`yueji.cloud.last-id:${appPath}`);
      if(previous&&!await confirm('创建新的用户 ID？',`原 ID：${previous}。若要继续使用原 ID，请取消并选择恢复文件。本机记录会保留。`,'创建新 ID'))return;
      userId=await client.connect({create:true});
    }
    backup=new CloudBackup({client,userId,getState});
    localStorage.setItem(`yueji.cloud.last-id:${appPath}`,userId);
    await backup.inspect();status('已连接 Mac。请保存或选择恢复文件，尚未上传记录。');
  }
  async function remember(){await saveDeviceKey(appPath,backup.userId,{...backup.recovery,revision:backup.head?.revision||0,sha256:backup.head?.sha256||null,consentVersion:CONSENT_VERSION,serverId:config.serverId});}
  async function save(manual=false){
    const operationGeneration=generation;
    if(!getState())throw new Error('备份已暂停，请退出演示模式或先处理本机记录读取问题');
    if(!backup||!agreed)throw new Error('备份前请阅读并同意说明');
    if(manual&&backup.remoteState&&JSON.stringify(validateState(getState()))!==JSON.stringify(backup.remoteState)&&!await confirm('备份当前本机记录？','本机与Mac记录不同。本次将新增一个Mac版本，历史版本保留。请确认本机这份是你要继续使用的记录。','新增备份版本'))return;
    if(manual){await remember();if(operationGeneration!==generation)return;localStorage.removeItem(pausedKey);if(!backup.active)await backup.consent(true);if(operationGeneration!==generation)return;armed=true;}
    if(!armed||!backup.active)return;
    status('正在加密并上传…');render();await backup.save();if(operationGeneration!==generation)return;await remember();if(operationGeneration!==generation)return;retries=0;armed=true;status(`已完成加密备份 · 版本 ${backup.head.revision} · ${new Date().toLocaleTimeString('zh-CN')}`);
    if(JSON.stringify(validateState(getState()))!==backup.lastSaved)queue();
  }
  async function restoreState(state){
    const valid=validateState(state),current=getState();if(!current)throw new Error('演示模式不能恢复真实记录');
    if(!await confirm('恢复并替换本机记录？',`备份包含 ${valid.periods.length} 次经期、${Object.keys(valid.logs).length} 天记录和 ${valid.plans.length} 个计划。将先导出本机当前 JSON 备份，再替换。`,'导出当前备份并恢复'))return;
    download(JSON.stringify(current,null,2),`月记-恢复前-${Date.now()}.json`,'application/json');
    pause();restoring=true;try{restore(valid);}finally{restoring=false;}status('已恢复到本机。请检查记录，确认后再开启备份。');
  }
  function queue(){clearTimeout(timer);if(!armed||!backup?.active||restoring||!getState())return;status('本机已保存，等待加密备份…');render();timer=setTimeout(()=>{if(!getState())return;if(working){queue();return;}run(()=>save(false));},3000);}
  function pause(){localStorage.setItem(pausedKey,'true');generation++;startWanted=false;armed=false;clearTimeout(timer);if(backup){backup.lock();removeDeviceKey(appPath,backup.userId).catch(()=>{});}localKey=null;localEnvelope=null;agreed=false;render();}
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-cloud-action]')?.dataset.cloudAction;if(!action)return;
    run(async()=>{
      if(action==='connect')await connect();
      if(action==='inspect'){armed=false;agreed=false;backup.lock();await backup.inspect();status('已检查Mac版本，请重新选择恢复密钥。');}
      if(action==='generate'){if(!backup.loaded||backup.head)throw new Error('备份已存在，请选择原恢复密钥');const file=await createRecovery(backup.userId,client.recoveryIdentity());download(JSON.stringify(file,null,2),`月记-恢复密钥-${backup.userId}.json`,'application/json');status('请在下方重新选择刚保存的密钥文件。密钥丢失无法补发。');}
      if(action==='save')await save(true);
      if(action==='restore'){if(backup?.remoteState)await restoreState(backup.remoteState);}
      if(action==='stop'){pause();await backup.consent(false);status('已停止后续上传；已保存的 Mac 密文仍保留。');}
      if(action==='lock'){pause();status('已锁定。本地记录仍可使用；密钥需重新选择。');}
      if(action==='local-restore'){await restoreState(await decryptBackup(localEnvelope,localKey));localKey=null;localEnvelope=null;}
    });
  });
  document.addEventListener('change',event=>{
    if(event.target.hasAttribute('data-cloud-consent')){agreed=event.target.checked;if(!agreed){armed=false;clearTimeout(timer);localStorage.setItem(pausedKey,'true');}render();return;}
    const type=event.target.dataset.cloudFile,file=event.target.files?.[0];if(!type||!file)return;event.target.value='';
    run(async()=>{
      if(file.size>(type==='local-backup'?MAX_ENVELOPE:16384))throw new Error('备份或密钥文件过大');
      const value=JSON.parse(await file.text());
      if(type==='unlock'){if(value.version===2&&value.serverId!==config.serverId)throw new Error('恢复文件属于另一台 Mac');armed=false;agreed=false;await backup.unlock(value);status('密钥已解锁。请确认备份范围后开启备份。');}
      if(type==='identity'){await readRecovery(value);client||=createMacClient(config,{appPath});const userId=await client.restoreIdentity(value);backup=new CloudBackup({client,userId,getState});localStorage.setItem(`yueji.cloud.last-id:${appPath}`,userId);await backup.unlock(value);agreed=false;status('已找回原 ID。可先从 Mac 恢复记录，再开启备份。');}
      if(type==='local-key'){localKey=await readRecovery(value);status('原恢复密钥已选择，仅在当前页面内存中使用。');}
      if(type==='local-backup'){localEnvelope=value;status('密文已选择，尚未更改本机记录。');}
    });
  });
  window.addEventListener('online',()=>{if(armed)queue();else if(startWanted)start();});
  window.addEventListener('storage',event=>{if(event.key===pausedKey&&event.newValue==='true')pause();});
  async function start(){
    if(!config||!getState()||localStorage.getItem(pausedKey)==='true')return;
    const previous=localStorage.getItem(`yueji.cloud.last-id:${appPath}`);if(!previous)return;
    await run(async()=>{
      const stored=await loadDeviceKey(appPath,previous);if(!stored||stored.serverId!==config.serverId||stored.consentVersion!==CONSENT_VERSION)return;
      startWanted=true;await connect(true);if(!backup){startWanted=false;return;}
      if(backup.userId!==previous)throw new Error('备份身份发生变化，请重新确认');
      const consent=await backup.client.getConsent();if(!consent?.active||consent.version!==CONSENT_VERSION){startWanted=false;return;}
      await backup.unlockPrepared(stored);agreed=true;
      if((backup.head?.revision||0)!==stored.revision||((backup.head?.sha256||null)!==stored.sha256)){
        if(!backup.remoteState||JSON.stringify(validateState(getState()))!==JSON.stringify(backup.remoteState))throw new BackupConflictError();
      }
      startWanted=false;backup.active=true;armed=true;
      if(backup.remoteState&&JSON.stringify(validateState(getState()))===JSON.stringify(backup.remoteState)){backup.lastSaved=JSON.stringify(backup.remoteState);status(`Mac已备份 · 版本 ${backup.head.revision}`);await remember();}
      else queue();
    });
  }
  return {render,onLocalChange:queue,pause,start};
}
