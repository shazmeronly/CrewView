const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
const ctx=vm.createContext({
  console,Intl,Date,Map,Set,
  officialFH:null,
  officialDH:'135:16',
  officialRosterPeriod:{key:'boundary-regression',start:new Date(2026,8,1),end:new Date(2026,8,30)},
  rosterTimeBasis:'UTC',
  AIRPORT_TIMEZONES:{KUL:'Asia/Kuala_Lumpur',AKL:'Pacific/Auckland'}
});
vm.runInContext(functions+'\n'+source.match(/const VALIDATION_FIXTURES=\{[\s\S]*?^\};/m)[0],ctx);

ctx.rows=[
  {date:'31-Aug-2026',dutyStart:'23:30',item:'MH388',dep:'KUL 00:50(+1)',block:'0:00',duty:'07:44'},
  {date:'10-Sep-2026',dutyStart:'00:00',item:'MH900',dep:'KUL 01:00',block:'0:00',duty:'127:32'},
  {date:'30-Sep-2026',dutyStart:'23:50',item:'MH144',dep:'AKL 00:50(+1)',block:'0:00',duty:'13:25'}
];
ctx.evidence={
  flights:[
    {date:'31-Aug-2026',item:'MH388'},
    {date:'10-Sep-2026',item:'MH900'},
    {date:'30-Sep-2026',item:'MH144'}
  ],
  duties:[
    {date:'31-Aug-2026',item:'MH388',minutes:464},
    {date:'10-Sep-2026',item:'MH900',minutes:7652},
    {date:'30-Sep-2026',item:'MH144',minutes:805}
  ]
};

ctx.rows=vm.runInContext('annotateOperationalDates(rows)',ctx);
assert.equal(ctx.rows[0].date,'01-Sep-2026');
assert.equal(ctx.rows[0]._sourceDate,'31-Aug-2026');
assert.equal(ctx.rows[2].date,'01-Oct-2026');
assert.equal(ctx.rows[2]._sourceDate,'30-Sep-2026');

const result=vm.runInContext('validateKnownRoster(rows,evidence)',ctx);
assert.equal(result.passed,true,JSON.stringify(result));
assert.equal(result.issues.length,0);
console.log('PASS: UTC month-boundary rows retain source dates while monthly DH uses operational dates');
