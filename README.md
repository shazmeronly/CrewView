# CrewView Pilot Roster

Mobile-first Progressive Web App for converting the current roster PDF into a complete on-device crew companion.

## v200 interface

The v200 redesign keeps the proven v171 roster and allowance engine, then reorganises it into five destinations:

- **Today** — Smart Duty, UTC actual-time entry, duty progress and the current duty's estimated allowances
- **Roster** — the retained Classic report plus a semantic, colour-coded Calendar
- **Timeline** — chronological duties, sectors, layovers and allowance context
- **Earnings** — productivity, 80+ block-hour and layover estimates with the existing month breakdown
- **Profile** — light/dark appearance, PDF export, roster replacement and privacy information

The approved CrewView mark and navy/blue/cyan palette are used in both light and dark modes. Flight, positioning/standby, training, leave and off-day states use consistent semantic colours in Classic and Calendar; layovers use teal in Smart Duty and Timeline.

Roster cache, operational UTC entries, display preferences, parser output and direct two-page PDF export retain their existing on-device keys and data formats, so upgrading does not require a new roster import.

## Features
- Upload current roster PDF
- Full calendar month with day names
- Colour-coded report times, duties, sectors, off days, training and positioning
- One-page classic view
- Editable cells
- Monthly totals
- A4 landscape PDF export
- Add to Home Screen support
- Offline caching after first load

## Vercel deployment
1. Upload all files and folders from this package to the root of the GitHub repository.
2. Vercel framework preset: Other.
3. Leave Build Command and Output Directory empty.
4. Deploy.

## Privacy
Roster parsing happens inside the browser.
