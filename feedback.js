import {addDays,diffDays,parseDate,today} from './engine.js';

// AI-assisted editorial content, matched by local rules, not a clinical inference model.
// A same-day match is evidence of recorded co-occurrence, not proof of simultaneous onset.
export const FEEDBACK_DISCLAIMER='AI 辅助整理的健康信息，由本机规则匹配，不具备医疗功能，不能用于诊断、治疗或替代就医。可能原因并非确诊，列表也不完整。';
export const HEALTH_SOURCES = [
  {id:'pms',title:'NHS · 经前不适与日常照护',url:'https://www.nhs.uk/conditions/pre-menstrual-syndrome/'},
  {id:'pain',title:'NHS · 经期疼痛',url:'https://www.nhs.uk/symptoms/period-pain/'},
  {id:'flow',title:'NHS · 经量与持续时间',url:'https://www.nhs.uk/conditions/heavy-periods/'},
  {id:'sleep',title:'NHS · 睡眠习惯',url:'https://www.nhs.uk/conditions/insomnia/'},
  {id:'discharge',title:'NHS · 分泌物变化',url:'https://www.nhs.uk/symptoms/vaginal-discharge/'},
  {id:'faint',title:'NHS · 晕厥与求助',url:'https://www.nhs.uk/symptoms/fainting/'},
  {id:'breast',title:'NHS · 乳房肿块',url:'https://www.nhs.uk/symptoms/breast-lump/'},
  {id:'endo',title:'NHS · 子宫内膜异位症',url:'https://www.nhs.uk/conditions/endometriosis/'},
  {id:'adeno',title:'NHS · 子宫腺肌病',url:'https://www.nhs.uk/conditions/adenomyosis/'},
  {id:'pid',title:'NHS · 盆腔炎',url:'https://www.nhs.uk/conditions/pelvic-inflammatory-disease-pid/'},
  {id:'anaemia',title:'NHS · 缺铁性贫血',url:'https://www.nhs.uk/conditions/iron-deficiency-anaemia/'},
  {id:'migraine',title:'NHS · 偏头痛',url:'https://www.nhs.uk/conditions/migraine/'},
  {id:'ibs',title:'NHS · 肠易激综合征的症状',url:'https://www.nhs.uk/conditions/irritable-bowel-syndrome-ibs/symptoms/'},
  {id:'thrush',title:'NHS · 念珠菌感染',url:'https://www.nhs.uk/conditions/thrush-in-men-and-women/'},
  {id:'bv',title:'NHS · 细菌性阴道病',url:'https://www.nhs.uk/conditions/bacterial-vaginosis/'},
  {id:'uti',title:'NHS · 尿路感染',url:'https://www.nhs.uk/conditions/urinary-tract-infections-utis/'},
  {id:'cyst',title:'NHS · 卵巢囊肿',url:'https://www.nhs.uk/conditions/ovarian-cyst/'},
  {id:'ectopic',title:'NHS · 宫外孕的症状',url:'https://www.nhs.uk/conditions/ectopic-pregnancy/symptoms/'},
  {id:'ovulation',title:'NHS · 排卵期疼痛',url:'https://www.nhs.uk/symptoms/ovulation-pain/'},
  {id:'chest',title:'NHS · 胸部不适',url:'https://www.nhs.uk/symptoms/chest-pain/'},
  {id:'cold',title:'NHS · 普通感冒',url:'https://www.nhs.uk/conditions/common-cold/'}
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
const pelvicLabels=['腹痛','小腹坠胀'];
const pmsPhysical=['乳房胀痛','乳头触痛','胃肠胀气','腹胀','头痛','疲惫','失眠','粉刺','头发出油','食欲旺盛','贪甜食'];
const has=(log,labels)=>symptoms(log).some(s=>labels.includes(s));
const severe=log=>['重度','严重'].includes(log.painLevel)||log.pain>=7;
const pain=log=>severe(log)||['轻度','中度'].includes(log.painLevel)||log.pain>0;
const pelvic=log=>pain(log)||has(log,pelvicLabels);
const heavy=log=>['偏多','较多','很多'].includes(log.flow);
const abnormal=log=>has(log,[...dischargeChanges]);
const cause=(name,explanation)=>({name,explanation});
function combinationFeedback(rows,periods){
  const cards=[],suppressed=new Set();
  // Only actual recorded dates establish timing. No predicted ovulation or period dates.
  const bleeding=date=>periods.some(p=>date>=p.start&&date<=(p.end||addDays(p.start,2)));
  const beforePeriod=date=>!bleeding(date)&&periods.some(p=>date<p.start&&date>=addDays(p.start,-14));
  const earlyPeriod=date=>periods.some(p=>date>=p.start&&date<=addDays(p.start,2)&&(!p.end||date<=p.end));
  const danger=log=>(pelvic(log)&&has(log,['晕厥']))||(severe(log)&&(has(log,['呕吐'])||heavy(log)));
  const matches=predicate=>rows.filter(([d,l])=>predicate(l,d));
  function add(id,kind,title,matched,possibleCauses,suggestion,questions,sourceIds,hide=[]){
    if(!matched.length)return;
    const dates=matched.map(([d])=>d),labels=values(matched.flatMap(([,l])=>[...symptoms(l),...moods(l).filter(m=>distress.has(m)),...(pain(l)?[severe(l)?'较重痛经':'痛经']:[]),...(heavy(l)?['经量较多']:[])]));
    cards.push({id,kind,title,observation:`${dates.length}个记录日同日填写了相关感受：${labels.slice(0,6).join('、')}。最近记录：${dates[dates.length-1]}。同日记录不一定同时发作，请核对时间。`,possibleCauses,suggestion,questions,sourceIds,evidenceDates:dates});
    hide.forEach(id=>suppressed.add(id));
  }
  add('combo-urgent','urgent','先确认是否需要立即就医',matches(danger),[
    cause('需排除急性盆腹腔问题','腹痛伴晕厥，或较重疼痛伴呕吐／经量多，需要医生排查内出血、卵巢囊肿破裂或扭转等急症；并非记录已证实这些疾病。'),
    cause('若有怀孕可能，需排除宫外孕','有怀孕可能时，腹痛、异常出血或晕厥应尽快检查；本应用不能判断是否怀孕。')
  ],'若这些症状现在同时存在，尤其突然剧痛、晕厥或大量出血，请立即前往急诊或寻求当地急救，不要自行驾车。历史症状已缓解也应与医生讨论。','疼痛是否突然发生？出血是否迅速浸透卫生用品？现在是否清醒、是否可能怀孕？',['cyst','ectopic','pid'],['pain','pain-severe']);
  add('combo-chest','urgent','胸闷与出冷汗、眩晕或晕厥',matches(l=>has(l,['胸闷'])&&has(l,['出冷汗','眩晕','晕厥'])),[
    cause('需排除心肺等急性问题','胸部不适伴出汗、头晕等可能有多种原因，包括需要紧急处理的心脏问题；不能当作普通经期或焦虑表现。')
  ],'如果现在突然胸部压迫或不适持续不退，伴出汗、恶心、呼吸困难或晕厥，请立即寻求急救，不自行驾车。即使已缓解，反复的胸部不适也需要医生评估。','现在是否持续？是否胸痛、呼吸困难或疼痛向手臂／颈部放射？',['chest']);
  add('combo-pelvic-vomit','medical','腹痛与恶心或呕吐',matches(l=>pelvic(l)&&has(l,['恶心反胃','呕吐'])&&!danger(l)),[
    cause('卵巢相关或其他盆腹腔问题','卵巢囊肿等问题可能伴腹痛与恶心、呕吐；也可能有其他盆腹腔原因，不能仅按普通痛经处理。')
  ],'如果腹痛与恶心或呕吐现在仍同时存在，当天联系医生或急诊评估；突然剧烈疼痛、晕厥、持续呕吐或明显恶化时立即就医。','是否突然发生或偏一侧？是否能正常喝水？是否有怀孕可能？',['cyst'],['pain']);
  add('combo-pelvic-infection','medical','腹痛与感染相关表现',matches(l=>pelvic(l)&&(abnormal(l)||has(l,['发烧']))),[
    cause('盆腔炎或其他感染','下腹痛与异常分泌物或发热共同出现，可能涉及盆腔感染；也可能是泌尿道、胃肠道等问题，需要检查区分。')
  ],'如相关症状现在仍在，当天联系医生；疼痛剧烈、发热明显、呕吐或感觉非常不适时立即就医。不要自行使用抗生素或阴道药。','是否真正发热？分泌物与平时有何变化？疼痛部位及持续时间？',['pid','uti'],['discharge']);
  add('combo-heavy-weak','medical','经量多与乏力、苍白或心悸',matches(l=>heavy(l)&&has(l,['疲惫','面色苍白','心悸'])),[
    cause('缺铁性贫血','较多的月经失血可能导致缺铁和贫血，伴乏力、心悸或面色苍白时值得评估；睡眠不足等也可引起疲惫。')
  ],'预约医生评估，必要时由医生安排血常规等检查。补记卫生用品更换频率；不要仅凭记录自行补铁。现在出现呼吸困难、胸痛、晕厥或大量出血时立即就医。','是否持续乏力？实际经量和出血天数？是否有其他出血或正在服药？',['anaemia','flow']);
  add('combo-heavy-pain','medical','经量多与经期疼痛',matches(l=>heavy(l)&&pelvic(l)),[
    cause('子宫腺肌病、子宫肌瘤或子宫内膜异位症','这些问题都可能出现经量多和疼痛；原发性痛经也可能与较多经量共同出现，记录无法区分。')
  ],'如果反复出现、较以往加重或影响日常活动，预约妇科评估；医生可能结合病史、检查及超声区分原因。当前剧烈疼痛或大量出血时及时就医。','是否从以前就痛，还是近来加重？有无经间出血、排便或同房时疼痛？',['pain','flow','adeno','endo'],['pain','pain-severe']);
  const recurrent=matches((l,d)=>severe(l)&&has(l,['腰酸','背痛','腰痛'])&&bleeding(d));
  const cycleStarts=new Set(recurrent.map(([d])=>periods.findLast(p=>p.start<=d)?.start).filter(Boolean));
  if(cycleStarts.size>=2)add('combo-recurrent-pain','medical','反复的较重痛经与腰背痛',recurrent,[
    cause('继发性痛经的可能原因','子宫内膜异位症、子宫腺肌病等可能伴反复痛经与盆腰部疼痛；原发性痛经也可放射到腰背，不能据此确诊。')
  ],'带至少2个周期的记录预约妇科评估，补充疼痛对活动的影响。明显加重或当前剧痛时及时就医。','是否也在非经期痛？排便、排尿或同房是否疼痛？',['endo','adeno','pain'],['pain','pain-severe']);
  const gentle=(l)=>!danger(l)&&!has(l,['发烧'])&&!abnormal(l);
  add('combo-pms','possibility','经前身心变化的可能解释',matches((l,d)=>beforePeriod(d)&&gentle(l)&&((moods(l).some(m=>distress.has(m))&&has(l,pmsPhysical))||symptoms(l).filter(s=>pmsPhysical.includes(s)).length>=2)),[
    cause('经前综合征（PMS）相关表现','经前数周的情绪变化、乳房触痛、腹胀、头痛、睡眠或食欲变化，可见于PMS，可能与对周期内激素变化的反应有关；并未测量激素。')
  ],'保持规律睡眠、适量活动和均衡饮食，继续记录至少2个周期及生活影响。若明显影响学习、工作或关系，咨询医生；严重的经前情绪症状需要专业评估。','经期开始后是否缓解？平时是否也有这些症状？对生活影响有多大？',['pms']);
  add('combo-cramps','possibility','经期初的腹部与腰背不适',matches((l,d)=>earlyPeriod(d)&&pain(l)&&!severe(l)&&!heavy(l)&&gentle(l)&&has(l,['腰酸','背痛','腰痛','小腹坠胀'])),[
    cause('原发性痛经','月经初期子宫收缩可能引起腹痛并放射至腰背。它是常见解释之一，仍不能排除其他原因。')
  ],'可隔着布温热敷腹部，尝试轻柔活动，以舒适为准。新出现、持续加重、影响生活或伴异常出血的疼痛应就医。','疼痛在经期第几天出现、持续多久？是否和过去不同？',['pain'],['pain']);
  add('combo-headache','possibility','头痛与恶心或声音敏感',matches(l=>has(l,['头痛'])&&has(l,['恶心反胃','呕吐','听力敏感'])),[
    cause('偏头痛','头痛伴恶心或对声音敏感，可能见于偏头痛；若经前或经期反复出现，可与医生讨论月经相关偏头痛。其他类型头痛也可能有相似表现。')
  ],'可在安静、较暗的环境休息，规律进食和饮水。突然最严重的头痛、视力或语言异常、单侧无力、意识改变时立即就医；反复或加重时预约评估。','是否一侧搏动痛、怕光，持续多久？是否突然出现？是否总在经前或经期？',['migraine']);
  add('combo-gut','possibility','腹部不适与排便变化',matches(l=>gentle(l)&&has(l,['腹痛','胃肠胀气'])&&has(l,['腹泻','便秘','放屁多'])),[
    cause('胃肠道问题，例如肠易激综合征','反复腹痛或腹胀伴便秘、腹泻，可见于肠易激综合征，但短期胃肠道疾病或饮食等也可导致；不能全部归因于月经。')
  ],'补记进食、排便及疼痛变化，保持规律进餐；持续或反复数周时就诊。便血、无意体重下降、持续呕吐或剧烈腹痛时及时就医。','排便后是否缓解？是否与饮食相关？持续了多久？',['ibs']);
  add('combo-thrush','medical','豆腐渣样分泌物与瘙痒',matches(l=>has(l,['豆腐渣样'])&&has(l,['阴道瘙痒','外阴灼痛','阴道疼痛'])),[
    cause('外阴阴道念珠菌感染','豆腐渣样白色分泌物伴瘙痒或刺激感，可能见于念珠菌感染；其他感染或刺激也可能造成相似不适。')
  ],'咨询妇科医生，首次发生、反复发作或有怀孕可能时尤其需要确认。避免香味清洁用品和阴道内部冲洗，不自行按病名用药。','气味、颜色是否改变？首次还是反复？近期是否用药？',['thrush','discharge'],['discharge']);
  add('combo-bv','medical','鱼腥气味与灰白色分泌物',matches(l=>has(l,['鱼腥臭味'])&&has(l,['灰白色'])),[
    cause('细菌性阴道病','鱼腥气味与灰白色分泌物可能与阴道菌群失衡有关；仅凭颜色和气味不能确定感染类型。')
  ],'预约妇科检查，由医生判断是否需要分泌物检查。避免冲洗阴道及使用香味私处产品。伴腹痛或发热时当天就医。','是否也有瘙痒、腹痛或发热？是否反复发生？',['bv','discharge'],['discharge']);
  add('combo-frothy','medical','黄绿色或泡沫状分泌物伴不适',matches(l=>has(l,['黄绿色','泡沫状','脓性'])&&has(l,['阴道瘙痒','外阴灼痛','阴道疼痛','恶臭味'])),[
    cause('滴虫等阴道感染','黄绿色或泡沫状分泌物伴刺激感或气味异常，可能见于滴虫等感染，需检查区分；不能据此判断传播来源。')
  ],'尽快咨询妇科医生进行检查；如果性生活不适，先暂停。伴下腹痛、发热或怀孕可能时及时就医，不自行服抗生素。','分泌物变化持续多久？是否伴排尿疼痛、腹痛？',['discharge'],['discharge']);
  add('combo-urinary','medical','尿频伴下腹、腰背痛或发热',matches(l=>has(l,['尿频'])&&has(l,['腹痛','小腹坠胀','腰痛','背痛','发烧'])),[
    cause('尿路感染等泌尿系统问题','尿频伴下腹痛、腰背痛或发热可能涉及膀胱或肾脏感染；单纯尿频并不能说明感染。')
  ],'如相关症状仍在，及时联系医生；伴发热、寒战或肋骨下方腰背痛时当天就医。适量饮水，不憋尿，不自行服抗生素。','是否排尿灼痛、血尿？腰痛在哪里？是否有怀孕可能？',['uti']);
  add('combo-ovulation','possibility','所记录的排卵痛与分泌物变化',matches(l=>has(l,['排卵痛'])&&(l.discharge==='蛋清状'||has(l,['白带增多']))&&gentle(l)&&!severe(l)),[
    cause('排卵相关短暂不适','排卵时可出现短暂一侧腹部不适及分泌物增多；记录中选择“排卵痛”不等于已确认排卵。囊肿等问题也可出现类似疼痛。')
  ],'补记左右侧及持续时间；持续、反复或严重的疼痛应就医。有怀孕可能且腹痛时及时检查，不能用此反馈判断安全期。','是否仅一侧，是否1至2天内缓解？是否有怀孕可能？',['ovulation']);
  add('combo-respiratory','possibility','鼻部不适与咳嗽或发热',matches(l=>has(l,['鼻塞','流鼻涕'])&&has(l,['咳嗽','发烧','身体酸痛'])),[
    cause('普通感冒等呼吸道感染','鼻塞或流鼻涕伴咳嗽、肌肉酸痛或发热，可能涉及呼吸道感染；不应只因发生在经期就归因于月经。')
  ],'注意休息、饮水和手部卫生。症状加重、明显高热或发热持续时咨询医生；胸痛、呼吸困难或意识异常时立即就医。','是否真正发热，持续多久？是否有呼吸困难？',['cold']);
  return {cards,suppressed};
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
  const combinations=combinationFeedback(rows,periods);
  for(let i=cards.length-1;i>=0;i--)if(combinations.suppressed.has(cards[i].id))cards.splice(i,1);
  cards.unshift(...combinations.cards);
  for(const card of cards){card.possibleCauses ||= [];card.questions ||= '';}
  const order={urgent:0,medical:1,possibility:2,advice:3,notice:4};cards.sort((a,b)=>order[a.kind]-order[b.kind]);
  const used=new Set(cards.flatMap(c=>c.sourceIds));
  return {start,end:asOf,windowDays,daysWithRecords:rows.length,moodDays:moodRows.length,symptomDays:symptomRows.length,moods:moodRank,symptoms:symptomRank,cards,sources:HEALTH_SOURCES.filter(s=>used.has(s.id)),disclaimer:FEEDBACK_DISCLAIMER,limitation:'基于已填写记录，未记录不代表没有症状。同日填写未必同时发作；没有匹配到组合也不代表健康或排除疾病。记录不足时无法可靠分析病因。'};
}
