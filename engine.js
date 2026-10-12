// 月记自主实现的日期与周期模型。日期是当地日历日，不是时间戳。
export const VERSION = 1;
export const FLOW = ['未记录','点滴','少量','中等','较多'];
export const MOODS = ['未记录','平静','愉快','疲惫','低落','烦躁'];
export const SYMPTOMS = ['腹胀','头痛','乳房胀痛','腰酸','痘痘','失眠','食欲变化'];
export const DEFAULTS = {cycleLength:28,periodLength:5};
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
export function emptyState(){return {version:VERSION,settings:{...DEFAULTS},periods:[],logs:{}};}
const plain = v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
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
  return {id,start,end};
}
export function validateLog(log){
  if(!plain(log))throw new Error('每日记录格式不正确');
  if(!FLOW.includes(log.flow)||!MOODS.includes(log.mood))throw new Error('经量或心情选项无效');
  integer(log.pain,0,10,'疼痛程度');
  if(!Array.isArray(log.symptoms)||log.symptoms.length>SYMPTOMS.length||new Set(log.symptoms).size!==log.symptoms.length||log.symptoms.some(s=>!SYMPTOMS.includes(s)))throw new Error('症状选项无效');
  return {flow:log.flow,pain:log.pain,mood:log.mood,symptoms:[...log.symptoms],notes:text(log.notes,2000,'备注')};
}
export function validateState(input,asOf=today()){
  if(!plain(input)||input.version!==VERSION||!plain(input.settings)||!Array.isArray(input.periods)||!plain(input.logs))throw new Error('不是月记支持的备份文件');
  const state=emptyState();
  state.settings={cycleLength:integer(input.settings.cycleLength,15,90,'默认周期'),periodLength:integer(input.settings.periodLength,1,15,'默认经期')};
  if(input.periods.length>5000||Object.keys(input.logs).length>30000)throw new Error('备份记录数量过多');
  const ids=new Set();for(const p of input.periods){if(ids.has(p?.id))throw new Error('经期记录标识重复');const valid=validatePeriod(p,state.periods,asOf);ids.add(valid.id);state.periods.push(valid);}
  for(const [date,log]of Object.entries(input.logs)){parseDate(date);if(date>asOf)throw new Error('每日记录不能是未来日期');state.logs[date]=validateLog(log);}
  state.periods.sort((a,b)=>a.start.localeCompare(b.start));return state;
}
export function cycleStats(state,asOf=today()){
  const periods=[...state.periods].sort((a,b)=>a.start.localeCompare(b.start));
  const allIntervals=periods.slice(1).map((p,i)=>diffDays(p.start,periods[i].start));
  const intervals=allIntervals.filter(n=>n>=15&&n<=90).slice(-6);
  const cycleLength=intervals.length?Math.round(median(intervals)):state.settings.cycleLength;
  const durations=periods.filter(p=>p.end).map(p=>diffDays(p.end,p.start)+1).filter(n=>n>=1&&n<=15).slice(-6);
  const periodLength=durations.length?Math.round(median(durations)):state.settings.periodLength;
  const latest=periods.at(-1)||null;
  const predictedStart=latest?addDays(latest.start,cycleLength):null;
  const predictedEnd=predictedStart?addDays(predictedStart,periodLength-1):null;
  const until=predictedStart?diffDays(predictedStart,asOf):null;
  const active=latest&&!latest.end?latest:null;
  const cycleDay=latest?diffDays(asOf,latest.start)+1:null;
  return {periods,intervals,excluded:allIntervals.length-allIntervals.filter(n=>n>=15&&n<=90).length,cycleLength,periodLength,latest,predictedStart,predictedEnd,until,active,cycleDay,range:intervals.length?[Math.min(...intervals),Math.max(...intervals)]:null};
}
export function calendarMark(date,state,stats){
  const actual=state.periods.find(p=>p.start<=date&&date<=(p.end||today()));
  return {actual:!!actual,predicted:!actual&&!!stats.predictedStart&&date>=stats.predictedStart&&date<=stats.predictedEnd,logged:!!state.logs[date]};
}
export function createDemo(asOf=today()){
  const s=emptyState();for(const offset of [92,63,35]){const start=addDays(asOf,-offset);s.periods.push({id:`demo-${offset}`,start,end:addDays(start,4)});}s.logs[addDays(asOf,-35)]={flow:'中等',pain:3,mood:'疲惫',symptoms:['腰酸'],notes:'演示记录：今天早点休息。'};return s;
}
export function calendarICS(stats){if(!stats.predictedStart)return null;const d=s=>s.replaceAll('-','');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Yueji//Local Period Estimate//ZH','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:yueji-${d(stats.predictedStart)}@local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${d(stats.predictedStart)}`,`DTEND;VALUE=DATE:${d(addDays(stats.predictedEnd,1))}`,'SUMMARY:月记 · 经期预计日期','DESCRIPTION:仅为基于本地记录的估计。不可用于避孕或诊断。','END:VEVENT','END:VCALENDAR',''].join('\r\n');}
