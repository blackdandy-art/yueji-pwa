// 月记自主实现的日期与周期模型。日期是当地日历日，不是时间戳。
import {MOOD_ITEMS,SYMPTOM_GROUPS,SEX_TYPES,PAIN_LEVELS,COLORS,DISCHARGE,HABITS,POOP_FORMS,POOP_FEELINGS,POOP_VOLUMES,POOP_DURATIONS,MEALS} from './record-options.js';
export const VERSION = 3;
export const FLOW = ['未记录','点滴','少量','中等','较多','很少','偏少','正常','偏多','很多'];
export const MOODS = ['未记录','平静','愉快','疲惫','低落','烦躁'];
export const SYMPTOMS = ['腹胀','头痛','乳房胀痛','腰酸','痘痘','失眠','食欲变化'];
export const DEFAULTS = {cycleLength:28,periodLength:5,predictionMode:'recent',autoPeriodLength:true,useOvulation:false,lutealLength:14};
const dayMs = 86400000;
export function parseDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式应为 YYYY-MM-DD');
  const [y,m,d]=value.split('-').map(Number);
  if(y<1900||y>2200) throw new Error('日期年份超出范围');
  const stamp=Date.UTC(y,m-1,d), date=new Date(stamp);
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d) throw new Error('日期不存在');
  return stamp/dayMs;
}
export function addDays(value,n){return new Date((parseDate(value)+n)*dayMs).toISOString().slice(0,10);}
export function diffDays(a,b){return parseDate(a)-parseDate(b);}
export function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function median(values){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2;}
export function emptyState(){return {version:VERSION,settings:{...DEFAULTS},periods:[],logs:{},plans:[]};}
const plain = v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export function validateSettings(input){
  if(!plain(input))throw new Error('周期设置格式不正确');
  return {
    cycleLength:integer(input.cycleLength,15,90,'默认周期'),periodLength:integer(input.periodLength,1,15,'默认经期'),
    predictionMode:input.predictionMode===undefined?'recent':option(input.predictionMode,['recent','manual','meiyou-legacy'],'预测方式'),
    autoPeriodLength:input.autoPeriodLength===undefined?true:boolean(input.autoPeriodLength,'自动估计经期'),
    useOvulation:input.useOvulation===undefined?false:boolean(input.useOvulation,'手动排卵修正'),
    lutealLength:input.lutealLength===undefined?14:integer(input.lutealLength,7,20,'排卵后间隔')
  };
}
function integer(value,min,max,label){if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}超出允许范围`);return value;}
function text(value,max,label){if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error(`${label}格式不正确`);return value;}
export function validatePeriod(period,others=[],asOf=today()){
  if(!plain(period))throw new Error('经期记录格式不正确');
  const start=text(period.start,10,'开始日期');parseDate(start);
  const end=period.end===null?null:text(period.end,10,'结束日期');if(end)parseDate(end);
  if(start>asOf||(end&&end>asOf))throw new Error('实际经期不能记录为未来日期');
  if(end&&end<start)throw new Error('结束日期不能早于开始日期');
  if(end&&diffDays(end,start)>60)throw new Error('单次记录超过 61 天，请检查日期');
  const id=text(period.id,100,'记录标识');if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('记录标识格式不正确');
  for(const other of others){if(other.id===id)continue;if(start<=(other.end||'2200-12-31')&&other.start<=(end||'2200-12-31'))throw new Error('经期与已有记录重叠，请先调整日期');}
  const times={};
  if(Object.hasOwn(period,'startTime'))times.startTime=time(period.startTime,'经期开始时间');
  if(Object.hasOwn(period,'endTime'))times.endTime=time(period.endTime,'经期结束时间');
  if(end===null&&times.endTime)throw new Error('未结束的经期不能填写结束时间');
  if(end===start&&times.startTime&&times.endTime&&times.endTime<times.startTime)throw new Error('同日经期的结束时间不能早于开始时间');
  return {id,start,end,...times};
}
// v1 字段保留原值；扩展选项使用具名值，备份不依赖资源 id。
const allSymptoms=[...new Set([...SYMPTOMS,...SYMPTOM_GROUPS.flatMap(g=>g.items)])];
const moodLabels=MOOD_ITEMS.map(m=>m.label);
function rejectUnsafeKeys(value){
  if(value===null||typeof value!=='object')return;
  if(!Array.isArray(value)&&!plain(value))throw new Error('记录对象格式不正确');
  for(const key of Object.keys(value)){
    if(['__proto__','constructor','prototype'].includes(key))throw new Error('备份包含不安全的属性');
    rejectUnsafeKeys(value[key]);
  }
}
function option(value,allowed,label,optional=false){
  if(optional&&value==='')return '';
  if(!allowed.includes(value))throw new Error(`${label}选项无效`);
  return value;
}
function options(value,allowed,label,max=allowed.length){
  if(!Array.isArray(value)||value.length>max||new Set(value).size!==value.length||value.some(v=>!allowed.includes(v)))throw new Error(`${label}选项无效或重复`);
  return [...value];
}
function time(value,label){
  if(value===''||typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return value;
  throw new Error(`${label}应为 HH:mm 或留空`);
}
function boolean(value,label){if(typeof value!=='boolean')throw new Error(`${label}须为布尔值`);return value;}
function number(value,min,max,label){
  if(value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||Math.abs(value*100-Math.round(value*100))>1e-7)throw new Error(`${label}须在 ${min}–${max} 范围内，最多两位小数`);
  return value;
}
function entryId(value,label){
  const id=text(value,100,`${label}标识`);
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error(`${label}标识格式不正确`);
  return id;
}
function entries(value,label,validator,max=20){
  if(!Array.isArray(value)||value.length>max)throw new Error(`${label}最多 ${max} 条`);
  const ids=new Set();
  return value.map(item=>{
    if(!plain(item))throw new Error(`${label}格式不正确`);
    const id=entryId(item.id,label);
    if(ids.has(id))throw new Error(`${label}标识重复`);
    ids.add(id);return {id,...validator(item)};
  });
}
function localDateTime(value,label){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error(`${label}应为 YYYY-MM-DDTHH:mm`);
  const date=value.slice(0,10), clock=time(value.slice(11),label);
  const [h,m]=clock.split(':').map(Number);
  return parseDate(date)*1440+h*60+m;
}
// 当地日历分钟差；不把没有时区的记录当成 UTC 或擅自调整夏令时。
export function sleepMinutes(record){return localDateTime(record.end,'清醒时间')-localDateTime(record.start,'入睡时间');}
// 合并重叠的当地日历时间段；保留用户填写的每一条原始记录。
export function totalSleepMinutes(records){
  const ranges=records.map(r=>[localDateTime(r.start,'入睡时间'),localDateTime(r.end,'清醒时间')]).sort((a,b)=>a[0]-b[0]);
  const merged=[];
  for(const [start,end] of ranges){const last=merged[merged.length-1];if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}
  return merged.reduce((sum,[start,end])=>sum+end-start,0);
}
function photo(value){
  const dataUrl=text(value,512*1024,'照片');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match||match[2].length%4!==0)throw new Error('照片须为本地 PNG、JPEG 或 WebP 图片');
  let bytes;try{bytes=atob(match[2]);}catch{throw new Error('照片 base64 格式不正确');}
  const codes=Array.from(bytes.slice(0,12),c=>c.charCodeAt(0));
  const valid=match[1]==='png'?codes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':match[1]==='jpeg'?codes[0]===255&&codes[1]===216&&codes[2]===255:bytes.slice(0,4)==='RIFF'&&bytes.slice(8,12)==='WEBP';
  if(!valid)throw new Error('照片内容与图片格式不符');
  return dataUrl;
}
export function blankLog(){
  return {flow:'未记录',flowTime:'',pain:0,painLevel:'未记录',ovulation:false,mood:'未记录',symptoms:[],notes:'',moods:[],customSymptoms:[],sexRecords:[],color:'',discharge:'',temperature:null,temperatureTime:'',weight:null,habits:[],sleepRecords:[],poopRecords:[],dietRecords:[],photos:[]};
}
export function validateLog(log){
  if(!plain(log))throw new Error('每日记录格式不正确');
  rejectUnsafeKeys(log);
  const known=blankLog();
  if(Object.keys(log).some(k=>!Object.hasOwn(known,k)))throw new Error('每日记录包含暂不支持的字段');
  const v={...known,...log};
  const customSymptoms=optionsText(v.customSymptoms,20,40,'自定义症状');
  const symptoms=options(v.symptoms,allSymptoms,'症状');
  if((symptoms.includes('没有症状')||customSymptoms.includes('没有症状'))&&(symptoms.length+customSymptoms.length>1))throw new Error('没有症状不能和其他症状同时记录');
  return {
    flow:option(v.flow,FLOW,'经量'),flowTime:time(v.flowTime,'经量记录时间'),pain:integer(v.pain,0,10,'疼痛程度'),painLevel:option(v.painLevel,PAIN_LEVELS,'痛经程度'),ovulation:boolean(v.ovulation,'手动排卵标记'),mood:option(v.mood,MOODS,'旧版心情'),
    symptoms,notes:text(v.notes,4000,'备注'),moods:options(v.moods,moodLabels,'心情'),customSymptoms,
    sexRecords:entries(v.sexRecords,'房事',r=>({time:time(r.time,'房事时间'),type:option(r.type,SEX_TYPES,'房事措施')})),
    color:option(v.color,COLORS,'经血颜色',true),discharge:option(v.discharge,DISCHARGE,'白带',true),
    temperature:number(v.temperature,30,45,'体温'),temperatureTime:time(v.temperatureTime,'测温时间'),weight:number(v.weight,1,500,'体重'),
    habits:options(v.habits,HABITS,'习惯'),
    sleepRecords:entries(v.sleepRecords,'睡眠',r=>{
      localDateTime(r.start,'入睡时间');localDateTime(r.end,'清醒时间');
      const minutes=sleepMinutes(r);if(minutes<=0||minutes>48*60)throw new Error('清醒时间须晚于入睡时间，单次睡眠不超过 48 小时');
      return {start:r.start,end:r.end};
    }),
    poopRecords:entries(v.poopRecords,'排便',r=>({time:time(r.time,'排便时间'),form:option(r.form,[...POOP_FORMS,'凹凸块状','表面裂纹','光滑条状','水状'],'排便形状',true),feeling:option(r.feeling,[...POOP_FEELINGS,'顺畅','费力','疼痛','排不尽'],'排便感受',true),volume:option(r.volume,[...POOP_VOLUMES,'非常少'],'排便量',true),minutes:number(r.minutes,0,240,'排便用时'),durationLabel:option(r.durationLabel??'',POOP_DURATIONS,'排便用时档位',true)})),
    dietRecords:entries(v.dietRecords,'饮食',r=>({time:time(r.time,'用餐时间'),meal:option(r.meal,MEALS,'餐次'),food:text(r.food,1000,'食物详情'),calories:number(r.calories,0,20000,'热量')})),
    photos:entries(v.photos,'照片',r=>({dataUrl:photo(r.dataUrl)}),3)
  };
}
function optionsText(value,maxCount,maxLength,label){
  if(!Array.isArray(value)||value.length>maxCount)throw new Error(`${label}最多 ${maxCount} 项`);
  const result=value.map(v=>{
    const valid=text(v,maxLength,label);
    if(!valid.trim()||valid!==valid.trim()||/[\u0000-\u001f\u007f]/.test(valid))throw new Error(`${label}须为不含控制字符的文字`);
    return valid;
  });
  return [...new Set(result)];
}
export function logSummary(log){
  const v=validateLog(log),labels=[];
  if(v.flow!=='未记录')labels.push(`经量${v.flow}`);
  if(v.painLevel!=='未记录')labels.push(`痛经${v.painLevel}`);
  if(v.pain)labels.push(`疼痛 ${v.pain}/10`);
  if(v.ovulation)labels.push('手动标记排卵日');
  const moods=[...new Set([...v.moods,...(v.mood==='未记录'?[]:[v.mood])])];
  labels.push(...moods,...v.symptoms,...v.customSymptoms);
  if(v.sexRecords.length)labels.push(`房事 ${v.sexRecords.length} 次`);
  if(v.color)labels.push(v.color);if(v.discharge)labels.push(`白带${v.discharge}`);
  if(v.temperature!==null)labels.push(`体温 ${v.temperature} ℃`);
  if(v.weight!==null)labels.push(`体重 ${v.weight} kg`);
  if(v.sleepRecords.length)labels.push(`睡眠 ${totalSleepMinutes(v.sleepRecords)} 分钟`);
  labels.push(...v.habits);
  if(v.poopRecords.length)labels.push(`排便 ${v.poopRecords.length} 次`);
  if(v.dietRecords.length)labels.push(`饮食 ${v.dietRecords.length} 条`);
  if(v.photos.length)labels.push(`照片 ${v.photos.length} 张`);
  if(v.notes)labels.push('有日记');
  return labels.join(' · ');
}
export function validateState(input,asOf=today()){
  if(!plain(input)||![1,2,VERSION].includes(input.version)||!plain(input.settings)||!Array.isArray(input.periods)||!plain(input.logs))throw new Error('不是月记支持的备份文件');
  rejectUnsafeKeys(input);parseDate(asOf);
  const state=emptyState();
  state.settings=validateSettings(input.settings);
  if(input.periods.length>5000||Object.keys(input.logs).length>30000)throw new Error('备份记录数量过多');
  const ids=new Set();for(const p of input.periods){if(ids.has(p?.id))throw new Error('经期记录标识重复');const valid=validatePeriod(p,state.periods,asOf);ids.add(valid.id);state.periods.push(valid);}
  const now=new Date(), futureLimit=parseDate(asOf)*1440+(asOf===today()?now.getHours()*60+now.getMinutes():1439);
  for(const [date,log]of Object.entries(input.logs)){
    parseDate(date);if(date>asOf)throw new Error('每日记录不能是未来日期');
    const valid=validateLog(log);
    for(const r of valid.sleepRecords){
      if(r.start.slice(0,10)!==date&&r.end.slice(0,10)!==date)throw new Error('睡眠的入睡日或清醒日须对应记录日期');
      if(localDateTime(r.end,'清醒时间')>futureLimit)throw new Error('睡眠清醒时间不能是未来时间');
    }
    state.logs[date]=valid;
  }
  state.plans=validatePlans(input.plans===undefined?[]:input.plans);
  state.periods.sort((a,b)=>a.start.localeCompare(b.start));return state;
}
// 计划是用户自行填写的当地日期；允许未来日期，不等于应用内原生通知。
export function validatePlans(plans){
  rejectUnsafeKeys(plans);
  return entries(plans,'计划',p=>{
    const known=['id','date','time','title','repeat','remindBefore'];
    if(Object.keys(p).some(k=>!known.includes(k)))throw new Error('计划包含暂不支持的字段');
    parseDate(p.date);
    const title=text(p.title,200,'计划内容').trim();
    if(!title)throw new Error('计划内容不能为空');
    return {date:p.date,time:time(p.time,'计划时间'),title,repeat:option(p.repeat,['none','weekly','monthly','yearly'],'计划重复方式'),remindBefore:p.remindBefore===null?null:integer(p.remindBefore,0,43200,'计划提前提醒分钟')};
  },1000);
}
export function plansOnDate(plans,date){
  parseDate(date);
  return validatePlans(plans).filter(p=>{
    if(date<p.date)return false;
    if(p.repeat==='none')return p.date===date;
    if(p.repeat==='weekly')return diffDays(date,p.date)%7===0;
    if(p.repeat==='monthly')return date.slice(8)===p.date.slice(8);
    return date.slice(5)===p.date.slice(5);
  });
}
function icsText(value){return value.replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');}
function foldICS(line){
  const encoder=new TextEncoder();let output='',part='',octets=0;
  for(const char of line){
    const size=encoder.encode(char).length;
    if(octets+size>75){output+=part+'\r\n';part=' ';octets=1;}
    part+=char;octets+=size;
  }
  return output+part;
}
export function plannedICS(plan){
  const p=validatePlans([plan])[0],date=p.date.replaceAll('-','');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yueji//User Plans//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    'UID:'+p.id+'@yueji.local','DTSTAMP:'+stamp,p.time?'DTSTART:'+date+'T'+p.time.replace(':','')+'00':'DTSTART;VALUE=DATE:'+date,
    'SUMMARY:'+icsText(p.title)];
  if(p.repeat!=='none')lines.push('RRULE:FREQ='+({weekly:'WEEKLY',monthly:'MONTHLY',yearly:'YEARLY'}[p.repeat]));
  if(p.remindBefore!==null)lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT'+p.remindBefore+'M','DESCRIPTION:'+icsText(p.title),'END:VALARM');
  lines.push('END:VEVENT','END:VCALENDAR','');
  return lines.map(foldICS).join('\r\n');
}
export function cycleStats(state,asOf=today()){
  parseDate(asOf);
  const settings=validateSettings(state.settings);
  // A historical view must not learn from a later start or a later end.
  const periods=state.periods.filter(p=>p.start<=asOf).map(p=>p.end&&p.end>asOf?{...p,end:null,endTime:''}:{...p}).sort((a,b)=>a.start.localeCompare(b.start));
  const allIntervals=periods.slice(1).map((p,i)=>diffDays(p.start,periods[i].start));
  const intervals=allIntervals.filter(n=>n>=15&&n<=90).slice(-6);
  let cycleLength=settings.cycleLength,cycleSource='settings',cycleSamples=0,legacyReason=null;
  if(settings.predictionMode==='recent'&&intervals.length){cycleLength=Math.round(median(intervals));cycleSource='recent';cycleSamples=intervals.length;}
  if(settings.predictionMode==='meiyou-legacy'){
    // Independent local implementation of the observed older calibration rule.
    // Calendar-day arithmetic and numeric sorting deliberately fix old-script defects.
    const sample=periods.slice(-10),recentNine=sample.slice(1).map((p,i)=>diffDays(p.start,sample[i].start));
    if(sample.length<10||sample.slice(0,-1).some(p=>!p.end))legacyReason='not-enough';
    else if(diffDays(asOf,sample[0].start)>365)legacyReason='too-old';
    else if(recentNine.some(n=>n<15||n>90))legacyReason='invalid-interval';
    else {
      cycleSamples=9;
      const sorted=[...recentNine].sort((a,b)=>a-b),mean=values=>Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10;
      const middle=median(recentNine),recentMean=mean(recentNine.slice(-4)),trimmedMean=mean(sorted.slice(1,-1));
      if([recentMean,middle,trimmedMean].every(n=>Math.abs(n-settings.cycleLength)>5)){
        cycleLength=Math.round(middle);cycleSource='legacy';legacyReason='calibrated';
      }else legacyReason='within-threshold';
    }
  }
  const durations=periods.filter(p=>p.end).map(p=>diffDays(p.end,p.start)+1).filter(n=>n>=1&&n<=15).slice(-6);
  const useDuration=settings.autoPeriodLength&&durations.length>0;
  const periodLength=useDuration?Math.round(median(durations)):settings.periodLength;
  const latest=periods.at(-1)||null;
  const baselineStart=latest?addDays(latest.start,cycleLength):null;
  let predictedStart=baselineStart,ovulationDate=null,ovulationStatus=settings.useOvulation?'none':'off';
  if(settings.useOvulation&&latest){
    const marks=Object.entries(state.logs||{}).filter(([date,log])=>date>latest.start&&date<=asOf&&(!latest.end||date>latest.end)&&log.ovulation===true).map(([date])=>date).sort();
    marks.forEach(parseDate);
    if(marks.length===1){ovulationDate=marks[0];ovulationStatus='applied';predictedStart=addDays(ovulationDate,settings.lutealLength);}
    else if(marks.length>1)ovulationStatus='conflict';
  }
  const active=latest&&!latest.end?latest:null;
  const blockedReason=active&&diffDays(asOf,active.start)>=cycleLength?'ongoing-overdue':null;
  if(blockedReason)predictedStart=null;
  const predictedEnd=predictedStart?addDays(predictedStart,periodLength-1):null;
  const until=predictedStart?diffDays(predictedStart,asOf):null;
  const cycleDay=latest?diffDays(asOf,latest.start)+1:null;
  const range=intervals.length?[Math.min(...intervals),Math.max(...intervals)]:null;
  const showRange=latest&&settings.predictionMode==='recent'&&intervals.length>=2&&ovulationStatus!=='applied'&&!blockedReason;
  const prediction={mode:settings.predictionMode,cycleSource,cycleSamples,durationSource:useDuration?'recent':'settings',durationSamples:useDuration?durations.length:0,legacyReason,ovulationDate,ovulationStatus,baselineStart,rangeStart:showRange?addDays(latest.start,range[0]):null,rangeEnd:showRange?addDays(latest.start,range[1]):null,blockedReason};
  return {asOf,periods,intervals,excluded:allIntervals.filter(n=>n<15||n>90).length,cycleLength,periodLength,latest,predictedStart,predictedEnd,until,active,cycleDay,range,prediction};
}
export function calendarMark(date,state,stats){
  const asOf=stats.asOf||today(),actual=(stats.periods||state.periods).find(p=>p.start<=asOf&&p.start<=date&&date<=(p.end&&p.end<=asOf?p.end:asOf));
  return {actual:!!actual,predicted:!actual&&!!stats.predictedStart&&date>=stats.predictedStart&&date<=stats.predictedEnd,logged:date<=asOf&&!!state.logs[date]};
}
export function periodQuickEntry(periods,date=today(),asOf=today()){
  parseDate(date);parseDate(asOf);
  if(date>asOf)return {status:'future',action:'none',label:'未来日期不能记录',title:'尚未发生',detail:date,periodId:null,day:null};
  const ordered=[...periods].sort((a,b)=>a.start.localeCompare(b.start));
  const p=ordered.find(p=>p.start<=date&&date<=(p.end||asOf));
  if(p){const day=diffDays(date,p.start)+1;
    if(!p.end)return {status:'ongoing',action:'finish',label:'月经结束了',title:`经期第${day}天`,detail:`${p.start} 开始 · 进行中`,periodId:p.id,day};
    return {status:p.end===date?'ended':'recorded',action:'none',label:p.end===date?'已记录结束':'已记录经期',title:p.end===date?'经期已结束':`经期第${day}天`,detail:`${p.start} — ${p.end}`,periodId:p.id,day};
  }
  if(ordered.some(p=>p.start>date))return {status:'history',action:'edit',label:'补记这次经期',title:'补记经期',detail:'选择开始和结束日期',periodId:null,day:null};
  return {status:'ready',action:'start',label:'月经来了',title:'记录经期',detail:date===asOf?'记录今天':'记录所选日期',periodId:null,day:null};
}
const periodSignature=periods=>JSON.stringify(periods.map(p=>[p.id,p.start,p.end??null,p.startTime??'',p.endTime??'']).sort((a,b)=>a[0].localeCompare(b[0])));
export function quickPeriodChange(periods,action,date,periodId,newId,asOf=today()){
  const initial=emptyState();initial.periods=periods;
  const before=validateState(initial,asOf).periods,entry=periodQuickEntry(before,date,asOf);
  if(entry.action!==action||!['start','finish'].includes(action))throw new Error('经期状态已变化，请核对当前记录');
  let record;
  if(action==='start')record={id:newId,start:date,end:null};
  else {if(entry.periodId!==periodId)throw new Error('这次经期已变化，请重新打开');record={...before.find(p=>p.id===periodId),end:date};}
  if(action==='start'&&before.some(p=>p.id===newId))throw new Error('记录标识重复，请重试');
  const next=emptyState();next.periods=action==='start'?[...before,record]:before.map(p=>p.id===record.id?record:p);
  const after=validateState(next,asOf).periods;
  return {before,after,message:`已记录 ${date} ${action==='start'?'开始':'结束'}`};
}
export function undoQuickPeriod(periods,change,asOf=today()){
  if(periodSignature(periods)!==periodSignature(change.after))throw new Error('经期已有后续修改，请在日期记录中调整');
  const s=emptyState();s.periods=change.before;return validateState(s,asOf).periods;
}
export function createDemo(asOf=today()){
  // Fictional examples, relative to the current date so the default 30-day view stays useful.
  // A new state is returned each time; the caller keeps it separate from real records.
  const s=emptyState();
  for(const offset of [63,35,6]){const start=addDays(asOf,-offset);s.periods.push({id:`demo-${offset}`,start,end:addDays(start,4)});}
  const sample=(offset,title,fields)=>{s.logs[addDays(asOf,-offset)]={...blankLog(),...fields,notes:'虚构演示样本：'+title+'。仅用于查看建议，不代表真实健康状况。'};};
  sample(35,'经期初的轻度痛经与腰酸',{flow:'中等',pain:3,painLevel:'轻度',symptoms:['腰酸']});
  sample(34,'上一周期的较重痛经与腰背痛',{painLevel:'重度',symptoms:['腰酸','背痛']});
  sample(18,'鼻塞、流鼻涕与咳嗽',{symptoms:['鼻塞','流鼻涕','咳嗽','身体酸痛']});
  sample(20,'所记录的排卵痛与分泌物增多',{symptoms:['排卵痛','白带增多'],discharge:'蛋清状'});
  sample(12,'经前焦虑、烦躁与乳房胀痛',{moods:['焦虑','烦躁'],symptoms:['乳房胀痛','失眠','疲惫']});
  sample(10,'经前压力、粉刺与食欲变化',{moods:['压力','内耗'],symptoms:['粉刺','头发出油','食欲旺盛','贪甜食']});
  sample(8,'历史腹痛、呕吐与晕厥，展示紧急提醒',{pain:8,painLevel:'重度',symptoms:['腹痛','呕吐','晕厥']});
  sample(7,'腹部胀气、腹痛与便秘',{symptoms:['胃肠胀气','腹痛','便秘','放屁多']});
  sample(6,'经量多、痛经与乏力、苍白或心悸',{flow:'偏多',painLevel:'中度',symptoms:['疲惫','面色苍白','心悸','腰酸']});
  sample(5,'本周期的较重痛经与腰背痛',{painLevel:'重度',symptoms:['腰酸','背痛']});
  sample(4,'豆腐渣样分泌物与阴道瘙痒',{symptoms:['豆腐渣样','阴道瘙痒']});
  sample(3,'尿频、背痛与发热',{symptoms:['尿频','背痛','发烧']});
  sample(2,'鱼腥气味与灰白色分泌物',{symptoms:['鱼腥臭味','灰白色']});
  const day=addDays(asOf,-1);
  sample(1,'平静的一天与睡眠记录',{moods:['挺开心','放松'],symptoms:['没有症状'],sexRecords:[{id:'demo-love',time:'20:30',type:'避孕套'}],temperature:36.65,temperatureTime:'07:00',weight:58.2,habits:['喝水'],sleepRecords:[{id:'demo-sleep',start:`${addDays(day,-1)}T22:00`,end:`${day}T07:00`}]});
  sample(0,'头痛、恶心与声音敏感',{symptoms:['头痛','恶心反胃','听力敏感']});
  return s;
}
export function calendarICS(stats){if(!stats.predictedStart)return null;const d=s=>s.replaceAll('-','');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yueji//Local Period Estimate//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:yueji-${d(stats.predictedStart)}@local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${d(stats.predictedStart)}`,`DTEND;VALUE=DATE:${d(addDays(stats.predictedEnd,1))}`,'SUMMARY:月记 · 经期预计日期','DESCRIPTION:仅为基于本地记录的估计。不可用于避孕或诊断。','END:VEVENT','END:VCALENDAR',''].join('\r\n');}
