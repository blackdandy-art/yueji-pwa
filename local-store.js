export class RecordConflictError extends Error {
  constructor(){super('记录已在另一窗口更新，请刷新页面后重试。当前修改尚未保存。');this.name='RecordConflictError';}
}
const versionOf=raw=>{try{return JSON.parse(raw)?.version;}catch{return null;}};

// A stale window cannot overwrite newer records. Before the first v3 save,
// retain the exact old bytes locally; a failed backup must leave the main key intact.
export function createLocalStore(storage,key){
  let baseline;
  const backupKey=key+':before-prediction-v3';
  const check=()=>{if(baseline===undefined||storage.getItem(key)!==baseline)throw new RecordConflictError();};
  return {
    read(){baseline=storage.getItem(key);return baseline;},
    readUpgradeBackup(){return storage.getItem(backupKey);},
    save(raw){
      check();
      if([1,2].includes(versionOf(baseline))&&versionOf(raw)===3&&storage.getItem(backupKey)===null)storage.setItem(backupKey,baseline);
      storage.setItem(key,raw);baseline=raw;
    },
    clear(){check();storage.removeItem(backupKey);storage.removeItem(key);baseline=null;}
  };
}
