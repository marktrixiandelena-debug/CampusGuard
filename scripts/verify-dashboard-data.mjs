import assert from 'node:assert/strict'
import * as seed from '../src/data/data.ts'
import { dashboardHref, dashboardShift, getDashboardSummary, incidentPresets, itemPresets, matchesIncidentStatus, matchesItemStatus, recentLogbookEntries, visitorPresets } from '../src/features/dashboard/dashboard-data.ts'

const summary=getDashboardSummary(seed)
assert.deepEqual(summary,{visitors:19,unresolved:4,awaitingReturn:5,scheduled:6,open:2,monitored:2,overdue:2,possibleMatch:4})
const visitorPreset=visitorPresets['today-entries']
assert.equal(seed.visits.filter(v=>seed.periodMatches(v.date,visitorPreset.period)&&v.outcome===visitorPreset.outcome).length,summary.visitors)
assert.equal(seed.incidents.filter(i=>matchesIncidentStatus(i,incidentPresets.unresolved.status)).length,summary.unresolved)
for(const [preset,count] of [['awaiting-return',summary.awaitingReturn],['overdue-found',summary.overdue],['possible-match',summary.possibleMatch]]){
  const filter=itemPresets[preset]
  assert.equal(seed.items.filter(i=>(!filter.type||i.type===filter.type)&&matchesItemStatus(i,filter.status)).length,count,`${preset} source records match the dashboard`)
}

const open=seed.incidents.find(i=>i.status==='Open')
const held=seed.items.find(i=>matchesItemStatus(i,'Awaiting Return'))
const changed={...seed,incidents:seed.incidents.map(i=>i.id===open.id?{...i,status:'Resolved'}:i),items:seed.items.map(i=>i.id===held.id?{...i,status:'Returned'}:i)}
assert.equal(getDashboardSummary(changed).unresolved,3)
assert.equal(getDashboardSummary(changed).awaitingReturn,4)
assert.equal(getDashboardSummary({...seed,incidents:[...seed.incidents,{...open,id:'older-open',date:'2025-01-01'}]}).unresolved,5,'Outstanding incidents include earlier dates')
const onShift=seed.assignments.find(a=>a.date===seed.TODAY)
assert.equal(getDashboardSummary({...seed,assignments:seed.assignments.filter(a=>a.id!==onShift.id)}).scheduled,5)
assert.equal(getDashboardSummary({...seed,assignments:[...seed.assignments,{...onShift,id:'duplicate-assignment'}]}).scheduled,6,'Count scheduled guards once')
assert.equal(getDashboardSummary({...seed,assignments:[...seed.assignments,{...onShift,id:'different-shift',personId:'other',start:'14:00',end:'22:00'}]}).scheduled,6)
assert.equal(summary.possibleMatch,4,'Possible matches count reports, not confirmed pairs')

const empty={visits:[],incidents:[],items:[],assignments:[]}
assert.deepEqual(Object.values(getDashboardSummary(empty)),Array(8).fill(0))
for(const logbook of ['incidents','visitors','items']){
  assert.deepEqual(recentLogbookEntries(empty,logbook),[])
  const recent=recentLogbookEntries(seed,logbook)
  assert.equal(recent.length,5)
  for(let i=1;i<recent.length;i++)assert.ok(`${recent[i-1].date}T${recent[i-1].time}`>=`${recent[i].date}T${recent[i].time}`)
}
const first=seed.incidents[0]
const ties={...empty,incidents:[{...first,id:'A'},{...first,id:'C'},{...first,id:'B'}]}
assert.deepEqual(recentLogbookEntries(ties,'incidents').map(i=>i.id),['C','B','A'])
const url=new URL(dashboardHref('/personnel/duty-schedule',{date:seed.TODAY,...dashboardShift}),'http://localhost')
assert.equal(url.searchParams.get('from'),'dashboard')
assert.equal(url.searchParams.get('date'),seed.TODAY)
assert.equal(url.searchParams.get('start'),'06:00')
console.log('PASS: dashboard counts and matching source presets, all-date follow-ups, record/return/schedule changes, distinct guards, recent ordering and limits, empty states, and dashboard links.')

const sameMinuteVisits=[{...seed.visits[0],id:'Z-earlier',entryAt:'2026-11-16T03:00:00.000Z'},{...seed.visits[0],id:'A-later',entryAt:'2026-11-16T03:00:00.001Z'}]
assert.deepEqual(recentLogbookEntries({...empty,visits:sameMinuteVisits},'visitors').map(v=>v.id),['A-later','Z-earlier'],'Recent visits use confirmed timestamps, not random ID order')
assert.equal(getDashboardSummary(seed,seed.TODAY,'2026-11-16').visitors,0,'Visitor Today can use the real campus date independently of the sample duty schedule')
