const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const functions=source.match(/^function [^\n]+\{[^\n]*\}$|^function [^\n]+\{\n[\s\S]*?^\}/gm).join('\n');
const constants=['VALIDATION_FIXTURES','KNOWN_SOURCE_TOTAL_DIFFERENCES'].map(name=>source.match(new RegExp(`const ${name}=\\{[\\s\\S]*?^\\};`,'m'))[0]).join('\n');
const context=vm.createContext({officialFH:'70:02',officialDH:'146:39',officialRosterPeriod:{key:'2026-09',start:new Date(2026,8,1),end:new Date(2026,8,30)}});
vm.runInContext(functions+'\n'+constants,context);
// Independently verified Duty Hrs printed in SEPTEMBER 2026(2).pdf.
const duties=[['01','07:44'],['02','07:43'],['04','09:54'],['05','10:03'],['07','09:24'],['08','06:59'],['09','06:59'],['12','12:47'],['13','03:10'],['13','12:52'],['16','11:10'],['17','11:10'],['21','10:15'],['23','10:45'],['28','11:55']];
context.rows=duties.map(([day,duty],i)=>({date:`${day}-Sep-2026`,item:`duty-${i}`,duty,block:i===0?'70:02':''}));
context.rows.push({date:'01-Oct-2026',item:'MH144',duty:'13:25',block:'0:00'});
const validate=()=>vm.runInContext('validateKnownRoster(rows)',context);
let result=validate();
assert.equal(result.passed,true);assert.equal(result.notices.length,1);
assert.match(result.notices[0],/146:39.*142:50/);
// The exact exception must not hide a lost minute or an unexpected header.
context.rows[0].duty='07:43';assert.equal(validate().passed,false);
context.rows[0].duty='07:44';context.officialDH='146:40';assert.equal(validate().passed,false);
context.officialDH='146:39';context.rows[0].block='70:01';assert.equal(validate().passed,false);
context.rows[0].block='70:02';context.rows.push({date:'01-Sep-2026',item:'duty-0',duty:'0:00'});
assert.ok(validate().issues.some(issue=>issue.startsWith('Duplicate rows:')));
// Latest Actual Roster removes the 09-Sep standby and moves MH159 to 18-Sep.
context.rows=duties.filter(([day])=>day!=='09').map(([day,duty],i)=>({
 date:`${day==='17'?'18':day}-Sep-2026`,item:`duty-${i}`,duty,block:i===0?'70:02':''
}));
context.rows.push({date:'01-Oct-2026',item:'MH144',duty:'13:25',block:'0:00'});
context.officialFH='70:02';context.officialDH='139:40';
assert.equal(validate().passed,true);assert.equal(validate().notices.length,1);
assert.match(validate().notices[0],/139:40.*135:51/);
context.rows[0].duty='07:43';assert.equal(validate().passed,false);
context.rows[0].duty='07:44';context.rows[0].block='70:01';assert.equal(validate().passed,false);
// Earlier verified September revision still produces a notice.
context.rows=[{date:'01-Sep-2026',item:'old-revision',block:'68:29',duty:'141:23'}];
context.officialFH='68:29';context.officialDH='140:46';
assert.equal(validate().passed,true);assert.equal(validate().notices.length,1);
// Matching totals need neither warning nor source discrepancy notice.
context.officialDH='141:23';assert.equal(validate().passed,true);assert.equal(validate().notices.length,0);
console.log('PASS: verified PDF discrepancy notice, October exclusion, unknown differences and duplicates still fail, previous revision retained');
