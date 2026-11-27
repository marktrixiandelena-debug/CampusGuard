import { visitorEntryTimestamp } from '../visitors/visitor-data.ts'
import { TODAY } from '../../data/data.ts'
import type { Assignment, Incident, Item, Visit } from '../../data/data.ts'

export const dashboardShift={start:'06:00',end:'14:00'}
export type DashboardRecords={visits:Visit[];incidents:Incident[];items:Item[];assignments:Assignment[]}
export type Logbook='incidents'|'visitors'|'items'
export const logbooks:Record<Logbook,{label:string;path:string}>={
  incidents:{label:'Incidents',path:'/incidents'},
  visitors:{label:'Visitors',path:'/visitors'},
  items:{label:'Lost & Found',path:'/lost-found'},
}
export function dashboardHref(path:string,params:Record<string,string>={}){
  return `${path}?${new URLSearchParams({from:'dashboard',...params})}`
}
export function matchesIncidentStatus(incident:Incident,status:string){
  return status==='All'||(status==='Unresolved'?['Open','Being Monitored'].includes(incident.status):incident.status===status)
}
export function matchesItemStatus(item:Item,status:string){
  return status==='All'||(status==='Awaiting Return'?item.type==='Found'&&item.status!=='Returned':item.status===status)
}
export function getDashboardSummary(db:DashboardRecords,date=TODAY,visitorDate=date){
  return {
    visitors:db.visits.filter(v=>v.date===visitorDate&&v.outcome==='Entered').length,
    unresolved:db.incidents.filter(i=>matchesIncidentStatus(i,'Unresolved')).length,
    awaitingReturn:db.items.filter(i=>matchesItemStatus(i,'Awaiting Return')).length,
    scheduled:new Set(db.assignments.filter(a=>a.date===date&&a.start===dashboardShift.start&&a.end===dashboardShift.end).map(a=>a.personId)).size,
    open:db.incidents.filter(i=>i.status==='Open').length,
    monitored:db.incidents.filter(i=>i.status==='Being Monitored').length,
    overdue:db.items.filter(i=>i.type==='Found'&&i.status==='Overdue').length,
    possibleMatch:db.items.filter(i=>i.status==='Possible Match').length,
  }
}
export function recentLogbookEntries(db:DashboardRecords,logbook:Logbook){
  const records=logbook==='incidents'?db.incidents.map(i=>({id:i.id,date:i.date,time:i.time,title:i.type,location:i.location,status:i.status})):logbook==='visitors'?db.visits.map(v=>({id:v.id,date:v.date,time:v.time,title:v.name,entryAt:v.entryAt,location:v.gate,status:v.outcome==='Denied'?'Denied':v.status})):db.items.map(i=>({id:i.id,date:i.date,time:i.time,title:i.name,location:i.location,status:i.status}))
  return records.sort((a,b)=>visitorEntryTimestamp(b).localeCompare(visitorEntryTimestamp(a))||b.id.localeCompare(a.id)).slice(0,5)
}

export const visitorFilterDefaults={search:'',gate:'All',period:'Today',status:'All',outcome:'All',vehicle:'Any vehicle'}
export const visitorPresets:Record<string,Partial<typeof visitorFilterDefaults>>={
  'today-entries':{period:'Today',outcome:'Entered'},all:{period:'All'},
}
export const incidentFilterDefaults={search:'',status:'All',type:'All Types',report:'All Report Statuses',sort:'Newest First'}
export const incidentPresets:Record<string,Partial<typeof incidentFilterDefaults>>={
  unresolved:{status:'Unresolved'},open:{status:'Open'},monitoring:{status:'Being Monitored'},all:{status:'All'},
}
export const itemFilterDefaults={search:'',type:'All',status:'All',period:'All',category:'All Categories',sort:'Newest First'}
export const itemPresets:Record<string,Partial<typeof itemFilterDefaults>>={
  'awaiting-return':{type:'Found',status:'Awaiting Return',period:'All'},
  'overdue-found':{type:'Found',status:'Overdue',period:'All'},
  'possible-match':{status:'Possible Match',period:'All'},all:{period:'All'},
}
