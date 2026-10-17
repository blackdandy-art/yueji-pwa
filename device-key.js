// Non-extractable CryptoKey objects stay in this origin's IndexedDB, not the cloud.
function openDB(appPath){return new Promise((resolve,reject)=>{const request=indexedDB.open(`yueji-device-keys:${appPath}`,1);request.onupgradeneeded=()=>request.result.createObjectStore('keys');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('当前浏览器无法保管设备密钥，请先导出本地备份'));request.onblocked=()=>reject(new Error('设备密钥存储被其他窗口占用'));});}
async function transaction(appPath,mode,operation){
  const db=await openDB(appPath);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('keys',mode);let result;const request=operation(tx.objectStore('keys'));request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(new Error('设备密钥保存失败，尚未开启自动备份'));tx.onabort=()=>reject(new Error('设备密钥保存已取消'));});}finally{db.close();}
}
export const loadDeviceKey=(appPath,userId)=>transaction(appPath,'readonly',store=>store.get(userId));
export const saveDeviceKey=(appPath,userId,record)=>transaction(appPath,'readwrite',store=>store.put(record,userId));
export const removeDeviceKey=(appPath,userId)=>transaction(appPath,'readwrite',store=>store.delete(userId));
