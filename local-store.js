export class RecordConflictError extends Error {
  constructor(){super('记录已在另一窗口更新，请刷新页面后重试。当前修改尚未保存。');this.name='RecordConflictError';}
}

// Keep the raw snapshot read by this window. A stale window must not overwrite
// records saved elsewhere, including when an editor has been open for a while.
export function createLocalStore(storage,key){
  let baseline;
  const check=()=>{if(baseline===undefined||storage.getItem(key)!==baseline)throw new RecordConflictError();};
  return {
    read(){baseline=storage.getItem(key);return baseline;},
    save(raw){check();storage.setItem(key,raw);baseline=raw;},
    clear(){check();storage.removeItem(key);baseline=null;}
  };
}
