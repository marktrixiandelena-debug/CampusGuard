import assert from 'node:assert/strict'
import { resolveSession,mockAccounts,securityGates } from '../src/features/auth/auth-data.ts'
import { visits,people,assignments } from '../src/data/data.ts'
import { visitorCustodyLabel,campusDateTime,matchingVisitors,visitorName,visitorProfiles,visitorPeriodMatches,visitorReducer,visitorSummary,snapshotVisitorAssignment } from '../src/features/visitors/visitor-data.ts'

assert.equal(matchingVisitors(visitorProfiles,'m').length,0)
assert.equal(matchingVisitors(visitorProfiles,'  MARIA  SANTOS ').length,3)
assert.equal(matchingVisitors(visitorProfiles,'teresa')[0].id,'VP-003')
assert.equal(matchingVisitors(visitorProfiles,'del rosario')[0].id,'VP-007')
assert.equal(matchingVisitors(visitorProfiles,'not-a-person').length,0)
assert.equal(visitorName(visitorProfiles[0]),'Nestor Balboa')
assert.equal(new Set(visitorProfiles.map(p=>p.id)).size,visitorProfiles.length)
assert.deepEqual(campusDateTime(new Date('2026-11-15T16:01:02Z')),{date:'2026-11-16',time:'00:01',seconds:'00:01:02'})
assert.ok(visitorPeriodMatches('2026-11-15','Week','2026-11-15'))
assert.ok(!visitorPeriodMatches('2026-11-16','Week','2026-11-15'))
assert.ok(visitorPeriodMatches('2025-12-29','Week','2026-01-01'))
assert.ok(visitorPeriodMatches('2026-11-01','Month','2026-11-16'))
assert.ok(!visitorPeriodMatches('2026-10-19','Today','2026-11-16'))

for(const [fields,label] of [
  [{idDeposited:undefined},'Not Recorded'],
  [{idDeposited:false,idReturned:false},'Not Deposited'],
  [{idDeposited:true,idReturned:false,status:'Inside'},'Held'],
  [{idDeposited:true,idReturned:false,status:'Exited'},'Return Pending'],
  [{idDeposited:true,idReturned:true,status:'Exited'},'Returned'],
])assert.equal(visitorCustodyLabel({...visits[0],...fields}),label)

const initial={profiles:visitorProfiles,visits,result:null}
const actor=resolveSession(mockAccounts,'ACCOUNT-MAIN',people)
const context={people,assignments,actor}
const exitContext={...context,actor:{...actor,accountId:'TEST-SECOND',personId:'SEC-002',gates:[...securityGates]}}
const input={firstName:'Test',middleName:'Marie',lastName:'Visitor',idType:'National ID',purpose:'Admissions',idDeposited:'Yes',gate:'Gate 1 (Main)',identityVerified:true,guardId:'SEC-001'}
const action={type:'checkIn',requestId:'request-1',visitId:'new-visit',newProfileId:'new-profile',input,context,at:'2026-11-16T03:00:00Z'}
let state=visitorReducer(initial,action)
assert.ok(state.result.ok)
assert.equal(state.visits.length,visits.length+1)
assert.equal(state.profiles.length,visitorProfiles.length+1)
assert.equal(state.visits[0].date,'2026-11-16')
assert.equal(state.visits[0].time,'11:00')
assert.equal(state.visits[0].entryGuardId,'SEC-001')
assert.equal(state.visits[0].idReturned,false)
assert.equal(state.visits[0].entryAssignment,undefined,'Unmapped gates must not invent assignment history')
assert.deepEqual(visitorSummary(state.visits,'2026-11-16'),{inside:3,entries:1,vehicles:0,denied:0})
assert.equal(visitorReducer(state,action),state,'Replaying the same confirmation changes nothing')
for(const patch of [{firstName:' '},{lastName:''},{idType:''},{purpose:''},{idDeposited:''},{identityVerified:false},{gate:'invented'}]){
  const rejected=visitorReducer(initial,{...action,input:{...input,...patch}})
  assert.ok(!rejected.result.ok,JSON.stringify(patch))
  assert.equal(rejected.visits,visits)
  assert.equal(rejected.profiles,visitorProfiles,'Failed check-ins must not create orphan profiles')
}
let duplicate=visitorReducer(state,{...action,requestId:'repeat',visitId:'another-visit',input:{...input,profileId:'new-profile'}})
assert.ok(!duplicate.result.ok)
assert.equal(duplicate.visits,state.visits)
assert.ok(!visitorReducer(initial,{...action,input:{...input,profileId:'missing'}}).result.ok)
assert.ok(!visitorReducer(initial,{...action,input:{...input,firstName:'Maria',middleName:'',lastName:'Santos'}}).result.ok,'Existing profiles require explicit selection')
assert.ok(!visitorReducer(initial,{...action,input:{...input,firstName:'Nestor',middleName:'',lastName:'Balboa',idType:'UMID',profileId:'VP-001'}}).result.ok,'Legacy Inside visits block ambiguous duplicates')

const exit={type:'checkOut',requestId:'exit-1',at:'2026-11-16T04:00:00Z',context:exitContext,input:{visitId:'new-visit',gate:'Gate 2 (Side)',guardId:'SEC-002',departed:true,idReturned:false}}
for(const patch of [{departed:false},{gate:''}])assert.ok(!visitorReducer(state,{...exit,input:{...exit.input,...patch}}).result.ok)
assert.ok(!visitorReducer(state,{...exit,at:'2026-11-16T02:00:00Z'}).result.ok)
state=visitorReducer(state,exit)
assert.ok(state.result.ok)
assert.equal(state.visits.length,visits.length+1)
assert.equal(state.visits[0].status,'Exited')
assert.equal(state.visits[0].idReturned,false,'Departure does not resolve ID custody')
assert.equal(state.visits[0].exitGuardId,'SEC-002')
assert.equal(state.visits[0].entryGuardId,'SEC-001')
assert.deepEqual(visitorSummary(state.visits,'2026-11-16'),{inside:2,entries:1,vehicles:0,denied:0})
assert.ok(!visitorReducer(state,{...exit,requestId:'exit-again'}).result.ok,'A second exit must not overwrite the first')
const returned=visitorReducer(visitorReducer(initial,action),{...exit,input:{...exit.input,idReturned:true}})
assert.equal(returned.visits[0].idReturned,true)
const legacy=visitorReducer(initial,{...exit,input:{...exit.input,visitId:visits[0].id,idReturned:true}})
assert.ok(legacy.result.ok)
assert.equal(legacy.visits[0].idDeposited,undefined)
assert.equal(legacy.visits[0].idReturned,undefined,'Unknown legacy custody must stay unknown')
assert.equal(legacy.visits[0].entryGuardId,undefined)
assert.ok(!visitorReducer(initial,{...exit,input:{...exit.input,visitId:visits.at(-1).id}}).result.ok)
const repeat=visitorReducer(state,{...action,requestId:'second-entry',visitId:'new-visit-2',at:'2026-11-17T03:00:00Z',input:{...input,profileId:'new-profile',idDeposited:'No'}})
assert.ok(repeat.result.ok)
assert.equal(repeat.profiles.length,state.profiles.length,'A repeat visit reuses the selected profile')
assert.equal(repeat.visits[0].idDeposited,false)

const map={'Gate 1 (Main)':'UNC Arch / Entrance'}
const snapshot=snapshotVisitorAssignment('Gate 1 (Main)','2026-10-19','08:00',assignments,map)
assert.deepEqual(snapshot.personIds,['SEC-001','SEC-002'])
const original=JSON.stringify(snapshot)
const changed=assignments.map(a=>({...a,personId:'changed'}))
assert.notDeepEqual(snapshotVisitorAssignment('Gate 1 (Main)','2026-10-19','08:00',changed,map),snapshot)
assert.equal(JSON.stringify(snapshot),original,'Later schedule edits must not rewrite the captured roster')
assert.equal(snapshotVisitorAssignment('Gate 1 (Main)','2026-10-20','08:00',assignments,map),undefined)
assert.equal(snapshotVisitorAssignment('Gate 1 (Main)','2026-10-19','14:00',assignments,map),undefined)
assert.equal(snapshotVisitorAssignment('Gate 1 (Main)','2026-10-19','08:00',[...assignments,{...assignments[0],id:'overlap',start:'07:00',end:'15:00'}],map),undefined)
assert.equal(visits.length,265)
assert.equal(visitorProfiles.length,8)
console.log('PASS: profile matching, explicit identity selection, atomic registration, duplicate protection, entry/exit validation, independent ID custody, guard attribution, campus dates, legacy unknowns, and historical snapshots.')

assert.ok(!visitorReducer(initial,{...action,context:{...context,actor:null}}).result.ok)
assert.ok(!visitorReducer(initial,{...action,input:{...input,gate:securityGates[1]}}).result.ok,'A guard cannot enter a visitor at an unauthorized gate')
assert.equal(visitorReducer(initial,{...action,input:{...input,guardId:'SEC-006'}}).visits[0].entryGuardId,'SEC-001','Caller-supplied guard IDs cannot spoof the session identity')
assert.ok(!visitorReducer(initial,{...exit,context,input:{...exit.input,visitId:visits[0].id,gate:securityGates[0]}}).result.ok,'The entry gate must be in scope even if the exit gate is authorized')
const headActor=resolveSession(mockAccounts,'ACCOUNT-HEAD',people)
const headVisit=visitorReducer(initial,{...action,context:{...context,actor:headActor}}).visits[0]
assert.equal(headVisit.entryActorId,'ACCOUNT-HEAD')
assert.equal(headVisit.entryGuardId,undefined,'A Head transaction must not invent a guard profile')
