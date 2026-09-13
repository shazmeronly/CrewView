function normalized(value){
  return String(value||"").trim().toUpperCase();
}

/**
 * Match text-recovered roster data to the same printed row.
 * Repeated duties such as S4-330 must never be matched by activity code alone.
 */
export function findRecoveredVisualMatch(rows,recoveredRow){
  const date=String(recoveredRow?.date||"").trim();
  const item=normalized(recoveredRow?.item);

  const candidates=rows.filter(row=>
    String(row?.date||"").trim()===date &&
    normalized(row?.item)===item &&
    row?._recoveredFromText!==true
  );

  if(candidates.length<=1) return candidates[0]||null;

  const recoveredReport=String(recoveredRow?.dutyStart||"").trim();
  const recoveredDeparture=normalized(recoveredRow?.dep);

  return candidates.find(row=>
    (!recoveredReport || String(row?.dutyStart||"").trim()===recoveredReport) &&
    (!recoveredDeparture || normalized(row?.dep)===recoveredDeparture)
  ) || candidates[0];
}

/**
 * Some iFlight split duties print the first sector with no Duty End:
 *
 *   Duty End  Flying Hrs  Duty Hrs
 *              0:00       11:25
 *
 * PDF geometry can shift those two values left, producing Duty End=0:00 and
 * Block=11:25. Only repair this when a continuation flight follows in the
 * same duty, which prevents a legitimate midnight Duty End being changed.
 */
export function repairSplitPilotDutyColumns(rows){
  return rows.map((sourceRow,index)=>{
    const row={...sourceRow};
    const next=rows[index+1];
    const isFlight=/^MH\d{2,4}$/i.test(normalized(row.item));
    const nextIsContinuation=Boolean(
      next &&
      String(next.date||"").trim()===String(row.date||"").trim() &&
      /^MH\d{2,4}$/i.test(normalized(next.item)) &&
      !String(next.dutyStart||"").trim()
    );
    const shiftedZero=/^0+:00$/.test(String(row.dutyEnd||"").trim());
    const shiftedDuty=/^\d{1,2}:\d{2}$/.test(String(row.block||"").trim());

    if(
      isFlight &&
      nextIsContinuation &&
      String(row.dutyStart||"").trim() &&
      !String(row.duty||"").trim() &&
      shiftedZero &&
      shiftedDuty
    ){
      row.duty=row.block;
      row.block=row.dutyEnd;
      row.dutyEnd="";
    }

    return row;
  });
}
