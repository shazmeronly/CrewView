const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
const ctx=vm.createContext({console,Intl,Date,Map,Set,AIRPORT_TIMEZONES:{KUL:'Asia/Kuala_Lumpur',PVG:'Asia/Shanghai',AKL:'Pacific/Auckland'},$:()=>({value:'KUL'}),rosterTimeBasis:'LT'});
vm.runInContext(functions,ctx);
ctx.utcRows=[
 {date:'31-Aug-2026',_sourceDate:'31-Aug-2026',dutyStart:'23:30',_sourceDutyStart:'23:30',item:'MH388',dep:'KUL 00:50(+1)',arr:'PVG 06:29(+1)',block:'0:00',duty:'07:44'},
 {date:'02-Sep-2026',_sourceDate:'02-Sep-2026',dutyStart:'',_sourceDutyStart:'16:00',item:'D',dep:'',arr:''},
 {date:'08-Sep-2026',_sourceDate:'08-Sep-2026',dutyStart:'',_sourceDutyStart:'16:00',item:'D',dep:'',arr:''},
 {date:'30-Sep-2026',_sourceDate:'30-Sep-2026',dutyStart:'23:50',_sourceDutyStart:'23:50',item:'MH144',dep:'AKL 00:50(+1)',arr:'KUL 12:30(+1)',block:'0:00',duty:'13:25'}
];
assert.equal(vm.runInContext('detectRosterTimeBasis(utcRows,"")',ctx),'UTC');
ctx.rosterTimeBasis='UTC';
ctx.rows=vm.runInContext('annotateOperationalDates(utcRows)',ctx);
assert.equal(ctx.rows[0].date,'01-Sep-2026');
assert.equal(ctx.rows[3].date,'01-Oct-2026');
ctx.localRows=[
 {date:'03-Sep-2026',_sourceDate:'03-Sep-2026',dutyStart:'',_sourceDutyStart:'00:00',item:'D',dep:'',arr:''},
 {date:'10-Sep-2026',_sourceDate:'10-Sep-2026',dutyStart:'',_sourceDutyStart:'00:00',item:'D',dep:'',arr:''},
 {date:'28-Sep-2026',_sourceDate:'28-Sep-2026',dutyStart:'20:15',_sourceDutyStart:'20:15',item:'MH145',dep:'KUL 21:30',arr:'AKL 12:25(+1)',block:'06:36',duty:'11:55'}
];
ctx.rosterTimeBasis='LT';
assert.equal(vm.runInContext('detectRosterTimeBasis(localRows,"")',ctx),'LT');
console.log('PASS: unlabeled UTC calendar anchors detected; normal KUL LT roster remains LT');
