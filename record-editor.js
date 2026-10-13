import {blankLog, validateLog, logSummary, FLOW, SYMPTOMS, addDays, sleepMinutes, validatePlans, plansOnDate} from './engine.js';
import {MOOD_ITEMS, SYMPTOM_GROUPS, SEX_TYPES, PAIN_LEVELS, COLORS, DISCHARGE, HABITS, POOP_FORMS, POOP_FEELINGS, POOP_VOLUMES, POOP_DURATIONS, MEALS} from './record-options.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => `r-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const sections = [
  ['time','◷','记下具体时间',['flowTime']],
  ['pain','◒','痛经',['pain','painLevel']],
  ['flow','◒','流量',['flow']],
  ['color','◈','颜色',['color']],
  ['care','♡','呵护',[]],
  ['ovulation','◇','排卵日',['ovulation']],
  ['sex','♡','爱爱',['sexRecords']],
  ['mood','☺','心情',['moods','mood']],
  ['symptom','❧','症状',['symptoms','customSymptoms']],
  ['discharge','◈','白带',['discharge']],
  ['temperature','°','体温',['temperature','temperatureTime']],
  ['weight','⚖','体重',['weight']],
  ['sleep','☾','睡眠',['sleepRecords']],
  ['habit','✓','好习惯',['habits']],
  ['poop','◉','便便',['poopRecords']],
  ['diet','♧','饮食',['dietRecords']],
  ['diary','✎','日记',['notes','photos']]
];
const labels = Object.fromEntries(sections.map(([key,,label]) => [key,label]));
function summary(log, keys) {
  if(!keys.length)return '做一张关爱卡';
  if(keys.length===1&&keys[0]==='flowTime')return log.flowTime||'未记录';
  if(keys.includes('temperature'))return log.temperature===null?'未记录':`${log.temperature} ℃`;
  if(keys.length===1){const key=keys[0],value=log[key];
    if(['flow','color','discharge'].includes(key))return value||'未记录';
    if(key==='temperature')return value===null?'未记录':`${value} ℃`;
    if(key==='weight')return value===null?'未记录':`${value} kg`;
    if(['sexRecords','poopRecords'].includes(key))return value.length?`${value.length} 次`:'未记录';
    if(key==='dietRecords')return value.length?`${value.length} 条`:'未记录';
    if(key==='sleepRecords'){const minutes=value.reduce((n,r)=>n+sleepMinutes(r),0);return value.length?`${Math.floor(minutes/60)} 小时${minutes%60?' '+minutes%60+' 分钟':''}`:'未记录';}
    if(key==='ovulation')return value?'已标记':'未记录';
  }
  if(keys.includes('painLevel'))return [log.painLevel==='未记录'?'':log.painLevel,log.pain?`${log.pain}/10`:''].filter(Boolean).join(' · ')||'未记录';
  if(keys.includes('notes'))return [log.notes?'已填写':'',log.photos.length?`${log.photos.length} 张照片`:''].filter(Boolean).join(' · ')||'未记录';
  const part = blankLog();
  for (const key of keys) part[key] = log[key];
  return logSummary(part) || '未记录';
}
export function dailyRecordHTML(date, input, hasRecord, period) {
  const log = validateLog(input);
  return `
    <div class="record-tiles">${sections.map(([key,icon,label,keys]) => `<button class="record-tile ${keys.length&&summary(log,keys)!=='未记录'?'has-record':''}" data-record-section="${key}"><span class="record-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${esc(summary(log,keys))}</small></span><span class="tile-arrow" aria-hidden="true">›</span></button>`).join('')}</div>
    ${hasRecord?'<div class="log-bottom"><button class="text-button" data-action="delete-log">删除这天的全部记录</button></div>':''}`;
}
export function dailyHistoryHTML(logs) {
  const dates = Object.keys(logs).sort().reverse();
  if (!dates.length) return '<article class="card daily-history"><h2>每日记录</h2><p class="muted">暂无记录</p></article>';
  const recent = dates.slice(0,30), count = items => {
    const freq = new Map();
    for (const date of recent) for (const value of new Set(items(logs[date]))) freq.set(value,(freq.get(value)||0)+1);
    return [...freq].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,n])=>`<span class="value-pill">${esc(label)} · ${n} 天</span>`).join('') || '<span class="muted">尚无记录</span>';
  };
  return `<article class="card daily-history"><div class="card-heading"><h2>每日记录</h2><span>最近 ${recent.length} 个记录日</span></div><div class="record-patterns"><div><h3>常记录的心情</h3><div class="chips">${count(l=>[...l.moods,...(l.mood==='未记录'?[]:[l.mood])])}</div></div><div><h3>常记录的症状</h3><div class="chips">${count(l=>[...l.symptoms,...l.customSymptoms])}</div></div></div><p class="small-label">按记录日统计。</p><div class="daily-timeline">${recent.map(date=>{const log=logs[date];return `<div class="daily-history-row"><button class="text-button" data-date="${date}">${date} ↗</button><p>${esc(logSummary(log)||'已记录')}</p>${log.notes?`<p class="journal-excerpt">${esc(log.notes)}</p>`:''}${log.photos.length?`<div class="history-photos">${log.photos.map(p=>`<img src="${esc(p.dataUrl)}" alt="${date} 日记照片" loading="lazy">`).join('')}</div>`:''}</div>`;}).join('')}</div>${dates.length>30?'<p class="muted">较早的记录仍可从日历查看，JSON 备份包含所有记录。</p>':''}</article>`;
}
const select = (name,title,choices,value,empty=false) => `<label>${title}<select name="${name}">${(empty?['',...choices]:choices).map(v=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(v||'未记录')}</option>`).join('')}</select></label>`;
const input = (name,title,value,type='text',attrs='') => `<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const chips = (choices, selected, name, extras={}) => choices.map((value,i)=>{const item=typeof value==='string'?{label:value}:value;return `<label class="choice-chip ${extras.emoji?'emoji-choice':''}" data-search-label="${esc(item.label)}"><input type="checkbox" name="${name}" value="${esc(item.label)}" ${selected.includes(item.label)?'checked':''}>${item.emoji?`<span class="choice-emoji" aria-hidden="true">${item.emoji}</span>`:''}<span>${esc(item.label)}</span></label>`;}).join('');

export function openDailyEditor({section,date,log,allLogs,onSave}) {
  if(section==='care'){openCareCard(date);return;}
  if (!labels[section]) return;
  const existing=document.querySelector('#record-dialog');if(existing)existing.remove();
  const dialog=document.createElement('dialog');dialog.id='record-dialog';dialog.className='record-dialog';dialog.setAttribute('aria-labelledby','record-editor-title');document.body.append(dialog);
  let draft=structuredClone(validateLog(log)), busy=false;
  const recordKey={sex:'sexRecords',sleep:'sleepRecords',poop:'poopRecords',diet:'dietRecords'}[section];
  const rowTitle={sex:'房事',sleep:'睡眠',poop:'排便',diet:'饮食'}[section];
  const defaultRow=()=>({id:uid(),...(section==='sex'?{time:'',type:'未记录措施'}:section==='sleep'?{start:`${addDays(date,-1)}T22:00`,end:`${date}T07:00`}:section==='poop'?{time:'',form:'',feeling:'',volume:'',minutes:null,durationLabel:''}:{time:'',meal:'早餐',food:'',calories:null})});
  const rowHTML=(r,i)=>`<fieldset class="record-row" data-row-id="${esc(r.id)}"><legend>${rowTitle} ${i+1}</legend><button type="button" class="row-remove" data-remove-row="${esc(r.id)}" aria-label="删除${rowTitle} ${i+1}">删除</button><div class="form-row">${section==='sex'?input('time','时间 · 可不填',r.time,'time')+select('type','措施 / 类型',SEX_TYPES,r.type):section==='sleep'?input('start','入睡时间',r.start,'datetime-local','required')+input('end','清醒时间',r.end,'datetime-local','required'):section==='poop'?input('time','时间 · 可不填',r.time,'time')+select('form','形状',POOP_FORMS.includes(r.form)||!r.form?POOP_FORMS:[...POOP_FORMS,r.form],r.form,true)+select('feeling','感受',POOP_FEELINGS.includes(r.feeling)||!r.feeling?POOP_FEELINGS:[...POOP_FEELINGS,r.feeling],r.feeling,true)+select('volume','量',POOP_VOLUMES.includes(r.volume)||!r.volume?POOP_VOLUMES:[...POOP_VOLUMES,r.volume],r.volume,true)+select('durationLabel','用时档位',POOP_DURATIONS,r.durationLabel||'',true)+input('minutes','用时 · 分钟',r.minutes,'number','min="0" max="240" step="0.01"'):select('meal','餐次',MEALS,r.meal)+input('time','用餐时间 · 可不填',r.time,'time')+input('calories','热量 · kcal，可不填',r.calories,'number','min="0" max="20000" step="0.01"')}</div>${section==='diet'?`<label>食物详情<textarea name="food" maxlength="1000" placeholder="吃了什么、份量……">${esc(r.food)}</textarea></label>`:''}</fieldset>`;
  function bodyHTML() {
    if(recordKey)return `<p class="muted">${section==='sex'?'可记录多次。':section==='sleep'?'可记录跨夜睡眠、小睡。':section==='diet'?'':''}</p><div class="record-rows">${draft[recordKey].map(rowHTML).join('')||'<div class="record-empty">这一天还没有这项记录。</div>'}</div><button type="button" class="button secondary" data-add-row>＋ 添加一条${rowTitle}记录</button><p class="small-label">最多 20 条。</p>`;
    switch(section){
      case 'flow':{const choices=['未记录','很少','偏少','正常','偏多','很多'];if(!choices.includes(draft.flow))choices.push(draft.flow);return select('flow','经量',choices,draft.flow)+'<p class="small-label">已有旧版经量值会保留。</p>';}
      case 'pain':return select('painLevel','痛经分级',PAIN_LEVELS,draft.painLevel)+`<label><span class="range-label"><span>疼痛分数 · 0 无痛，10 最痛</span><strong id="record-pain-value">${draft.pain}</strong></span><input name="pain" type="range" min="0" max="10" value="${draft.pain}"></label><p class="small-label">分级与分数分别记录。</p>`;
      case 'color':return select('color','经血颜色',COLORS,draft.color,true);
      case 'time':return input('flowTime','今日经期记录的时间 · 可不填',draft.flowTime,'time')+'<p class="small-label">经期开始 / 结束时间请在“大姨妈来了”中填写。</p>';
      case 'mood':return `<p class="muted">可多选。</p><div class="choice-grid mood-grid">${chips(MOOD_ITEMS,[...draft.moods,...(MOOD_ITEMS.some(m=>m.label===draft.mood)?[draft.mood]:[])],'moods',{emoji:true})}</div>${draft.mood!=='未记录'&&!MOOD_ITEMS.some(m=>m.label===draft.mood)?`<p class="small-label">旧版心情记录</p><div class="choice-grid">${chips([draft.mood],[draft.mood],'legacyMood')}</div>`:''}`;
      case 'symptom':{
        const known=new Set(SYMPTOM_GROUPS.flatMap(g=>g.items));
        const legacy=draft.symptoms.filter(s=>!known.has(s));
        const custom=[...new Set([...Object.values(allLogs).flatMap(l=>l.customSymptoms||[]),...draft.customSymptoms])];
        return `<input type="search" id="symptom-search" aria-label="搜索症状" placeholder="搜索症状"><p id="symptom-search-status" class="muted" role="status" hidden>无匹配症状</p><div class="symptom-groups">${SYMPTOM_GROUPS.map(g=>`<details open class="symptom-group"><summary>${g.label}</summary><div class="choice-grid">${chips(g.items,draft.symptoms,'symptoms')}</div></details>`).join('')}${legacy.length?`<div class="symptom-group"><h3>旧版症状</h3><div class="choice-grid">${chips(legacy,draft.symptoms,'symptoms')}</div></div>`:''}<div class="symptom-group"><h3>自定义症状</h3><div class="choice-grid" id="custom-symptoms">${chips(custom,draft.customSymptoms,'customSymptoms')}</div><div class="custom-add"><input id="custom-symptom-input" maxlength="40" aria-label="自定义症状名称" placeholder="输入症状名称"><button type="button" class="button secondary" data-add-custom>添加</button></div></div></div>`;
      }
      case 'discharge':return `${select('discharge','白带状态',DISCHARGE,draft.discharge,true)}`;
      case 'temperature':return `<div class="form-row">${input('temperature','体温 · ℃',draft.temperature,'number','min="30" max="45" step="0.01"')+input('temperatureTime','测量时间 · 可不填',draft.temperatureTime,'time')}</div>`;
      case 'weight':return input('weight','体重 · kg',draft.weight,'number','min="1" max="500" step="0.01"');
      case 'habit':return `<div class="choice-grid">${chips(HABITS,draft.habits,'habits')}</div>`;
      case 'ovulation':return `<label class="checkbox-label"><input name="ovulation" type="checkbox" ${draft.ovulation?'checked':''}>我想手动标记这一天</label><p class="muted">手动记录，不用于判断受孕或安全期。</p>`;
      case 'diary':return `<label>今天的日记<textarea name="notes" maxlength="4000" rows="6" placeholder="今天的感受、小小的发现……">${esc(draft.notes)}</textarea></label><p class="small-label">4000 字 · 3 张照片</p><div class="diary-photos">${draft.photos.map((p,i)=>`<div class="photo-card"><img src="${esc(p.dataUrl)}" alt="日记照片 ${i+1}"><button type="button" class="text-button" data-remove-photo="${esc(p.id)}">移除照片 ${i+1}</button></div>`).join('')}</div><label class="photo-picker">添加照片<input type="file" id="diary-photo-input" accept="image/*" multiple></label><p class="small-label">照片仅存本机。</p>`;
    }
  }
  function renderEditor(){
    dialog.innerHTML=`<form id="record-editor-form"><div class="record-dialog-head"><div><p class="eyebrow">${date}</p><h2 id="record-editor-title">${labels[section]}</h2></div><button type="button" class="close-button" data-editor-close aria-label="关闭记录窗口">×</button></div><div class="record-dialog-body">${bodyHTML()}</div><div class="record-dialog-foot"><p id="record-processing" class="small-label" role="status"></p><p id="record-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-editor-close>取消</button><button class="button primary" type="submit">保存${labels[section]}</button></div></div></form>`;
  }
  function collect(){
    const form=dialog.querySelector('form'), f=new FormData(form);
    const checked=name=>f.getAll(name);
    const numeric=value=>value===''?null:Number(value);
    if(recordKey)draft[recordKey]=[...dialog.querySelectorAll('[data-row-id]')].map(row=>{
      const value=name=>row.querySelector(`[name="${name}"]`).value;
      const r={id:row.dataset.rowId};
      if(section==='sex')return {...r,time:value('time'),type:value('type')};
      if(section==='sleep')return {...r,start:value('start'),end:value('end')};
      if(section==='poop')return {...r,time:value('time'),form:value('form'),feeling:value('feeling'),volume:value('volume'),minutes:numeric(value('minutes')),durationLabel:value('durationLabel')};
      return {...r,time:value('time'),meal:value('meal'),food:value('food'),calories:numeric(value('calories'))};
    });
    else switch(section){
      case 'flow':draft.flow=f.get('flow');break;
      case 'pain':draft.painLevel=f.get('painLevel');draft.pain=Number(f.get('pain'));break;
      case 'color':draft.color=f.get('color');break;
      case 'time':draft.flowTime=f.get('flowTime');break;
      case 'mood':draft.moods=checked('moods');if(!f.has('legacyMood'))draft.mood='未记录';break;
      case 'symptom':draft.symptoms=checked('symptoms');draft.customSymptoms=checked('customSymptoms');break;
      case 'discharge':draft.discharge=f.get('discharge');break;
      case 'temperature':draft.temperature=numeric(f.get('temperature'));draft.temperatureTime=f.get('temperatureTime');break;
      case 'weight':draft.weight=numeric(f.get('weight'));break;
      case 'habit':draft.habits=checked('habits');break;
      case 'ovulation':draft.ovulation=f.has('ovulation');break;
      case 'diary':draft.notes=f.get('notes');break;
    }
    return draft;
  }
  const error=message=>{dialog.querySelector('#record-error').textContent=message;};
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(busy)return;
    if(button.hasAttribute('data-editor-close')){closeEditor(dialog,`[data-record-section="${section}"]`);return;}
    if(button.hasAttribute('data-add-row')){
      collect();if(draft[recordKey].length>=20){error('每一天最多 20 条记录');return;}draft[recordKey].push(defaultRow());renderEditor();const row=dialog.querySelector('.record-rows').lastElementChild;row.scrollIntoView({block:'nearest'});row.querySelector('input,select')?.focus({preventScroll:true});
    }
    if(button.dataset.removeRow){collect();draft[recordKey]=draft[recordKey].filter(r=>r.id!==button.dataset.removeRow);renderEditor();}
    if(button.dataset.removePhoto){collect();draft.photos=draft.photos.filter(p=>p.id!==button.dataset.removePhoto);renderEditor();}
    if(button.hasAttribute('data-add-custom')){
      const value=dialog.querySelector('#custom-symptom-input').value.trim();if(!value){error('请先填写症状名称');return;}
      collect();if(draft.customSymptoms.length>=20){error('最多选择 20 项自定义症状');return;}
      draft.symptoms=draft.symptoms.filter(s=>s!=='没有症状');
      if(SYMPTOM_GROUPS.some(g=>g.items.includes(value))||SYMPTOMS.includes(value)){if(!draft.symptoms.includes(value))draft.symptoms.push(value);}
      else if(!draft.customSymptoms.includes(value))draft.customSymptoms.push(value);
      try{validateLog(draft);renderEditor();dialog.querySelector('#custom-symptoms').scrollIntoView({block:'nearest'});}catch(e){error(e.message);}
    }
  });
  dialog.addEventListener('input',event=>{
    if(event.target.name==='pain')dialog.querySelector('#record-pain-value').textContent=event.target.value;
    if(event.target.id==='symptom-search'){
      const query=event.target.value.trim();for(const chip of dialog.querySelectorAll('[data-search-label]'))chip.hidden=!chip.dataset.searchLabel.includes(query);
      for(const group of dialog.querySelectorAll('details.symptom-group')){group.open=true;group.hidden=![...group.querySelectorAll('[data-search-label]')].some(chip=>!chip.hidden);}
      dialog.querySelector('#symptom-search-status').hidden=[...dialog.querySelectorAll('[data-search-label]')].some(chip=>!chip.hidden);
    }
  });
  dialog.addEventListener('change',async event=>{
    const el=event.target;
    if(section==='symptom'&&el.type==='checkbox'&&el.checked){
      if(el.value==='没有症状')for(const c of dialog.querySelectorAll('input[type=checkbox]')){if(c!==el)c.checked=false;}
      else for(const c of dialog.querySelectorAll('input[type=checkbox]'))if(c.value==='没有症状')c.checked=false;
    }
    if(el.id==='diary-photo-input'){
      if(busy)return;collect();const files=[...el.files];if(draft.photos.length+files.length>3){error('日记最多保存 3 张照片');el.value='';return;}
      busy=true;const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);dialog.querySelector('form').setAttribute('aria-busy','true');dialog.querySelector('#record-processing').textContent='正在本机处理照片……';error('');
      const pending=[];
      try{for(const file of files)pending.push({id:uid(),dataUrl:await preparePhoto(file)});draft.photos.push(...pending);renderEditor();}catch(e){error(e.message);dialog.querySelector('#record-processing').textContent='';buttons.forEach(b=>b.disabled=false);dialog.querySelector('form').removeAttribute('aria-busy');el.value='';}finally{busy=false;}
    }
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;
    try{const valid=validateLog(collect());const result=onSave(valid);if(result===true)closeEditor(dialog,`[data-record-section="${section}"]`);else error(typeof result==='string'?result:'记录保存失败，请检查存储空间后重试。');}catch(e){error(e.message);}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)closeEditor(dialog,`[data-record-section="${section}"]`);});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  renderEditor();dialog.showModal();
}
function closeEditor(dialog, selector){
  if(dialog.classList.contains('closing'))return;
  const finish=()=>{if(!dialog.open)return;dialog.close();document.querySelector(selector)?.focus({preventScroll:true});};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
  dialog.classList.add('closing');dialog.addEventListener('animationend',finish,{once:true});setTimeout(finish,160);
}
function openCareCard(date){
  document.querySelector('#record-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='record-dialog';dialog.className='record-dialog';dialog.setAttribute('aria-labelledby','record-editor-title');
  dialog.innerHTML=`<form><div class="record-dialog-head"><div><p class="eyebrow">${date}</p><h2 id="record-editor-title">呵护 · 关爱卡</h2></div><button type="button" class="close-button" data-editor-close aria-label="关闭关爱卡">×</button></div><div class="record-dialog-body"><label>想让对方知道<textarea name="careMessage" maxlength="2000" rows="6">这几天我想多休息一会儿。希望你能多一点耐心和陪伴，谢谢你关心我。</textarea></label><p class="small-label">仅分享这段文字，不附带其他记录。由你选择收件人。</p></div><div class="record-dialog-foot"><p id="care-status" role="status" class="small-label"></p><div class="dialog-actions"><button type="button" class="button secondary" data-care-copy>复制文字</button><button type="submit" class="button primary">分享关爱卡</button></div></div></form>`;
  document.body.append(dialog);const message=()=>dialog.querySelector('textarea').value.trim(),status=value=>dialog.querySelector('#care-status').textContent=value;
  dialog.addEventListener('click',async e=>{if(e.target.closest('[data-editor-close]'))closeEditor(dialog,'[data-record-section="care"]');if(e.target.closest('[data-care-copy]'))try{if(!message())throw new Error('请先填写内容');await navigator.clipboard.writeText(message());status('文字已复制，请在你选择的聊天中粘贴。');}catch(error){status('无法自动复制，可以手动选中文字复制。');}});
  dialog.addEventListener('submit',async e=>{e.preventDefault();if(!message()){status('请先填写内容');return;}if(navigator.share)try{await navigator.share({title:'月记 · 关爱卡',text:message()});status('系统分享已完成。');}catch(error){status(error.name==='AbortError'?'已取消分享。':'系统分享未完成，可复制文字后自行发送。');}else status('当前浏览器不支持系统分享，请用“复制文字”后自行发送。');});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeEditor(dialog,'[data-record-section="care"]');});dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}

const repeatLabels={none:'不重复',weekly:'每周',monthly:'每月',yearly:'每年'};
export function plannedRecordsHTML(plans,date){
  const list=plansOnDate(plans,date);
  return `<div class="day-plans"><div class="card-heading"><h3>计划</h3><button class="text-button" data-new-plan>＋ 计划</button></div>${list.length?list.map(p=>`<div class="day-plan-row"><div><strong>${esc(p.title)}</strong><small>${p.time||'全天'} · ${repeatLabels[p.repeat]}</small></div><button class="text-button" data-plan-edit="${esc(p.id)}">编辑</button></div>`).join(''):'<p class="small-label">暂无计划</p>'}</div>`;
}
export function plansHistoryHTML(plans){
  if(!plans.length)return '';
  return `<article class="card daily-history"><div class="card-heading"><h2>我的计划</h2><button class="text-button" data-new-plan>＋ 添加</button></div>${[...plans].sort((a,b)=>a.date.localeCompare(b.date)).map(p=>`<div class="day-plan-row"><div><strong>${esc(p.title)}</strong><small>${p.date} ${p.time||'全天'} · ${repeatLabels[p.repeat]}</small></div><div class="plan-actions"><button class="text-button" data-plan-ics="${esc(p.id)}">导出日历</button><button class="text-button" data-plan-edit="${esc(p.id)}">编辑</button><button class="text-button" data-plan-delete="${esc(p.id)}">删除</button></div></div>`).join('')}</article>`;
}
export function openPlanEditor({plan,date,onSave}){
  document.querySelector('#record-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='record-dialog';dialog.className='record-dialog';dialog.setAttribute('aria-labelledby','record-editor-title');
  const p=plan||{id:uid(),date,time:'',title:'',repeat:'none',remindBefore:null};
  dialog.innerHTML=`<form id="plan-editor-form"><div class="record-dialog-head"><div><p class="eyebrow">计划</p><h2 id="record-editor-title">${plan?'编辑':'添加'}计划</h2></div><button type="button" class="close-button" data-editor-close aria-label="关闭计划窗口">×</button></div><div class="record-dialog-body">${input('title','计划内容',p.title,'text','required maxlength="200"')}<div class="form-row">${input('date','开始日期',p.date,'date','required')+input('time','时间 · 留空为全天',p.time,'time')}</div><div class="form-row"><label>重复<select name="repeat">${Object.entries(repeatLabels).map(([value,title])=>`<option value="${value}" ${p.repeat===value?'selected':''}>${title}</option>`).join('')}</select></label>${input('remindBefore','提前提醒 · 分钟，可不填',p.remindBefore,'number','min="0" max="43200" step="1"')}</div><p class="small-label">需要提醒时，在回顾页导出到系统日历。</p></div><div class="record-dialog-foot"><p class="form-error" id="record-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-editor-close>取消</button><button type="submit" class="button primary">保存计划</button></div></div></form>`;
  document.body.append(dialog);
  dialog.addEventListener('click',e=>{if(e.target.closest('[data-editor-close]'))closeEditor(dialog,'.page.active [data-new-plan]');});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeEditor(dialog,'[data-new-plan]');});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(dialog.querySelector('form'));try{const valid=validatePlans([{id:p.id,title:f.get('title').trim(),date:f.get('date'),time:f.get('time'),repeat:f.get('repeat'),remindBefore:f.get('remindBefore')===''?null:Number(f.get('remindBefore'))}])[0];const result=onSave(valid);if(result===true)closeEditor(dialog,'[data-new-plan]');else dialog.querySelector('#record-error').textContent=result;}catch(error){dialog.querySelector('#record-error').textContent=error.message;}});
  dialog.showModal();
}
async function preparePhoto(file){
  if(!file.type.startsWith('image/')||file.size>25*1024*1024)throw new Error('请选择 25 MB 以内的图片');
  const url=URL.createObjectURL(file), img=new Image();
  try{
    img.src=url;try{await img.decode();}catch{throw new Error('浏览器无法读取这张照片，请选择 JPEG、PNG 或 WebP 图片');}
    const scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法处理照片');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    for(const quality of [.82,.65,.45,.25]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=512*1024)return data;}
    throw new Error('照片处理后仍然过大，请选择较小的图片');
  }finally{URL.revokeObjectURL(url);}
}
