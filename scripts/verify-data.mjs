import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { combinedPersonnelHistory, personnelActivity } from '../src/features/personnel/personnel-activity.ts'
import { upcomingDutyPeriod, weeklyDuties } from '../src/features/personnel/weekly-duty-template.ts'
import { weeklyDeployment } from '../src/features/personnel/deployment.ts'
import { dutyResponsibility, weeklyDutyGroups } from '../src/features/personnel/weekly-duty-groups.ts'
import { campusDateTime } from '../src/features/visitors/visitor-data.ts'
import { mockAccounts } from '../src/features/auth/auth-data.ts'
import { assignments, incidents, items, overlaps, people, periodMatches, TODAY, visits } from '../src/data/data.ts'

assert.equal(visits.filter(v=>v.date===TODAY&&v.outcome==='Entered').length,19)
assert.equal(items.filter(i=>i.type==='Found'&&i.status!=='Returned').length,5)
assert.equal(incidents.filter(i=>i.status==='Open').length,2)
assert.equal(assignments.filter(a=>a.date===TODAY).length,6)
assert.equal(overlaps(assignments),false)
const base={id:'test',personId:'SEC-001',location:'Library',date:TODAY,start:'06:00',end:'14:00'}
assert.equal(overlaps([base,{...base,id:'other',personId:'SEC-002'}]),false,'A group can contain several guards')
assert.equal(overlaps([base,{...base,id:'other',start:'14:00',end:'18:00'}]),false,'Adjacent shifts are allowed')
assert.equal(overlaps([base,{...base,id:'other',location:'Gate',start:'13:00',end:'18:00'}]),true,'The same guard cannot overlap shifts')
assert.equal(overlaps([base,{...base,id:'other',date:'2026-10-20'}]),false,'Dates have separate rosters')
assert.equal(periodMatches('2026-10-19','Today'),true)
assert.equal(periodMatches('2026-09-19','Today'),false)
assert.equal(periodMatches('2026-10-25','Week'),true)
assert.equal(periodMatches('2026-10-26','Week'),false)
assert.equal(new Set(items.map(i=>i.id)).size,items.length)
assert.equal(new Set(incidents.map(i=>i.id)).size,incidents.length)

const attributedVisit={...visits[0],id:'VIS-TEST',date:'2026-10-19',time:'18:00',entryGuardId:'SEC-001',exitGuardId:'SEC-002',exitAt:'2026-10-19T16:05:00Z',exitGate:'Gate 2 (Side)'}
const assignedIncident={...incidents[0],id:'INC-TEST',date:'2026-10-18',personnel:'SEC-001'}
assert.deepEqual(personnelActivity('SEC-001',[attributedVisit],[assignedIncident]).map(event=>[event.kind,event.id]),[['Visitor Check-In','VIS-TEST'],['Assigned to Incident','INC-TEST']])
assert.deepEqual(personnelActivity('SEC-002',[attributedVisit],[]),[{kind:'Visitor Check-Out',id:'VIS-TEST',date:'2026-10-20',time:'00:05',location:'Gate 2 (Side)'}])
assert.deepEqual(personnelActivity('SEC-003',[attributedVisit],[assignedIncident]),[])
const legacyActivity={id:'legacy-roster',date:'2026-10-19',event:'Roster created',detail:'Sample roster',actor:'Security Head'}
const history=combinedPersonnelHistory([legacyActivity],[
  {...attributedVisit,entryGuardId:undefined,entryActorId:'ACCOUNT-HEAD'},
  visits[1],
],[assignedIncident],people,mockAccounts)
assert.deepEqual(history.map(row=>[row.event,row.date,row.time,row.actorKey]),[
  ['Visitor Check-Out','2026-10-20','00:05:00','SEC-002'],
  ['Visitor Check-In','2026-10-19','18:00','ACCOUNT-HEAD'],
  ['Roster created','2026-10-19',undefined,'Security Head'],
  ['Assigned to Incident','2026-10-18',assignedIncident.time,'SEC-001'],
])
assert.equal(history[1].actor,'Rosario Bautista')
console.log('PASS: shared fixture totals, unique record IDs, date boundaries, group assignments, and shift-overlap rules.')

const reference=readFileSync(new URL('../references/UNC_WEEKLY_DUTY_DETAILS_REFERENCE.md',import.meta.url),'utf8')
const dutyRows=reference.split(/\r?\n/).filter(row=>/^\| \d+ \|/.test(row))
  .map(row=>row.split('|').slice(1,-1).map(field=>field.trim()))
assert.equal(dutyRows.length,25)
assert.deepEqual(weeklyDuties.map(duty=>[String(duty.number),duty.description,duty.start,duty.end,duty.shift,duty.designation||'—']),dutyRows)
assert.equal(weeklyDuties.filter(duty=>duty.shift==='Day').length,21)
assert.equal(weeklyDuties.filter(duty=>duty.end<duty.start).length,4)
assert.deepEqual(weeklyDutyGroups.flatMap(group=>group.slots).sort((a,b)=>a-b),weeklyDuties.map(duty=>duty.number))
assert.deepEqual(weeklyDutyGroups.map(group=>[
  group.slots.filter(number=>weeklyDuties[number-1].shift==='Day').length,
  group.slots.filter(number=>weeklyDuties[number-1].shift==='Night').length,
]),[[1,1],[8,1],[3,1],[3,1],[2,0],[2,0],[2,0]])
const tours=Object.groupBy(weeklyDuties,duty=>duty.start+'–'+duty.end)
assert.deepEqual(Object.fromEntries(Object.entries(tours).map(([time,rows])=>[time,rows.length])),{
  '06:00–14:00':4,'06:00–18:00':5,'07:00–19:00':6,'08:00–20:00':2,'14:00–22:00':4,'18:00–06:00':2,'19:00–07:00':2,
})
assert.notEqual(dutyResponsibility(weeklyDuties[9]),dutyResponsibility(weeklyDuties[10]))
assert.deepEqual(upcomingDutyPeriod('2026-11-27'),{start:'2026-11-30',end:'2026-12-05'})
assert.deepEqual(upcomingDutyPeriod(campusDateTime(new Date('2026-11-29T17:00:00Z')).date),{start:'2026-11-30',end:'2026-12-05'})
assert.deepEqual(upcomingDutyPeriod('2026-12-29'),{start:'2027-01-04',end:'2027-01-09'})
console.log('PASS: all 25 institutional duty rows and Monday–Saturday campus coverage defaults.')

const roster={id:'week-1',start:'2026-10-19',end:'2026-10-24',updatedAt:'2026-10-18T00:00:00Z',duties:weeklyDuties}
const project=(date,time='')=>weeklyDeployment([roster],date,time)
assert.equal(project('2026-10-19')[0].duties.length,25)
assert.equal(project('2026-10-20')[0].duties.length,29)
assert.deepEqual(project('2026-10-25','06:00')[0].duties.map(({duty,carry})=>[duty.number,carry]),[[22,true],[23,true]])
assert.deepEqual(project('2026-10-25','07:00'),[])
const manila=campusDateTime(new Date('2026-10-24T22:59:00Z'))
assert.equal(project(manila.date,manila.time)[0].duties.length,2)
assert.deepEqual(weeklyDeployment([roster,{...roster,id:'week-2',start:'2026-10-24',end:'2026-10-31'}],'2026-10-24','08:00').map(({roster})=>roster.id),['week-2','week-1'])
assert.ok(project('2026-10-19','14:00')[0].duties.some(({duty})=>duty.number===4))
assert.ok(!project('2026-10-19','14:00')[0].duties.some(({duty})=>duty.number===3))
console.log('PASS: weekly deployment recurrence, separate overlapping rosters, Manila dates and overnight boundaries.')

const palette=Object.fromEntries([...readFileSync(new URL('../src/styles/index.css',import.meta.url),'utf8').matchAll(/--([\w-]+):\s*(#[\da-f]{3,6})\b/gi)].map(([,name,color])=>[name,color]))
function luminance(color){
  assert.ok(color,'The tested palette token must exist')
  const hex=color.length===4?color.slice(1).split('').map(c=>c+c).join(''):color.slice(1)
  return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4).reduce((total,c,i)=>total+c*[0.2126,0.7152,0.0722][i],0)
}
for(const [foreground,background,minimum] of [
  ['text','surface',4.5],['text-secondary','page-bg',4.5],['text-muted','surface-subtle',4.5],
  ['surface','navy-soft',4.5],['surface','sidebar-active',4.5],
  ['selection-text','selection-bg',4.5],['selection-text','selection-hover',4.5],
  ['info','info-bg',4.5],['success','success-bg',4.5],['warning','warning-bg',4.5],['danger','danger-bg',4.5],
  ['control-border','surface',3],['control-border','selection-bg',3],
  ['focus','surface',3],['focus','page-bg',3],['selection-border','selection-bg',3],
]){
  const values=[luminance(palette[foreground]),luminance(palette[background])].sort((a,b)=>b-a)
  assert.ok((values[0]+0.05)/(values[1]+0.05)>=minimum,`${foreground} on ${background} must meet ${minimum}:1 contrast`)
}
console.log('PASS: shared text, selection, status, control-border, and keyboard-focus color contrast.')
