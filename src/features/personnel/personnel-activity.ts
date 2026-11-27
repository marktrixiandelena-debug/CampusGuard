import type { Activity, Incident, Person, Visit } from '../../data/data.ts'
import { accountName } from '../auth/auth-data.ts'
import type { MockAccount } from '../auth/auth-data.ts'
import { campusDateTime } from '../visitors/visitor-data.ts'

export function personnelActivity(personId:string,visits:Visit[],incidents:Incident[]){
  const entries=visits.filter(visit=>visit.entryGuardId===personId).map(visit=>({
    kind:'Visitor Check-In',id:visit.id,date:visit.date,time:visit.time,location:visit.gate,
  }))
  const exits=visits.flatMap(visit=>{
    if(visit.exitGuardId!==personId||!visit.exitAt||!Number.isFinite(Date.parse(visit.exitAt)))return []
    const {date,time}=campusDateTime(new Date(visit.exitAt))
    return [{kind:'Visitor Check-Out',id:visit.id,date,time,location:visit.exitGate||'Exit gate not recorded'}]
  })
  const reports=incidents.filter(incident=>incident.personnel===personId).map(incident=>({
    kind:'Assigned to Incident',id:incident.id,date:incident.date,time:incident.time,location:incident.location,
  }))
  return [...entries,...exits,...reports].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time))
}

export type PersonnelHistoryRow=Activity&{
  category:'Visitor transactions'|'Incident assignments'|'Personnel changes'
  actorKey:string
  reference?:string
}

export function combinedPersonnelHistory(activities:Activity[],visits:Visit[],incidents:Incident[],people:Person[],accounts:MockAccount[]):PersonnelHistoryRow[]{
  function actor(personId?:string,accountId?:string){
    const account=accounts.find(account=>account.id===accountId)
    const linkedId=personId||account?.personId
    const name=people.find(person=>person.id===linkedId)?.name
    return {
      actorKey:linkedId||accountId||'unrecorded',
      actor:name||(account?accountName(account,people):'Person not recorded'),
    }
  }
  const rows:PersonnelHistoryRow[]=activities.map(record=>({
    ...record,actorKey:record.personId||record.actorId||record.actor,category:'Personnel changes',
  }))
  for(const visit of visits){
    if(visit.outcome==='Entered'&&(visit.entryGuardId||visit.entryActorId)){
      const timestamp=visit.entryAt&&Number.isFinite(Date.parse(visit.entryAt))?campusDateTime(new Date(visit.entryAt)):null
      rows.push({id:'entry-'+visit.id,event:'Visitor Check-In',date:timestamp?.date||visit.date,time:timestamp?.seconds||visit.time,reference:visit.id,
        detail:visit.gate,category:'Visitor transactions',...actor(visit.entryGuardId,visit.entryActorId)})
    }
    if((visit.exitGuardId||visit.exitActorId)&&visit.exitAt&&Number.isFinite(Date.parse(visit.exitAt))){
      const {date,seconds:time}=campusDateTime(new Date(visit.exitAt))
      rows.push({id:'exit-'+visit.id,event:'Visitor Check-Out',date,time,reference:visit.id,
        detail:visit.exitGate||'Exit gate not recorded',category:'Visitor transactions',...actor(visit.exitGuardId,visit.exitActorId)})
    }
  }
  for(const incident of incidents){
    if(!incident.personnel)continue
    rows.push({id:'incident-'+incident.id,event:'Assigned to Incident',date:incident.date,time:incident.time,reference:incident.id,
      detail:[incident.type,incident.location].join(' · '),category:'Incident assignments',...actor(incident.personnel)})
  }
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||(b.time||'').localeCompare(a.time||''))
}
