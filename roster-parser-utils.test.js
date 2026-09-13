import test from "node:test";
import assert from "node:assert/strict";
import {
  findRecoveredVisualMatch,
  repairSplitPilotDutyColumns
} from "./roster-parser-utils.js";

test("repeated S4-330 duties match by date, not activity name alone",()=>{
  const rows=[
    {date:"08-Sep-2026",item:"S4-330",arr:"KUL 23:59",duty:"06:59"},
    {date:"09-Sep-2026",item:"S4-330",arr:"KUL 23:59",duty:"06:59"},
    {date:"13-Sep-2026",item:"S4-330",arr:"KUL 20:10",duty:"03:10"}
  ];

  assert.equal(
    findRecoveredVisualMatch(rows,{date:"13-Sep-2026",item:"S4-330"}),
    rows[2]
  );
});

test("split MH6242 duty restores 0:00 block and 11:25 duty",()=>{
  const repaired=repairSplitPilotDutyColumns([
    {
      date:"13-Sep-2026",dutyStart:"20:10",item:"MH6242",
      arr:"MAA 22:30",dutyEnd:"0:00",block:"11:25",duty:""
    },
    {
      date:"13-Sep-2026",dutyStart:"",item:"MH6243",
      dep:"MAA 00:30(+1)",block:"0:00",duty:""
    }
  ]);

  assert.equal(repaired[0].dutyEnd,"");
  assert.equal(repaired[0].block,"0:00");
  assert.equal(repaired[0].duty,"11:25");
  assert.equal(repaired[1].block,"0:00");
});

test("a genuine midnight duty end is unchanged without a continuation",()=>{
  const original={
    date:"02-Sep-2026",dutyStart:"14:25",item:"MH389",
    arr:"KUL 23:15",dutyEnd:"0:00",block:"05:31",duty:"07:43"
  };

  assert.deepEqual(repairSplitPilotDutyColumns([original]),[original]);
});
