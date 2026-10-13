import {addDays,diffDays,parseDate,today} from './engine.js';

// Descriptive, local-only feedback. These thresholds select content, not diagnoses.
export const HEALTH_SOURCES = [
  {id:'pms',title:'NHS · 经前不适与日常照护',url:'https://www.nhs.uk/conditions/pre-menstrual-syndrome/'},
  {id:'pain',title:'NHS · 经期疼痛',url:'https://www.nhs.uk/symptoms/period-pain/'},
  {id:'flow',title:'NHS · 经量与持续时间',url:'https://www.nhs.uk/conditions/heavy-periods/'},
  {id:'sleep',title:'NHS · 睡眠习惯',url:'https://www.nhs.uk/conditions/insomnia/'},
  {id:'discharge',title:'NHS · 分泌物变化',url:'https://www.nhs.uk/symptoms/vaginal-discharge/'},
  {id:'faint',title:'NHS · 晕厥与求助',url:'https://www.nhs.uk/symptoms/fainting/'},
  {id:'breast',title:'NHS · 乳房肿块',url:'https://www.nhs.uk/symptoms/breast-lump/'}
];
const distress=new Set(['不开心','好伤心','烦躁','易怒','生气','焦虑','内耗','压力','害怕','低落']);
const discomfort=new Set(['头痛','腹胀','乳房胀痛','腰酸','疲惫','失眠','腹痛','小腹坠胀','胃肠胀气']);
const dischargeChanges=new Set(['阴道瘙痒','阴道疼痛','外阴灼痛','豆腐渣样','黄绿色','泡沫状','鱼腥臭味','恶臭味','灰白色','脓性']);
const values=a=>[...new Set((Array.isArray(a)?a:[]).filter(x=>typeof x==='string'&&x&&!['未记录','没有症状'].includes(x)))];
function moods(log){return values(log.moods?.length?log.moods:[log.mood]);}
function symptoms(log){return values([...(log.symptoms||[]),...(log.customSymptoms||[])]);}
function rank(rows,selector){const counts=new Map();for(const [,log] of rows)for(const label of selector(log))counts.set(label,(counts.get(label)||0)+1);return [...counts].map(([label,days])=>({label,days})).sort((a,b)=>b.days-a.days||(a.label<b.label?-1:1));}
function civilMinutes(stamp){if(typeof stamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp))return null;try{const [h,m]=stamp.slice(11).split(':').map(Number);return h<24&&m<60?parseDate(stamp.slice(0,10))*1440+h*60+m:null;}catch{return null;}}
function sleepMinutes(log){
  const ranges=(log.sleepRecords||[]).map(r=>[civilMinutes(r.start),civilMinutes(r.end)]).filter(([a,b])=>a!==null&&b!==null&&b>a&&b-a<=2880).sort((a,b)=>a[0]-b[0]);
  const merged=[];for(const [a,b] of ranges){const last=merged[merged.length-1];if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
  return merged.reduce((sum,[a,b])=>sum+b-a,0);
}
export function healthFeedback(state,asOf=today(),windowDays=30){
  parseDate(asOf);if(![30,90].includes(windowDays))throw new Error('反馈范围应为30或90天');
  const start=addDays(asOf,1-windowDays),previousStart=addDays(start,-windowDays);
  const validRows=Object.entries(state.logs||{}).filter(([date,log])=>{try{parseDate(date);return date<=asOf&&log&&typeof log==='object';}catch{return false;}}).sort(([a],[b])=>a.localeCompare(b));
  const rows=validRows.filter(([date])=>date>=start);
  const moodRows=rows.filter(([,log])=>moods(log).length);
  const symptomRows=rows.filter(([,log])=>symptoms(log).length||log.symptoms?.includes('没有症状'));
  const moodRank=rank(moodRows,moods),symptomRank=rank(rows,symptoms),cards=[];
  const add=(id,kind,title,observation,suggestion,sourceIds,evidenceDates)=>cards.push({id,kind,title,observation,suggestion,sourceIds,evidenceDates:values(evidenceDates).sort()});
  const list=items=>items.slice(0,3).map(x=>`${x.label} ${x.days}天`).join('、');
  const datesFor=predicate=>rows.filter(([,log])=>predicate(log)).map(([date])=>date);
  const severeDates=datesFor(log=>['重度','严重'].includes(log.painLevel)||log.pain>=7);
  const faintDates=datesFor(log=>symptoms(log).includes('晕厥'));
  if(faintDates.length)add('faint','medical','晕厥需要评估',`你在${faintDates.length}天记录了晕厥。`,'请就医评估原因。如果现在尚未完全恢复，或伴胸痛、呼吸异常、说话或活动困难，请立即寻求当地急救帮助。',['faint'],faintDates);
  const lumpDates=datesFor(log=>symptoms(log).includes('乳房肿块'));
  if(lumpDates.length)add('breast','medical','乳房肿块需要检查',`你在${lumpDates.length}天记录了乳房肿块。`,'发现乳房肿块时，请预约医生检查，不要仅凭周期记录判断原因。',['breast'],lumpDates);
  if(severeDates.length)add('pain-severe','medical','留意较重的疼痛',`你在${severeDates.length}天记录了重度、严重痛经或7分以上疼痛。`,'请向医生咨询；如果现在疼痛剧烈、比平时明显加重且未缓解，及时就医。影响日常活动的疼痛也值得评估。',['pain'],severeDates);
  else {
    const painDates=datesFor(log=>['轻度','中度'].includes(log.painLevel)||log.pain>0);
    if(painDates.length)add('pain','advice','经期疼痛照护',`你在${painDates.length}天记录了痛经。`,'可尝试隔着布热敷腹部、温水淋浴或轻柔散步，以舒适为准；疼痛加重或影响生活时就医。',['pain'],painDates);
  }
  const heavyDates=datesFor(log=>['偏多','较多','很多'].includes(log.flow));
  const periods=(state.periods||[]).filter(p=>p.start<=asOf).sort((a,b)=>a.start.localeCompare(b.start));
  const longClosed=periods.filter(p=>p.end&&p.end>=start&&p.end<=asOf&&diffDays(p.end,p.start)+1>7);
  const longOpen=periods.filter(p=>!p.end&&diffDays(asOf,p.start)+1>7);
  if(heavyDates.length||longClosed.length)add('flow','medical','留意经量与持续时间',`${heavyDates.length?`有${heavyDates.length}天记录经量较多。`:''}${longClosed.length?`有${longClosed.length}段已结束经期超过7天。`:''}`,'经量标签不能测出失血量。如果持续偏多、影响生活，或实际出血超过7天，请咨询医生；可以补记更换卫生用品的频率及是否乏力。',['flow'],[...heavyDates,...longClosed.map(p=>p.start)]);
  if(longOpen.length)add('period-check','notice','核对经期结束日期',`有${longOpen.length}段经期尚未填写结束日期，开始至今已超过7天。`,'先核对是否漏记结束日期；若实际出血仍持续且超过7天，请向医生咨询。',['flow'],longOpen.map(p=>p.start));
  const changedDates=datesFor(log=>symptoms(log).some(s=>dischargeChanges.has(s)));
  if(changedDates.length)add('discharge','medical','分泌物与不适',`有${changedDates.length}天记录了分泌物变化、瘙痒或阴道不适。`,'颜色、气味、质地变化或瘙痒疼痛时，可咨询妇科医生；避免阴道内部冲洗和香味清洁用品。记录不能确定感染类型。',['discharge'],changedDates);
  if(moodRows.length){
    const difficult=moodRows.filter(([,log])=>moods(log).some(m=>distress.has(m)));
    add('mood','advice','心情回顾',`记录心情${moodRows.length}天：${list(moodRank)}。`,difficult.length?'给自己留出休息时间，尝试规律运动和放松练习。若情绪反复影响学习、工作或人际关系，可咨询医生或心理专业人员。':'可以继续保持规律活动、充足睡眠和均衡饮食，并记下对自己有帮助的日常安排。',['pms'],moodRows.map(([d])=>d));
    const previous=validRows.filter(([date,log])=>date>=previousStart&&date<start&&moods(log).length);
    if(moodRows.length>=5&&previous.length>=5){
      const before=previous.filter(([,log])=>moods(log).some(m=>distress.has(m))).length;
      add('mood-change','notice','与上一段记录比较',`本期${moodRows.length}个心情记录日中，${difficult.length}天记录不开心、焦虑等感受；前${windowDays}天为${before}/${previous.length}个记录日。`,'两段的记录完整度可能不同，不代表情绪变好或变差的诊断。可以结合当时的日记和生活安排回看。',['pms'],[...previous.map(([d])=>d),...moodRows.map(([d])=>d)]);
    }
    const cycles=[];
    for(let i=1;i<periods.length;i++){
      const a=periods[i-1].start,b=periods[i].start,length=diffDays(b,a);
      if(length<15||length>90)continue;
      const covered=moodRows.filter(([date])=>date>=a&&date<b),before=covered.filter(([date])=>date>=addDays(b,-7));
      if(covered.length>=5&&before.length>=2)cycles.push({covered,before});
    }
    const preDates=cycles.flatMap(c=>c.before.filter(([,log])=>moods(log).some(m=>distress.has(m))).map(([d])=>d));
    if(cycles.length>=2&&preDates.length>=2)add('cycle-mood','notice','心情与经期对照',`可对照的${cycles.length}个已结束周期中，经期开始前7天有${preDates.length}天记录不开心、焦虑等感受。`,'这是时间上的共同出现，不能说明原因。继续记录至少2个周期的感受和生活影响，有助于与医生沟通。',['pms'],preDates);
  }
  if(symptomRank.length)add('symptoms','advice','身体感受回顾',`较常记录：${list(symptomRank)}。`,symptomRank.some(x=>discomfort.has(x.label))?'可以保持规律活动、均衡饮食和充足睡眠，并补记不适的时间和影响。若症状反复、加重或影响生活，可带记录就诊。':'可补记发生时间、持续多久及对生活的影响；持续、反复或加重的不适值得与医生讨论。',['pms'],symptomRows.map(([d])=>d));
  const repeated=symptomRank.map(item=>{
    const observed=new Set();const dates=[];
    for(const [date,log] of rows){
      if(!symptoms(log).includes(item.label))continue;
      const i=periods.findLastIndex(p=>p.start<=date);if(i<0)continue;
      const next=periods[i+1],span=diffDays(next?.start||asOf,periods[i].start);
      if((next&&(span<15||span>90))||(!next&&span>90))continue;
      observed.add(periods[i].start);dates.push(date);
    }
    return {...item,cycles:observed.size,dates};
  }).filter(x=>x.cycles>=2);
  if(repeated.length){const item=repeated[0];add('symptom-repeat','notice','跨周期的反复感受',`所选范围内，${item.label}在${item.cycles}个有记录的周期中出现，共记录${item.days}天。`,'这是记录中的重复情况，不说明病因。可以补记持续时间和生活影响；如果反复不适或越来越重，带记录咨询医生。',['pms'],item.dates);}
  const sleepRows=rows.map(([date,log])=>({date,minutes:sleepMinutes(log)})).filter(r=>r.minutes>0);
  const insomniaDates=datesFor(log=>symptoms(log).includes('失眠'));
  if(sleepRows.length||insomniaDates.length){
    const average=sleepRows.length?Math.round(sleepRows.reduce((n,r)=>n+r.minutes,0)/sleepRows.length/6)/10:null;
    add('sleep','advice','睡眠与休息',`${sleepRows.length?`${sleepRows.length}个记录日的平均睡眠记录时长为${average}小时。`:''}${insomniaDates.length?`${insomniaDates.length}天记录了失眠。`:''}`,'尽量固定起床时间，睡前留出放松时间，保持卧室安静、昏暗。手动时长不等于实际睡眠监测；若睡眠问题长期持续或影响白天生活，可咨询医生。',['sleep'],[...sleepRows.map(r=>r.date),...insomniaDates]);
  }
  if(!moodRows.length&&!symptomRows.length&&!cards.length)add('empty','notice','从一次感受开始','尚无可分析的心情或身体感受。','记录今天的心情或症状；累积后，这里会显示出现次数和对应建议。',[],[]);
  if(!cards.length)add('recorded','notice','身体感受已记录',`有${symptomRows.length}天明确记录了没有症状。`,'可以继续按实际感受记录；没有填写的日期不会被算作没有症状。',[],symptomRows.map(([d])=>d));
  const order={medical:0,advice:1,notice:2};cards.sort((a,b)=>order[a.kind]-order[b.kind]);
  const used=new Set(cards.flatMap(c=>c.sourceIds));
  return {start,end:asOf,windowDays,daysWithRecords:rows.length,moodDays:moodRows.length,symptomDays:symptomRows.length,moods:moodRank,symptoms:symptomRank,cards,sources:HEALTH_SOURCES.filter(s=>used.has(s.id)),limitation:'基于已填写记录，未记录不代表没有症状。健康建议不能替代诊断。'};
}
