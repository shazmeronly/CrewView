const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
// Exercise production functions without starting the PDF/UI application.
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
const columns=['date','day','dutyStart','item','dep','arr','dutyEnd','work','block','duty','ac'];
const body={rows:[]};
const storage=new Map();
const context=vm.createContext({console,Intl,Date,Map,tbody:body,fitEnabled:false,rosterTimeBasis:'LT',crewViewMode:'classic',officialRosterPeriod:null,
  AIRPORT_TIMEZONES:{KUL:'Asia/Kuala_Lumpur',MAA:'Asia/Kolkata',PER:'Australia/Perth'},
  SMART_DUTY_STORAGE_KEY:'ops',SMART_DUTY_FIELDS:['pushback','airborne','landing','onChocks','dutyEnd'],
  SMART_DUTY_SECTOR_FIELDS:['pushback','airborne','landing','onChocks'],smartDutySectorSelections:new Map(),
  $:selector=>({value:selector==='#staff'?'2112523':selector==='#base'?'KUL':''}),
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
vm.runInContext(functions,context);
// Capture the pay view's real duty calculation whenever saving refreshes it.
vm.runInContext(`var payRefreshes=0, paySnapshot=[];
renderPayView=function(){payRefreshes++;paySnapshot=payDutyGroups();};`,context);
function rows(data){body.rows=data.map(row=>({dataset:{actualDate:row.date,actualDay:'Sun',overnightContinuation:row.overnight?'1':'0'},
 cells:columns.map(k=>({dataset:{k},textContent:row[k]||'',removeAttribute(){}})),
 querySelector(selector){return this.cells.find(cell=>selector===`[data-k="${cell.dataset.k}"]`);}}));}
const cell=(i,k)=>body.rows[i].querySelector(`[data-k="${k}"]`).textContent;
const run=code=>vm.runInContext(code,context);
rows([
 {date:'13-Sep-2026',dutyStart:'17:00',item:'S4-330',dep:'KUL 17:00',arr:'KUL 20:10',duty:'03:10'},
 {date:'13-Sep-2026',dutyStart:'20:10',item:'MH6242',work:'OP',dep:'KUL 21:25',arr:'MAA 22:30',block:'0:00',duty:'11:25'},
 {date:'13-Sep-2026',item:'MH6243',work:'OP',dep:'MAA 00:30(+1)',block:'0:00'},
 {date:'14-Sep-2026',arr:'KUL 06:50(+1)',dutyEnd:'07:35(+1)',overnight:true},
 {date:'15-Sep-2026',item:'D'}
]);
run(`var duty=buildCompleteDuty(getRows(),1); selectSmartDutySector(duty,0);
setOperationalEvent(duty,'pushback','13:32');setOperationalEvent(duty,'airborne','13:58');
setOperationalEvent(duty,'landing','17:22');setOperationalEvent(duty,'onChocks','17:25');`);
assert.equal(cell(1,'dep'),'KUL 21:32 ACT');
assert.equal(cell(1,'arr'),'MAA 22:55 ACT');
assert.equal(cell(1,'block'),'03:53 ACT');
assert.equal(cell(1,'duty'),'11:25');
assert.equal(run('paySnapshot[0].source'),'roster');
assert.equal(run('paySnapshot[0].minutes'),685);
assert.equal(cell(0,'duty'),'03:10');
assert.equal(cell(2,'dep'),'MAA 00:30(+1)');
assert.equal(cell(3,'arr'),'KUL 06:50(+1)');
assert.equal(run('selectedSmartDutySectorIndex(duty)'),1);
assert.equal(run('operationalEvent(operationalRecord(duty),"dutyEnd").at'),null);
run('smartDutySectorSelections.clear(); applyOperationalOverlayToClassic();');
assert.equal(cell(1,'arr'),'MAA 22:55 ACT');
assert.equal(run('smartDutyKey(buildCompleteDuty(getRows(),1))'),run('smartDutyKey(duty)'));
run(`setOperationalEvent(duty,'pushback','19:00');setOperationalEvent(duty,'airborne','19:10');
setOperationalEvent(duty,'landing','22:30');setOperationalEvent(duty,'onChocks','22:40');`);
assert.equal(cell(2,'dep'),'MAA 00:30(+1) ACT');
assert.equal(cell(2,'block'),'03:40 ACT');
assert.equal(cell(3,'arr'),'KUL 06:40(+1) ACT');
assert.equal(cell(3,'dutyEnd'),'07:25(+1) ACT');
assert.equal(cell(1,'duty'),'11:15 ACT');
assert.equal(run('paySnapshot.length'),1); // standby never enters productivity
assert.equal(run('paySnapshot[0].source'),'actual');
assert.equal(run('paySnapshot[0].minutes'),675);
assert.equal(run('paySnapshot[0].minutes/60*130'),1462.5);
assert.equal(run('payRefreshes'),8);
// Editing the final release recalculates immediately, with no page navigation.
run("setOperationalEvent(duty,'dutyEnd','23:40')");
assert.equal(run('paySnapshot[0].minutes'),690);
assert.equal(run('paySnapshot[0].minutes/60*130'),1495);
assert.equal(run('payRefreshes'),9);
assert.equal(cell(1,'block'),'03:53 ACT');
run("setOperationalEvent(duty,'dutyEnd',''); resetOperationalRecord(duty)");
assert.equal(cell(2,'dep'),'MAA 00:30(+1)');
assert.equal(cell(3,'arr'),'KUL 06:50(+1)');
assert.equal(cell(1,'duty'),'11:25');
assert.equal(run('paySnapshot[0].source'),'roster');
assert.equal(run('paySnapshot[0].minutes'),685);
assert.equal(cell(1,'block'),'03:53 ACT');
run('selectSmartDutySector(duty,0); resetOperationalRecord(duty)');
assert.equal(cell(1,'dep'),'KUL 21:25');
assert.equal(cell(1,'block'),'0:00');
// Single-sector duties keep their existing automatic release and overlay.
storage.clear();rows([{date:'13-Sep-2026',dutyStart:'20:10',item:'MH6242',work:'OP',dep:'KUL 21:25',arr:'MAA 22:30',dutyEnd:'23:15',block:'0:00',duty:'05:35'}]);
run(`duty=buildCompleteDuty(getRows(),0);selectSmartDutySector(duty,0);
setOperationalEvent(duty,'pushback','13:32');setOperationalEvent(duty,'onChocks','17:25');`);
assert.equal(cell(0,'block'),'03:53 ACT');assert.equal(cell(0,'dutyEnd'),'23:40 ACT');
console.log('PASS: screenshot times, sector advance, return/overnight, duty totals, standby isolation, saved-record reload, resets, single-sector compatibility, automatic productivity refresh and edited release');
