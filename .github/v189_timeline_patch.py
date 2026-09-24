from pathlib import Path


def replace_once(text, old, new, label):
    count=text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old,new,1)

app_path=Path('app.js')
app=app_path.read_text()

old_switch='''function switchSavedRoster(key){\n  const cached=loadRosterSnapshot(key);\n  if(!cached) return false;\n  return applyRosterSnapshot(cached,{\n    statusText:`Showing ${rosterMonthLabel(activeRosterKey)}.`,\n    resetViewport:false\n  });\n}\n'''
new_switch='''function switchSavedRoster(key){\n  const previousView=crewViewMode;\n  const cached=loadRosterSnapshot(key);\n  if(!cached) return false;\n\n  const switched=applyRosterSnapshot(cached,{\n    statusText:`Showing ${rosterMonthLabel(activeRosterKey)}.`,\n    resetViewport:false\n  });\n  if(!switched || previousView==="classic") return switched;\n\n  // Changing the saved month must not kick the user back to Classic.\n  clearTimeout(crewViewTransitionTimer);\n  document.body.classList.remove("view-switching","view-switch-cover");\n  crewViewMode=previousView;\n  setPrimaryRosterViewVisibility(previousView);\n  document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");\n\n  if(previousView==="calendar"){\n    document.body.classList.add("calendar-mode");\n    calendarCursor=loadedRosterMonth();\n    selectedCalendarDuty=null;\n    renderCalendarView({suppressAutoSelect:false});\n  }else if(previousView==="timeline"){\n    document.body.classList.add("timeline-mode");\n    renderTimelineView();\n    requestAnimationFrame(()=>{\n      const foundToday=scrollTimelineToToday({behavior:"auto",fallback:false});\n      if(!foundToday) window.scrollTo({top:0,left:0,behavior:"auto"});\n    });\n  }else if(previousView==="pay"){\n    document.body.classList.add("pay-mode");\n    renderPayView();\n  }\n\n  document.querySelectorAll(".view-tab[data-view]").forEach(tab=>\n    tab.classList.toggle("active",tab.dataset.view===previousView)\n  );\n  localStorage.setItem("crewview-roster-view",previousView);\n  return true;\n}\n'''
app=replace_once(app,old_switch,new_switch,'switchSavedRoster')

old_render='''  const monthLabel=month?month.toLocaleDateString("en-US",{month:"long",year:"numeric"}).toUpperCase():"LOADED ROSTER";\n  $("#timelineMonthLabel").textContent=monthLabel;\n  if(!events.length){\n'''
new_render='''  const monthLabel=month?month.toLocaleDateString("en-US",{month:"long",year:"numeric"}).toUpperCase():"LOADED ROSTER";\n  $("#timelineMonthLabel").textContent=monthLabel;\n\n  const library=loadRosterLibrary();\n  const keys=savedRosterKeys(library);\n  const current=resolveRosterKey(library,activeRosterKey||library.activeKey);\n  const currentIndex=keys.indexOf(current);\n  const previous=$("#timelinePrevMonth");\n  const next=$("#timelineNextMonth");\n  if(previous) previous.disabled=currentIndex<=0;\n  if(next) next.disabled=currentIndex<0 || currentIndex>=keys.length-1;\n\n  if(!events.length){\n'''
app=replace_once(app,old_render,new_render,'timeline navigation state')

old_scroll='''function scrollTimelineToToday(){\n  const now=new Date();\n  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];\n  const key=`${String(now.getDate()).padStart(2,"0")}-${months[now.getMonth()]}-${now.getFullYear()}`;\n  const exact=document.querySelector(`[data-timeline-date="${key}"]`);\n  const target=exact||document.querySelector(".cv-tl-item.is-next")||document.querySelector(".cv-tl-item");\n  target?.scrollIntoView({behavior:"smooth",block:"center"});\n}\n\n$("#timelineToday")?.addEventListener("click",scrollTimelineToToday);\n'''
new_scroll='''function scrollTimelineToToday({behavior="smooth",fallback=true}={}){\n  const now=new Date();\n  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];\n  const key=`${String(now.getDate()).padStart(2,"0")}-${months[now.getMonth()]}-${now.getFullYear()}`;\n  const exact=document.querySelector(`[data-timeline-date="${key}"]`);\n  const target=exact || (fallback\n    ? document.querySelector(".cv-tl-item.is-next")||document.querySelector(".cv-tl-item")\n    : null);\n  if(!target) return false;\n  target.scrollIntoView({behavior,block:"center"});\n  return Boolean(exact);\n}\n\n$("#timelineToday")?.addEventListener("click",()=>scrollTimelineToToday());\n$("#timelinePrevMonth")?.addEventListener("click",()=>moveSavedRoster(-1));\n$("#timelineNextMonth")?.addEventListener("click",()=>moveSavedRoster(1));\n'''
app=replace_once(app,old_scroll,new_scroll,'timeline today + nav handlers')

old_timeline_switch='''    }else if(goingToTimeline){\n      setPrimaryRosterViewVisibility("timeline");\n      document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");\n      document.body.classList.add("timeline-mode");\n      renderTimelineView();\n    }else if(goingToPay){\n'''
new_timeline_switch='''    }else if(goingToTimeline){\n      setPrimaryRosterViewVisibility("timeline");\n      document.body.classList.remove("calendar-mode","timeline-mode","pay-mode");\n      document.body.classList.add("timeline-mode");\n      renderTimelineView();\n      crewViewScrollPositions.timeline=0;\n      requestAnimationFrame(()=>{\n        const foundToday=scrollTimelineToToday({behavior:"auto",fallback:false});\n        if(!foundToday) window.scrollTo({top:0,left:0,behavior:"auto"});\n      });\n    }else if(goingToPay){\n'''
app=replace_once(app,old_timeline_switch,new_timeline_switch,'timeline auto today on open')
app_path.write_text(app)

index_path=Path('index.html')
index=index_path.read_text()
old_timeline_html='''    <div class="timeline-monthbar">\n      <div class="timeline-month-title"><span aria-hidden="true">▣</span><strong id="timelineMonthLabel">LOADED ROSTER</strong></div>\n      <button type="button" class="timeline-today" id="timelineToday">Today</button>\n    </div>\n'''
new_timeline_html='''    <div class="timeline-monthbar">\n      <div class="timeline-month-title"><span aria-hidden="true">▣</span><strong id="timelineMonthLabel">LOADED ROSTER</strong></div>\n      <div class="timeline-month-actions">\n        <button type="button" class="timeline-month-nav" id="timelinePrevMonth" aria-label="Previous saved roster month">‹</button>\n        <button type="button" class="timeline-today" id="timelineToday">Today</button>\n        <button type="button" class="timeline-month-nav" id="timelineNextMonth" aria-label="Next saved roster month">›</button>\n      </div>\n    </div>\n'''
index=replace_once(index,old_timeline_html,new_timeline_html,'timeline monthbar HTML')
index=index.replace('?v=188','?v=189')
index_path.write_text(index)

style_path=Path('style.css')
style=style_path.read_text()
anchor='.timeline-today{border:1px solid var(--line);border-radius:12px;background:var(--panel,#fff);color:inherit;padding:8px 12px;font-size:11px;font-weight:800}\n'
addition='''.timeline-today{border:1px solid var(--line);border-radius:12px;background:var(--panel,#fff);color:inherit;padding:8px 12px;font-size:11px;font-weight:800}\n.timeline-month-actions{display:flex;align-items:center;gap:6px}\n.timeline-month-nav{width:34px;height:34px;border:1px solid var(--line);border-radius:12px;background:var(--panel,#fff);color:inherit;font-size:20px;line-height:1;font-weight:800;display:grid;place-items:center}\n.timeline-month-nav:disabled{opacity:.32}\n'''
style=replace_once(style,anchor,addition,'timeline nav styles')
style_path.write_text(style)

sw_path=Path('sw.js')
sw=sw_path.read_text().replace('crewview-v188','crewview-v189').replace('?v=188','?v=189')
sw_path.write_text(sw)

Path('tests/timeline-month-navigation.cjs').write_text(r'''const fs=require('node:fs');
const assert=require('node:assert/strict');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('style.css','utf8');
assert.match(html,/id="timelinePrevMonth"/);
assert.match(html,/id="timelineNextMonth"/);
assert.match(app,/const previousView=crewViewMode;[\s\S]*if\(previousView==="timeline"\)/);
assert.match(app,/scrollTimelineToToday\(\{behavior:"auto",fallback:false\}\)/);
assert.match(app,/timelinePrevMonth[\s\S]*moveSavedRoster\(-1\)/);
assert.match(app,/timelineNextMonth[\s\S]*moveSavedRoster\(1\)/);
assert.match(css,/\.timeline-month-nav/);
console.log('PASS: Timeline preserves view across saved months and auto-centres today');
''')
