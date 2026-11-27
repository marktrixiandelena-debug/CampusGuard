import type { Assignment, Person, Visit, VisitorAssignment } from '../../data/data.ts'
import { canUseGate, mayViewVisit, securityGates } from '../auth/auth-data.ts'
import type { SessionUser } from '../auth/auth-data.ts'

export type VisitorProfile={id:string;firstName:string;middleName?:string;lastName:string;idType:string}
export const visitorProfiles:VisitorProfile[]=[
  {id:'VP-001',firstName:'Nestor',lastName:'Balboa',idType:'UMID'},
  {id:'VP-002',firstName:'Bianca',lastName:'Restrepo',idType:'National ID'},
  {id:'VP-003',firstName:'Maria',middleName:'Teresa',lastName:'Santos',idType:'National ID'},
  {id:'VP-004',firstName:'Maria',lastName:'Santos',idType:'UMID'},
  {id:'VP-005',firstName:'Maria',lastName:'Santos',idType:'National ID'},
  {id:'VP-006',firstName:'Paolo',middleName:'Angelo',lastName:'Rivera',idType:'National ID'},
  {id:'VP-007',firstName:'Rosa',middleName:'Mae',lastName:'Del Rosario',idType:'UMID'},
  {id:'VP-008',firstName:'Jose',lastName:'Mendoza',idType:'National ID'},
]
export const visitorIdTypes=['National ID','UMID']
export const visitorGates=securityGates
// shortcut: gate-to-post relationships are unconfirmed; populate only after UNC confirms them.
export const visitorGatePosts:Readonly<Record<string,string>>={}
export const visitorName=(p:Pick<VisitorProfile,'firstName'|'middleName'|'lastName'>)=>[p.firstName,p.middleName,p.lastName].filter(Boolean).join(' ')
const normalized=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase()
export function matchingVisitors(profiles:VisitorProfile[],query:string){
  const text=normalized(query)
  if(text.length<2)return []
  return profiles.filter(p=>text.split(' ').every(part=>normalized(visitorName(p)).includes(part)))
}
export function campusDateTime(at=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at)
  const value=(name:string)=>parts.find(p=>p.type===name)!.value
  return {date:`${value('year')}-${value('month')}-${value('day')}`,time:`${value('hour')}:${value('minute')}`,seconds:`${value('hour')}:${value('minute')}:${value('second')}`}
}
export function visitorPeriodMatches(date:string,period:string,today:string){
  if(period==='All')return true
  if(period==='Month')return date.slice(0,7)===today.slice(0,7)
  if(period==='Week'){
    const monday=new Date(today+'T00:00:00Z'),weekday=(monday.getUTCDay()+6)%7
    monday.setUTCDate(monday.getUTCDate()-weekday)
    const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6)
    return date>=monday.toISOString().slice(0,10)&&date<=sunday.toISOString().slice(0,10)
  }
  return date===today
}
export function visitorSummary(visits:Visit[],today:string){
  const entries=visits.filter(v=>v.date===today&&v.outcome==='Entered')
  return {inside:visits.filter(v=>v.status==='Inside').length,entries:entries.length,vehicles:entries.filter(v=>v.vehicle!=='No').length,denied:visits.filter(v=>v.date===today&&v.outcome==='Denied').length}
}
export const visitorEntryTimestamp=(visit:Pick<Visit,'date'|'time'|'entryAt'>)=>new Date(visit.entryAt||`${visit.date}T${visit.time}+08:00`).toISOString()
export const canCheckOut=(visit:Visit)=>visit.status==='Inside'&&visit.outcome==='Entered'
export const visitorCustodyLabel=(visit:Visit)=>visit.idDeposited===undefined?'Not Recorded':!visit.idDeposited?'Not Deposited':visit.idReturned?'Returned':visit.status==='Inside'?'Held':'Return Pending'
export function snapshotVisitorAssignment(gate:string,date:string,time:string,assignments:Assignment[],mapping=visitorGatePosts):VisitorAssignment|undefined{
  const post=mapping[gate]
  if(!post)return undefined
  const matching=assignments.filter(a=>a.location===post&&a.date===date&&a.start<=time&&time<a.end)
  const shifts=new Set(matching.map(a=>a.start+'|'+a.end))
  if(shifts.size!==1)return undefined
  return {post,date,start:matching[0].start,end:matching[0].end,personIds:[...new Set(matching.map(a=>a.personId))]}
}

export type CheckInInput={profileId?:string;firstName:string;middleName:string;lastName:string;idType:string;purpose:string;idDeposited:string;gate:string;identityVerified:boolean}
export type CheckOutInput={visitId:string;gate:string;departed:boolean;idReturned:boolean}
export type VisitorResult={requestId:string;ok:boolean;visitId?:string;message?:string;errors:Record<string,string>}
export type VisitorState={profiles:VisitorProfile[];visits:Visit[];result:VisitorResult|null}
type TransactionContext={people:Person[];assignments:Assignment[];actor:SessionUser|null}
export type VisitorAction=({type:'checkIn';input:CheckInInput;visitId:string;newProfileId:string}|{type:'checkOut';input:CheckOutInput})&{requestId:string;at:string;context:TransactionContext}
export function visitorReducer(state:VisitorState,action:VisitorAction):VisitorState{
  if(state.result?.requestId===action.requestId)return state
  const errors:Record<string,string>={}
  const input=action.input
  const actor=action.context.actor
  if(!actor)errors.form='Sign in before recording visitor transactions.'
  if(!canUseGate(actor,input.gate))errors.gate='Choose a gate authorized for your account.'
  if(actor?.role==='Security Guard'&&!action.context.people.some(p=>p.id===actor.personId&&p.status==='Active'))errors.form='Your personnel profile is unavailable. Contact the Security Head.'
  if(!Number.isFinite(Date.parse(action.at)))errors.form='The transaction time is invalid. Try again.'
  const fail=():VisitorState=>({...state,result:{requestId:action.requestId,ok:false,errors}})
  if(action.type==='checkIn'){
    const input=action.input
    if(!input.firstName.trim())errors.firstName='Enter the first name.'
    if(!input.lastName.trim())errors.lastName='Enter the last name.'
    if(!visitorIdTypes.includes(input.idType))errors.idType='Choose an ID type.'
    if(!input.purpose.trim())errors.purpose='Enter the purpose of the visit.'
    if(!['Yes','No'].includes(input.idDeposited))errors.idDeposited='Choose whether an ID was deposited.'
    if(input.identityVerified!==true)errors.identityVerified='Verify the visitor identity before check-in.'
    const saved=input.profileId?state.profiles.find(p=>p.id===input.profileId):undefined
    const names={firstName:input.firstName.trim().replace(/\s+/g,' '),middleName:input.middleName.trim().replace(/\s+/g,' '),lastName:input.lastName.trim().replace(/\s+/g,' ')}
    const name=visitorName(names)
    if(input.profileId&&(!saved||normalized(visitorName(saved))!==normalized(name)))errors.profile='The selected profile no longer matches these names. Clear the selection and search again.'
    if(!input.profileId&&state.profiles.some(p=>normalized(visitorName(p))===normalized(name)&&p.idType===input.idType))errors.profile='An existing profile has this name and ID type. Search and explicitly select the correct visitor instead of creating a duplicate.'
    if(state.visits.some(v=>v.status==='Inside'&&(saved?v.profileId===saved.id:false)))errors.form='This visitor is already recorded Inside. Check the existing visit before continuing.'
    // shortcut: legacy identity uses name + ID type; replace with profile references when legacy records are linked.
    if(state.visits.some(v=>v.status==='Inside'&&!v.profileId&&normalized(v.name)===normalized(name)&&v.identification===input.idType))errors.form='A legacy visit with this name and ID type is still Inside. Review that visit before checking in again.'
    if(!action.visitId||state.visits.some(v=>v.id===action.visitId))errors.form='This check-in has already been recorded. Open the existing visit.'
    if(!saved&&(!action.newProfileId||state.profiles.some(p=>p.id===action.newProfileId)))errors.profile='The profile reference is invalid. Try again.'
    if(Object.keys(errors).length)return fail()
    const profile=saved||{id:action.newProfileId,...names,idType:input.idType}
    const when=campusDateTime(new Date(action.at))
    const visit:Visit={id:action.visitId,profileId:profile.id,name,identification:input.idType,date:when.date,time:when.time,gate:input.gate,purpose:input.purpose.trim(),vehicle:'No',pass:'None',status:'Inside',outcome:'Entered',entryAt:action.at,entryGuardId:actor!.personId,entryActorId:actor!.accountId,idDeposited:input.idDeposited==='Yes',idReturned:false,entryAssignment:snapshotVisitorAssignment(input.gate,when.date,when.time,action.context.assignments)}
    return {profiles:saved?state.profiles:[profile,...state.profiles],visits:[visit,...state.visits],result:{requestId:action.requestId,ok:true,visitId:visit.id,message:`${name} checked in successfully.`,errors:{}}}
  }
  const visit=state.visits.find(v=>v.id===action.input.visitId)
  if(visit&&!mayViewVisit(actor,visit))errors.form='This visit is outside your authorized gates. Contact the Security Head.'
  if(!visit||!canCheckOut(visit))errors.form='Only a visitor currently Inside with an admitted entry can be checked out. This visit may already have changed.'
  if(action.input.departed!==true)errors.departed='Confirm that the visitor has departed.'
  if(visit?.entryAt&&Date.parse(action.at)<Date.parse(visit.entryAt))errors.form='Exit time cannot be earlier than entry. Check the device clock.'
  if(Object.keys(errors).length||!visit)return fail()
  const when=campusDateTime(new Date(action.at))
  const updated:Visit={...visit,status:'Exited',exitAt:action.at,exitGate:input.gate,exitGuardId:actor!.personId,exitActorId:actor!.accountId,exitAssignment:snapshotVisitorAssignment(input.gate,when.date,when.time,action.context.assignments),...(visit.idDeposited===true?{idReturned:visit.idReturned===true||action.input.idReturned===true}:{})}
  return {...state,visits:state.visits.map(v=>v.id===visit.id?updated:v),result:{requestId:action.requestId,ok:true,visitId:visit.id,message:`${visit.name} checked out.${visit.idDeposited===true&&!updated.idReturned?' ID return remains unresolved.':''}`,errors:{}}}
}
