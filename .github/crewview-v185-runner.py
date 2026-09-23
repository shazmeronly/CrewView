from pathlib import Path

script_path=Path('.github/crewview-v185-patch.py')
script=script_path.read_text()
old="""replace_once(
'''    const date=parseRosterDate(row.date);\n''',
'''    const date=parseRosterDate(operationalRosterDate(row));\n''',
'validate by operational date')"""
new="""replace_once(
'''  const validationRows=rows.filter(row=>{\n    if(!officialRosterPeriod) return true;\n    const date=parseRosterDate(row.date);\n    if(!date) return false;\n    return date>=officialRosterPeriod.start && date<=officialRosterPeriod.end;\n  });\n''',
'''  const validationRows=rows.filter(row=>{\n    if(!officialRosterPeriod) return true;\n    const date=parseRosterDate(operationalRosterDate(row));\n    if(!date) return false;\n    return date>=officialRosterPeriod.start && date<=officialRosterPeriod.end;\n  });\n''',
'validate by operational date')"""
if old not in script:
    raise SystemExit('runner could not locate validation replacement in patch helper')
script=script.replace(old,new,1)
exec(compile(script,str(script_path),'exec'))
