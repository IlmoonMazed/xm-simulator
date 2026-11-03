(() => {
const $ = id => document.getElementById(id);
const storeKey = 'xmSimulatorHistory_v1';
let subjects = [{name:'Subject 1',count:10}], checkpoints = [], exam = null, timerId = null, tickId = null, currentIndex = 0, alarmOn = true, audioCtx = null;
let activeQuestion = null, activeSince = 0;
const letters = 'ABCDEFGHIJKL';
const fmt = s => {s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const fmtClock = s => {s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const num = n => Number((n||0).toFixed(2));
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function show(view){['setupView','examView','evaluationView','reportView'].forEach(v=>$(v).classList.toggle('hidden',v!==view));window.scrollTo(0,0)}
function getHistory(){try{return JSON.parse(localStorage.getItem(storeKey)||'[]')}catch{return []}}
function saveHistory(list){localStorage.setItem(storeKey,JSON.stringify(list))}
function addSubject(){
 if(subjects.length>=20){alert('You can add up to 20 subjects.');return}
 updateTotal();subjects.push({name:`Subject ${subjects.length+1}`,count:10});renderSubjects();
}
function renderSubjects(){
 $('subjectsEditor').innerHTML=subjects.map((s,i)=>`<div class="subject-row"><input aria-label="Subject ${i+1} name" data-subname="${i}" value="${esc(s.name)}" placeholder="Subject name"><input aria-label="Question count" data-subcount="${i}" type="number" min="1" max="300" value="${s.count}"><button class="remove-subject" data-remove="${i}" title="Remove subject">×</button></div>`).join('');
 updateTotal();
}
function updateTotal(){
 subjects.forEach((s,i)=>{const a=document.querySelector(`[data-subname="${i}"]`),b=document.querySelector(`[data-subcount="${i}"]`);if(a)s.name=a.value;if(b)s.count=Math.max(1,Math.min(300,Number(b.value)||1))});
 $('totalQuestions').textContent=subjects.reduce((a,s)=>a+s.count,0)+' questions';
}
function addCheckpoint(minute,label=''){
 const duration=Math.max(1,Number($('duration').value)||60), t=Math.round(minute*60);
 if(t<=0||t>=duration*60){alert('A checkpoint must be after the start and before the exam ends.');return}
 if(checkpoints.some(c=>c.seconds===t)){alert('A checkpoint already exists at that time.');return}
 checkpoints.push({seconds:t,label:label||`Checkpoint ${checkpoints.length+1}`});checkpoints.sort((a,b)=>a.seconds-b.seconds);renderCheckpoints();
}
function renderCheckpoints(){
 $('checkpointList').innerHTML=checkpoints.length?checkpoints.map((c,i)=>`<div class="checkpoint-item editable-checkpoint"><div class="cp-edit-fields"><input data-cplabel="${i}" aria-label="Checkpoint label" value="${esc(c.label)}" placeholder="Checkpoint label"><span class="cp-time">${fmtClock(c.seconds)}</span></div><button data-cpremove="${i}" aria-label="Remove checkpoint">✕</button></div>`).join(''):'<p class="empty-state">No checkpoints added yet.</p>'; 
}
function modal({title,text,body='',confirm='Confirm',onConfirm}){
 $('modalTitle').textContent=title;$('modalText').textContent=text;$('modalBody').innerHTML=body;$('modalConfirm').textContent=confirm;$('modal').classList.remove('hidden');
 const close=()=>{$('modal').classList.add('hidden');$('modalConfirm').onclick=null};
 $('modalClose').onclick=close;$('modalCancel').onclick=close;
 $('modalConfirm').onclick=()=>{const result=onConfirm?.();if(result!==false)close()};
}
function getQuestion(qid){return exam.questions.find(q=>q.id===qid)}
function recordTime(){if(activeQuestion!==null&&activeSince){const q=getQuestion(activeQuestion);if(q)q.timeSpent+=Math.max(0,(Date.now()-activeSince)/1000);activeSince=Date.now()}}
function setActive(qid){recordTime();activeQuestion=qid;activeSince=Date.now()}
function answerQuestion(q,selected){
 if(exam.locked)return;
 const before=[...q.answers],after=[...selected];
 if(JSON.stringify(before)===JSON.stringify(after))return;
 if(!exam.mutable&&before.length)return;
 q.answers=after;
 if(before.length)q.history.push({at:Date.now()-exam.startedAt,from:before,to:after});
 renderExam();
}
function buildExam(){
 updateTotal();
 const duration=Math.max(1,Math.min(600,Number($('duration').value)||60));
 const total=subjects.reduce((a,s)=>a+s.count,0);
 if(!total){alert('Add at least one question.');return}
 const options=Math.max(2,Math.min(12,Number($('optionCount').value)||4));
 const correct=Math.max(0,Number($('correctMarks').value)||1);
 const wrong=$('wrongMarks').value===''?correct*.25:Math.max(0,Number($('wrongMarks').value));
 let qs=[],id=0;
 subjects.forEach((s,si)=>{for(let i=0;i<s.count;i++)qs.push({id:id++,subject:s.name,subjectIndex:si,number:i+1,answers:[],history:[],timeSpent:0,evaluation:null})});
 exam={id:Date.now(),name:$('examName').value.trim()||'XM Examination',duration,options,mutable:$('mutable').checked,multiple:$('multiple').checked,allowUnanswered:$('allowUnanswered').checked,correctMarks:correct,wrongMarks:wrong,subjects:subjects.map(s=>({...s})),questions:qs,checkpoints:checkpoints.map(c=>({...c,triggered:false})),startedAt:Date.now(),endsAt:Date.now()+duration*60000,locked:false,alarm:$('alarmSetup').checked,checkpointLogs:[],finishedAt:null};
 alarmOn=exam.alarm;currentIndex=0;setActive(qs[0].id);
 $('examTitle').textContent=exam.name;$('examMeta').textContent=`${total} questions · ${exam.subjects.length} subjects · ${duration} minutes`;
 
 $('alarmFloat').classList.toggle('active',alarmOn);$('alarmFloat').textContent=alarmOn?'♫ Alarm on':'♫ Alarm off';
 show('examView');renderExam();startClock();
}
function startClock(){
 clearInterval(timerId);clearInterval(tickId);
 const update=()=>{
  if(!exam||exam.locked)return;
  const left=Math.max(0,Math.ceil((exam.endsAt-Date.now())/1000));
  $('timer').textContent=fmt(left);$('timerBar').style.width=`${Math.max(0,left/(exam.duration*60)*100)}%`;
  $('timer').style.color=left<=60?'var(--red)':'var(--text)';
  const elapsed=Math.floor((Date.now()-exam.startedAt)/1000);
  exam.checkpoints.forEach((cp,i)=>{if(!cp.triggered&&elapsed>=cp.seconds){recordTime();cp.triggered=true;takeCheckpoint(cp);if(alarmOn)playAlarm();}});
  const next=exam.checkpoints.find(c=>!c.triggered);
  $('checkpointNext').textContent=next?`Next checkpoint in ${fmt(next.seconds-elapsed)}`:'All checkpoints completed';
  if(left<=0)finishExam(true);
 };
 update();timerId=setInterval(update,250);tickId=setInterval(()=>{if(activeQuestion!==null&&!exam.locked)recordTime()},1000);
}
function takeCheckpoint(cp){
 const answered=exam.questions.filter(q=>q.answers.length);
 const previousAnswered=new Set(exam.checkpointLogs.at(-1)?.answered.map(q=>q.id)||[]);
 const answeredSince=answered.filter(q=>!previousAnswered.has(q.id));
 const changed=exam.questions.filter(q=>q.history.length);
 const changesSince=exam.questions.flatMap(q=>q.history.filter(h=>h.at>=((exam.checkpointLogs.at(-1)?.elapsed||0)*1000)&&h.at<=(cp.seconds*1000)).map(h=>({...h,qid:q.id,subject:q.subject,number:q.number})));
 const log={label:cp.label,seconds:cp.seconds,elapsed:Math.floor((Date.now()-exam.startedAt)/1000),answered:answered.map(q=>({id:q.id,subject:q.subject,number:q.number,answers:[...q.answers]})),answeredSince:answeredSince.map(q=>({id:q.id,subject:q.subject,number:q.number,answers:[...q.answers]})),changed:changed.map(q=>({id:q.id,subject:q.subject,number:q.number,answers:[...q.answers],changes:q.history.length})),changesSince:changesSince,totalChanges:exam.questions.reduce((a,q)=>a+q.history.length,0)};
 exam.checkpointLogs.push(log);persistRunning();
}
function persistRunning(){try{sessionStorage.setItem('xm_running',JSON.stringify(exam))}catch{}}
function playAlarm(){
 try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=880;g.gain.value=.08;o.start();o.stop(audioCtx.currentTime+.22);o.onended=()=>{const o2=audioCtx.createOscillator();o2.connect(g);o2.frequency.value=660;o2.start();o2.stop(audioCtx.currentTime+.22)}}catch{}
}
function renderExam(){
 const q=exam.questions[currentIndex];if(!q)return;
 $('subjectLabel').textContent=q.subject;$('questionCounter').textContent=`Question ${currentIndex+1} of ${exam.questions.length}`;$('questionNumber').textContent=String(currentIndex+1).padStart(2,'0');$('questionPrompt').textContent=`Question ${q.number}`;$('questionHint').textContent=exam.multiple?'Select all applicable options.':'Select one option.';
 $('optionsArea').innerHTML=Array.from({length:exam.options},(_,i)=>{const chosen=q.answers.includes(i);return `<button class="option-btn ${chosen?'selected':''}" data-option="${i}" ${exam.locked?'disabled':''}><span class="option-key">${exam.multiple?'✓':letters[i]}</span><span class="option-label">Option ${letters[i]}</span></button>`}).join('');
 $('answerState').textContent=q.answers.length?`Selected: ${q.answers.map(i=>letters[i]).join(', ')}`:'Not answered';
 $('prevQuestion').disabled=currentIndex===0;$('nextQuestion').textContent=currentIndex===exam.questions.length-1?'Review first →':'Next →';
 const answered=exam.questions.filter(x=>x.answers.length).length;$('progressText').textContent=`${answered} / ${exam.questions.length} answered`;
 const groups=exam.subjects.map((s,si)=>({name:s.name,questions:exam.questions.map((x,i)=>({...x,index:i})).filter(x=>x.subjectIndex===si)}));
 $('subjectNav').innerHTML=groups.map(g=>`<div class="subject-nav-group"><p class="subject-nav-title">${esc(g.name)}</p><div class="question-grid">${g.questions.map(q=>`<button class="q-nav-btn ${q.answers.length?'done':''} ${q.index===currentIndex?'current':''}" data-goto="${q.index}">${q.number}</button>`).join('')}</div></div>`).join('');
}
function finishExam(auto=false){
 if(!exam||exam.locked)return;
 if(!auto){const unanswered=exam.questions.filter(q=>!q.answers.length).length;if(!exam.allowUnanswered&&unanswered){alert(`You still have ${unanswered} unanswered question(s). Answer them before finishing.`);return}modal({title:'Finish examination?',text:`You have ${unanswered} unanswered question(s). Your answers will be locked and you will move to evaluation.`,confirm:'Finish XM',onConfirm:()=>completeExam()});return}
 completeExam();
}
function completeExam(){
 recordTime();exam.locked=true;exam.finishedAt=Date.now();clearInterval(timerId);clearInterval(tickId);$('appStatus').textContent='Exam completed';
 exam.questions.forEach(q=>q.evaluation=q.answers.length?null:'unanswered');
 $('evalAnswered').textContent=exam.questions.filter(q=>q.answers.length).length;$('evalUnanswered').textContent=exam.questions.filter(q=>!q.answers.length).length;$('evalTime').textContent=fmt((exam.finishedAt-exam.startedAt)/1000);
 $('evalSubjectFilter').innerHTML='<option value="all">All subjects</option>'+exam.subjects.map(s=>`<option>${esc(s.name)}</option>`).join('');
 show('evaluationView');renderEvaluation();
}
function renderEvaluation(){
 const filter=$('evalSubjectFilter').value;
 const qs=exam.questions.filter(q=>q.answers.length&&(filter==='all'||q.subject===filter));
 $('evaluationList').innerHTML=qs.map(q=>`<div class="eval-card"><div class="eval-qno">Q${q.id+1}</div><div><strong>${esc(q.subject)} · Question ${q.number}</strong><p>${q.answers.length?`Selected: ${q.answers.map(i=>letters[i]).join(', ')}`:'No answer selected'} · ${fmt(q.timeSpent)} spent</p></div><div class="eval-options"><button class="eval-choice correct ${q.evaluation==='correct'?'active':''}" data-eval="${q.id}:correct">✓ Correct</button><button class="eval-choice wrong ${q.evaluation==='wrong'?'active':''}" data-eval="${q.id}:wrong">✕ Wrong</button></div></div>`).join('')||'<p class="empty-state">No questions in this subject.</p>';
 const evaluated=exam.questions.filter(q=>q.evaluation==='correct'||q.evaluation==='wrong').length;
 $('evalProgress').textContent=`${evaluated} / ${exam.questions.filter(q=>q.answers.length).length} answered questions evaluated`;
 $('completeEvaluation').disabled=exam.questions.some(q=>q.answers.length&&!q.evaluation);
}
function calculate(){
 const correct=exam.questions.filter(q=>q.evaluation==='correct').length,wrong=exam.questions.filter(q=>q.evaluation==='wrong').length,unanswered=exam.questions.filter(q=>!q.answers.length).length;
 const earned=correct*exam.correctMarks,deducted=wrong*exam.wrongMarks,total=exam.questions.length*exam.correctMarks;
 const answered=correct+wrong,accuracy=answered?correct/answered*100:0;
 return {correct,wrong,unanswered,earned,deducted,score:earned-deducted,total,accuracy};
}
function renderReport(){
 const r=calculate();$('reportTitle').textContent=exam.name;$('reportDate').textContent=new Date(exam.startedAt).toLocaleString();$('finalScore').textContent=num(r.score);$('scoreOutOf').textContent=`out of ${num(r.total)} marks · ${num(r.earned)} earned − ${num(r.deducted)} deducted`;$('accuracy').textContent=`${Math.round(r.accuracy)}%`;
 const totalQ=exam.questions.length,cpct=totalQ?r.correct/totalQ*100:0,wpct=totalQ?r.wrong/totalQ*100:0;$('accuracyRing').style.background=`conic-gradient(var(--green) 0 ${cpct}%,var(--red) ${cpct}% ${cpct+wpct}%,#aab4c2 ${cpct+wpct}% 100%)`;
 $('reportCorrect').textContent=r.correct;$('reportWrong').textContent=r.wrong;$('reportUnanswered').textContent=r.unanswered;$('reportDeducted').textContent=num(r.deducted);
 $('filterSubject').innerHTML='<option value="all">All subjects</option>'+exam.subjects.map(s=>`<option>${esc(s.name)}</option>`).join('');
 $('filterCheckpoint').innerHTML='<option value="all">All checkpoints</option>'+exam.checkpointLogs.map((c,i)=>`<option value="${i}">${esc(c.label)}</option>`).join('');
 renderSubjectReport();renderCheckpointReport();renderQuestionReport();renderChangeHistory();
 const list=getHistory();const idx=list.findIndex(x=>x.id===exam.id);const record={...exam,summary:r};if(idx>=0)list[idx]=record;else list.unshift(record);saveHistory(list.slice(0,50));renderHistory();
}
function renderSubjectReport(){
 $('subjectReport').innerHTML=exam.subjects.map(s=>{const qs=exam.questions.filter(q=>q.subject===s.name),c=qs.filter(q=>q.evaluation==='correct').length,w=qs.filter(q=>q.evaluation==='wrong').length,marks=c*exam.correctMarks-w*exam.wrongMarks,acc=(c+w)?c/(c+w)*100:0;return `<div class="subject-stat"><div class="subject-stat-head"><strong>${esc(s.name)}</strong><span>${c} correct · ${w} wrong · ${num(marks)} marks</span></div><div class="bar"><i style="width:${acc}%"></i></div><p class="muted tiny">${qs.length} questions · ${Math.round(acc)}% accuracy</p></div>`}).join('');
}
function renderCheckpointReport(){
 $('checkpointReport').innerHTML=exam.checkpointLogs.length?exam.checkpointLogs.map(c=>{const qlist=a=>a.length?a.map(q=>`Q${q.id+1} (${esc(q.subject)}) · ${q.answers.map(i=>letters[i]).join(',')}`).join('; '):'—';const edits=c.changesSince.length?c.changesSince.map(e=>`Q${e.qid+1}: ${e.from.map(i=>letters[i]).join(',')||'—'} → ${e.to.map(i=>letters[i]).join(',')||'—'}`).join('; '):'—';return `<div class="checkpoint-row checkpoint-detail"><div><strong>${esc(c.label)}</strong><br><span class="muted">${fmtClock(c.elapsed)} elapsed · ${c.totalChanges} total changes</span><p class="tiny"><b>New this interval (${c.answeredSince?.length||0}):</b> ${qlist(c.answeredSince||[])}</p><p class="tiny"><b>All answered (${c.answered.length}):</b> ${qlist(c.answered)}</p><p class="tiny"><b>Changes since previous (${c.changesSince.length}):</b> ${edits}</p></div></div>`}).join(''):'<p class="empty-state">No checkpoints were configured.</p>';
}
function renderQuestionReport(){
 let qs=[...exam.questions],subject=$('filterSubject').value,result=$('filterResult').value,changed=$('filterChanged').value,cp=$('filterCheckpoint').value,option=$('filterOption').value,sort=$('filterSort').value;
 if(subject!=='all')qs=qs.filter(q=>q.subject===subject);
 if(result!=='all')qs=qs.filter(q=>(q.evaluation||'unanswered')===result);
 if(changed==='changed')qs=qs.filter(q=>q.history.length);if(changed==='unchanged')qs=qs.filter(q=>!q.history.length);
 if(option==='answered')qs=qs.filter(q=>q.answers.length);if(option==='blank')qs=qs.filter(q=>!q.answers.length);
 if(cp!=='all'){const snap=exam.checkpointLogs[Number(cp)];const ids=new Set(snap?.answered.map(q=>q.id)||[]);qs=qs.filter(q=>ids.has(q.id))}
 if(sort==='time-desc')qs.sort((a,b)=>b.timeSpent-a.timeSpent);if(sort==='time-asc')qs.sort((a,b)=>a.timeSpent-b.timeSpent);if(sort==='changes')qs.sort((a,b)=>b.history.length-a.history.length);
 $('filteredCount').textContent=`Showing ${qs.length} of ${exam.questions.length} questions`;
 $('questionReport').innerHTML=qs.map(q=>`<div class="report-q"><strong>Q${q.id+1}</strong><span>${esc(q.subject)} · #${q.number}<br><span class="muted">Selected: ${q.answers.length?q.answers.map(i=>letters[i]).join(', '):'—'}</span></span><span class="result-tag ${q.evaluation||'unanswered'}">${q.evaluation||'Unanswered'}</span><span>${fmt(q.timeSpent)} spent</span><span>${q.history.length} changes</span></div>`).join('')||'<p class="empty-state">No questions match these filters.</p>';
}
function renderChangeHistory(){
 const events=exam.questions.flatMap(q=>q.history.map(h=>({q,h}))).sort((a,b)=>a.h.at-b.h.at);
 $('changeHistory').innerHTML=events.length?events.map(({q,h})=>`<div class="change-row"><span class="muted">${fmtClock(h.at/1000)}</span><span>Q${q.id+1} · ${esc(q.subject)}</span><span>${h.from.length?h.from.map(i=>letters[i]).join(','):'—'} → <strong>${h.to.length?h.to.map(i=>letters[i]).join(','):'—'}</strong></span></div>`).join(''):'<p class="empty-state">No answer changes were recorded.</p>';
}
function renderHistory(){
 const h=getHistory();$('historyList').innerHTML=h.length?h.map(x=>`<div class="history-item"><div><strong>${esc(x.name)}</strong><br><span>${new Date(x.startedAt).toLocaleString()} · ${x.questions.length} questions · ${x.duration} min</span></div><div><strong>${num(x.summary?.score||0)} marks</strong> <button class="text-btn" data-openhistory="${x.id}">View report</button></div></div>`).join(''):'<p class="empty-state">No saved examinations yet.</p>';
}
function loadOldReport(id){const old=getHistory().find(x=>x.id===Number(id));if(!old)return;exam=old;renderReport();show('reportView')}
function downloadPdf(){
 if(!window.jspdf?.jsPDF){alert('PDF library could not load. Check your internet connection.');return}
 const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),r=calculate(),W=210,M=14;let y=18;
 const C={navy:[24,42,65],gold:[190,137,39],green:[35,132,93],red:[196,70,70],gray:[105,119,137],pale:[244,247,251],line:[220,227,235],white:[255,255,255],blue:[56,105,160],blank:[158,169,182]};
 const fill=c=>doc.setFillColor(...c),ink=c=>doc.setTextColor(...c),stroke=c=>doc.setDrawColor(...c);
 const txt=(t,x,yy,size=8,color=C.navy,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(Math.max(7.8,size));ink(color);doc.text(String(t),x,yy)};
 const box=(x,yy,w,h,c)=>{fill(c);doc.roundedRect(x,yy,w,h,2,2,'F')};
 const check=h=>{if(y+h>280){doc.addPage();y=18;box(0,0,W,10,C.navy);txt('XM  /  EXAMINATION REPORT',M,7,7,C.white,true)}};
 const section=(name,detail='')=>{check(14);txt(name.toUpperCase(),M,y,10,C.navy,true);if(detail)txt(detail,W-M-42,y,7,C.gray);stroke(C.gold);doc.setLineWidth(.7);doc.line(M,y+3,W-M,y+3);y+=10};
 box(0,0,W,48,C.navy);txt('XM  /  EXAMINATION REPORT',M,14,8,[232,190,105],true);txt(exam.name,M,27,17,C.white,true);txt(new Date(exam.startedAt).toLocaleString(),M,37,8,[210,220,230]);fill(C.gold);doc.circle(184,22,10,'F');txt('XM',178,25,13,C.white,true);y=58;
 const cw=(W-2*M-8)/3,card=(x,label,val,sub,color)=>{box(x,y,cw,28,C.pale);txt(label.toUpperCase(),x+4,y+7,6,C.gray,true);txt(val,x+4,y+17,14,color,true);txt(sub,x+4,y+24,6,C.gray)};
 card(M,'Final score',`${num(r.score)} / ${num(r.total)}`,`${num(r.earned)} earned · ${num(r.deducted)} deducted`,C.navy);card(M+cw+4,'Accuracy',`${Math.round(r.accuracy)}%`,`${r.correct} correct / ${r.correct+r.wrong} answered`,C.green);card(M+2*(cw+4),'Time used',fmtClock((exam.finishedAt-exam.startedAt)/1000),`${exam.duration} minute allowance`,C.blue);y+=36;
 section('Performance distribution','Correct · Wrong · Unanswered');const total=exam.questions.length,bw=W-2*M;box(M,y,bw,9,[235,239,244]);let x=M;[[r.correct,C.green],[r.wrong,C.red],[r.unanswered,C.blank]].forEach(([v,c])=>{const w=total?bw*v/total:0;if(w){fill(c);doc.rect(x,y,w,9,'F');x+=w}});y+=16;
 [[`Correct ${r.correct}`,C.green],[`Wrong ${r.wrong}`,C.red],[`Unanswered ${r.unanswered}`,C.blank]].forEach(([t,c],i)=>{fill(c);doc.circle(M+i*57+2,y-1,1.5,'F');txt(t,M+i*57+6,y,7,C.gray)});y+=10;
 section('Subject performance');box(M,y,bw,9,C.navy);const sx=[M+2,M+76,M+108,M+137,M+166];['Subject','Questions','Correct','Wrong','Net marks'].forEach((t,i)=>txt(t,sx[i],y+6,6.5,C.white,true));y+=9;
 exam.subjects.forEach((s,i)=>{check(9);const qs=exam.questions.filter(q=>q.subject===s.name),c=qs.filter(q=>q.evaluation==='correct').length,w=qs.filter(q=>q.evaluation==='wrong').length,m=c*exam.correctMarks-w*exam.wrongMarks;if(i%2===0)box(M,y,bw,8,C.pale);txt(s.name.slice(0,30),sx[0],y+5.5,6.5,C.navy,true);txt(qs.length,sx[1],y+5.5,6.5,C.gray);txt(c,sx[2],y+5.5,6.5,C.green,true);txt(w,sx[3],y+5.5,6.5,C.red,true);txt(num(m),sx[4],y+5.5,6.5,C.navy,true);y+=9});y+=7;
 section('Checkpoint progress','Cumulative snapshots');if(!exam.checkpointLogs.length){txt('No checkpoints configured.',M,y,8,C.gray);y+=8}else{box(M,y,bw,9,C.navy);const cx=[M+2,M+43,M+78,M+110,M+144,M+170];['Checkpoint','Time','New','Total','All edits','Edits Δ'].forEach((t,i)=>txt(t,cx[i],y+6,6.2,C.white,true));y+=9;exam.checkpointLogs.forEach((c,i)=>{check(9);if(i%2===0)box(M,y,bw,8,C.pale);txt(c.label.slice(0,22),cx[0],y+5.5,6.2,C.navy,true);txt(fmtClock(c.elapsed),cx[1],y+5.5,6.2,C.gray);txt(c.answeredSince?.length||0,cx[2],y+5.5,6.2,C.navy);txt(c.answered.length,cx[3],y+5.5,6.2,C.navy);txt(c.totalChanges,cx[4],y+5.5,6.2,C.navy);txt(c.changesSince.length,cx[5],y+5.5,6.2,C.navy);y+=8})}y+=7;
 section('Question-by-question record');box(M,y,bw,9,C.navy);const qx=[M+2,M+17,M+68,M+112,M+143,M+169];['#','Subject','Answer','Evaluation','Time','Edits'].forEach((t,i)=>txt(t,qx[i],y+6,6.1,C.white,true));y+=9;
 exam.questions.forEach((q,i)=>{check(8);if(i%2===0)box(M,y,bw,7.5,C.pale);txt(i+1,qx[0],y+5.2,6.2,C.navy,true);txt(q.subject.slice(0,22),qx[1],y+5.2,6.1,C.navy);txt(q.answers.length?q.answers.map(a=>letters[a]).join(', '):'—',qx[2],y+5.2,6.2,C.gray);const res=q.evaluation||'Unanswered';txt(res,qx[3],y+5.2,6,res==='correct'?C.green:res==='wrong'?C.red:C.gray,true);txt(fmtClock(q.timeSpent),qx[4],y+5.2,6,C.gray);txt(q.history.length,qx[5],y+5.2,6,C.gray);y+=8.5});y+=7;
 section('Answer change history','Old selection → new selection');const events=exam.questions.flatMap(q=>q.history.map(h=>({q,h}))).sort((a,b)=>a.h.at-b.h.at);if(!events.length){txt('No answer changes were recorded.',M,y,8,C.gray);y+=8}events.forEach(({q,h})=>{check(8);txt(fmtClock(h.at/1000),M,y,6.2,C.gray);txt(`Q${q.id+1} · ${q.subject}`,M+29,y,6.2,C.navy,true);txt(`${h.from.map(i=>letters[i]).join(',')||'—'}  →  ${h.to.map(i=>letters[i]).join(',')||'—'}`,M+92,y,6.2,C.gray);y+=7});
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);stroke(C.line);doc.line(M,287,W-M,287);txt('XM Simulator · Locally generated report',M,292,6.5,C.gray);txt(`${p} / ${pages}`,W-M-10,292,6.5,C.gray)}doc.save(`${exam.name.replace(/[^a-z0-9-_]/gi,'_')}_report.pdf`);
}
$('addSubject').onclick=addSubject;
$('subjectsEditor').addEventListener('input',updateTotal);
$('subjectsEditor').addEventListener('click',e=>{const i=e.target.dataset.remove;if(i!==undefined&&subjects.length>1){subjects.splice(Number(i),1);renderSubjects()}});
$('addCheckpoint').onclick=()=>{
 const duration=Math.max(1,Number($('duration').value)||60),maxSec=duration*60-1,maxH=Math.floor(maxSec/3600);
 modal({title:'Add checkpoint',text:'Set the time from the start of the exam. Scroll over a field to adjust it; values stop at the exam duration.',body:`<label class="field-label">Checkpoint time</label><div class="time-wheel"><label>Hours<input id="cpHour" type="number" min="0" max="${maxH}" step="1" value="0"></label><label>Minutes<input id="cpMin" type="number" min="0" max="59" step="1" value="15"></label><label>Seconds<input id="cpSec" type="number" min="0" max="59" step="1" value="0"></label></div><label class="field-label">Checkpoint label<input id="cpLabel" placeholder="e.g. First review"></label><p class="muted tiny">Maximum: ${fmtClock(maxSec)}</p>`,confirm:'Add checkpoint',onConfirm:()=>{const h=Number($('cpHour').value)||0,m=Number($('cpMin').value)||0,s=Number($('cpSec').value)||0,t=h*3600+m*60+s;if(t<1||t>maxSec){alert(`Choose a time between 00:00:01 and ${fmtClock(maxSec)}.`);return false}addCheckpoint(t/60,$('cpLabel').value.trim()||`Checkpoint ${checkpoints.length+1}`)}});
 const clamp=()=>{const h=$('cpHour'),m=$('cpMin'),s=$('cpSec');h.value=Math.max(0,Math.min(maxH,Number(h.value)||0));m.value=Math.max(0,Math.min(59,Number(m.value)||0));s.value=Math.max(0,Math.min(59,Number(s.value)||0));const t=Number(h.value)*3600+Number(m.value)*60+Number(s.value);if(t>maxSec){h.value=Math.floor(maxSec/3600);m.value=Math.floor(maxSec%3600/60);s.value=maxSec%60}};
 ['cpHour','cpMin','cpSec'].forEach(id=>{const el=$(id);el.addEventListener('input',clamp);el.addEventListener('wheel',e=>{e.preventDefault();el.value=Math.max(Number(el.min),Math.min(Number(el.max),Number(el.value)+(e.deltaY<0?1:-1)));clamp()},{passive:false})});
};
document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>addCheckpoint(Number($('duration').value)*Number(b.dataset.fraction),`${Math.round(Number($('duration').value)*Number(b.dataset.fraction))} min checkpoint`));
$('checkpointList').addEventListener('input',e=>{if(e.target.dataset.cplabel!==undefined)checkpoints[Number(e.target.dataset.cplabel)].label=e.target.value});
$('checkpointList').addEventListener('click',e=>{if(e.target.dataset.cpremove!==undefined){checkpoints.splice(Number(e.target.dataset.cpremove),1);renderCheckpoints()}});
$('startExam').onclick=()=>{if(subjects.some(s=>!s.name.trim())){alert('Give every subject a name.');return}if(subjects.some(s=>s.count<1)){alert('Every subject needs at least one question.');return}if(checkpoints.some(c=>c.seconds>=Number($('duration').value)*60)){alert('Checkpoint exceeds the exam duration.');return}buildExam()};
$('finishExam').onclick=()=>finishExam(false);
$('optionsArea').addEventListener('click',e=>{const b=e.target.closest('[data-option]');if(!b||exam.locked)return;const q=exam.questions[currentIndex],i=Number(b.dataset.option);let a=[...q.answers];if(exam.multiple){if(a.includes(i)){if(!exam.mutable)return;a=a.filter(x=>x!==i)}else if(!exam.mutable&&a.length)return;else a.push(i)}else{if(!exam.mutable&&a.length)return;a=[i]}answerQuestion(q,a)});
$('subjectNav').addEventListener('click',e=>{const b=e.target.closest('[data-goto]');if(b){const q=exam.questions[currentIndex];if(!exam.allowUnanswered&&!q.answers.length&&Number(b.dataset.goto)!==currentIndex){alert('Please answer this question before moving on.');return}setActive(q.id);currentIndex=Number(b.dataset.goto);setActive(exam.questions[currentIndex].id);renderExam()}});
$('prevQuestion').onclick=()=>{if(currentIndex>0){setActive(exam.questions[currentIndex].id);currentIndex--;setActive(exam.questions[currentIndex].id);renderExam()}};
$('nextQuestion').onclick=()=>{const q=exam.questions[currentIndex];if(!exam.allowUnanswered&&!q.answers.length){alert('Please answer this question before moving on.');return}setActive(q.id);currentIndex=(currentIndex+1)%exam.questions.length;setActive(exam.questions[currentIndex].id);renderExam()};
$('alarmFloat').onclick=()=>{alarmOn=!alarmOn;$('alarmFloat').classList.toggle('active',alarmOn);$('alarmFloat').textContent=alarmOn?'♫ Alarm on':'♫ Alarm off'};
$('evalSubjectFilter').onchange=renderEvaluation;
$('evaluationList').addEventListener('click',e=>{const b=e.target.closest('[data-eval]');if(!b)return;const [id,result]=b.dataset.eval.split(':');getQuestion(Number(id)).evaluation=result;renderEvaluation()});
$('markAllPending').onclick=()=>{exam.questions.forEach(q=>{if(q.answers.length&&!q.evaluation)q.evaluation='wrong'});renderEvaluation()};
$('completeEvaluation').onclick=()=>{if(exam.questions.some(q=>q.answers.length&&!q.evaluation)){alert('Evaluate every answered question first.');return}renderReport();show('reportView')};
['filterSubject','filterResult','filterChanged','filterCheckpoint','filterOption','filterSort'].forEach(id=>$(id).onchange=renderQuestionReport);
$('resetFilters').onclick=()=>{['filterSubject','filterResult','filterChanged','filterCheckpoint','filterOption','filterSort'].forEach(id=>$(id).value='all');$('filterSort').value='original';renderQuestionReport()};
$('downloadPdf').onclick=downloadPdf;$('newExam').onclick=()=>{exam=null;show('setupView')};
$('clearHistory').onclick=()=>modal({title:'Clear exam history?',text:'This permanently removes all saved reports from this browser.',confirm:'Clear history',onConfirm:()=>{saveHistory([]);renderHistory()}});
$('historyList').addEventListener('click',e=>{const b=e.target.closest('[data-openhistory]');if(b)loadOldReport(b.dataset.openhistory)});
$('themeToggle').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('xmTheme',dark?'dark':'light');$('themeToggle').textContent=dark?'☀ Light mode':'☾ Dark mode'};
const theme=localStorage.getItem('xmTheme')||'light';document.documentElement.dataset.theme=theme;$('themeToggle').textContent=theme==='dark'?'☀ Light mode':'☾ Dark mode';
$('duration').addEventListener('change',()=>{checkpoints=checkpoints.filter(c=>c.seconds<Number($('duration').value)*60);renderCheckpoints()});
renderSubjects();renderCheckpoints();renderHistory();
})();