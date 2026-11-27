import { createContext, useContext, useReducer, useState } from 'react'
import { campusDateTime, visitorProfiles, visitorReducer } from '../features/visitors/visitor-data'
import type { CheckInInput, CheckOutInput } from '../features/visitors/visitor-data'
import { authReducer, mockAccounts, resolveSession } from '../features/auth/auth-data'
import type { GuardAccountChange, UserRole } from '../features/auth/auth-data'
import { overlappingDrafts, validWeeklyPeriod } from '../features/personnel/weekly-draft'
import type { WeeklyDraft } from '../features/personnel/weekly-draft'
import type { CampusPost, DutyPostLinks } from '../features/personnel/deployment'

import * as seed from '../data/data'
export function useStoreValue(){
  const [posts,setPosts]=useState<CampusPost[]>(seed.locations.map((name,i)=>({id:`post-${i+1}`,name,legacyName:name})))
  const [dutyPostLinks,setDutyPostLinks]=useState<DutyPostLinks>({})
  const [mapPhoto,setMapPhoto]=useState<string>()
  // shortcut: visitor transactions are in memory; use server transactions when persistence is introduced.
  const [visitorState,dispatchVisitor]=useReducer(visitorReducer,{profiles:visitorProfiles,visits:seed.visits,result:null})
  const visits=visitorState.visits
  const [incidents,setIncidents]=useState(seed.incidents)
  const [items,setItems]=useState(seed.items)
  const [people,setPeople]=useState(seed.people)
  const [assignments,setAssignments]=useState(seed.assignments)
  const [weeklyDrafts,setWeeklyDrafts]=useState<WeeklyDraft[]>([])
  const [authState,dispatchAuth]=useReducer(authReducer,{accounts:mockAccounts,sessionId:null,result:null})
  const currentUser=resolveSession(authState.accounts,authState.sessionId,people)
  if(authState.sessionId&&!currentUser)dispatchAuth({type:'logout'})
  function enterDemo(role:UserRole){
    const requestId=crypto.randomUUID()
    dispatchAuth({type:'enter-demo',requestId,role,people})
    return requestId
  }
  function logout(){dispatchAuth({type:'logout'})}
  function saveWeeklyDraft(draft:WeeklyDraft){
    if(currentUser?.role!=='Security Head'||!validWeeklyPeriod(draft))return
    setWeeklyDrafts(previous=>{
      if(overlappingDrafts(previous,draft,draft.id).some(row=>row.start===draft.start&&row.end===draft.end))return previous
      return previous.some(row=>row.id===draft.id)?previous.map(row=>row.id===draft.id?draft:row):[...previous,draft]
    })
  }
  function manageGuardAccount(change:GuardAccountChange){
    const requestId=crypto.randomUUID()
    dispatchAuth({type:'manage',requestId,newAccountId:`ACCOUNT-${crypto.randomUUID()}`,change,people})
    return requestId
  }
  function checkInVisitor(input:CheckInInput){
    const requestId=crypto.randomUUID()
    dispatchVisitor({type:'checkIn',input,requestId,visitId:`VIS-${crypto.randomUUID()}`,newProfileId:`VP-${crypto.randomUUID()}`,at:new Date().toISOString(),context:{people,assignments,actor:currentUser}})
    return requestId
  }
  function checkOutVisitor(input:CheckOutInput){
    const requestId=crypto.randomUUID()
    dispatchVisitor({type:'checkOut',input,requestId,at:new Date().toISOString(),context:{people,assignments,actor:currentUser}})
    return requestId
  }
  const [rosterStates,setRosterStates]=useState<Record<string,string>>({})
  function setRosterStatus(status:string,key:string){setRosterStates(old=>({...old,[key]:status}))}
  const [activities,setActivities]=useState<seed.Activity[]>([{id:'initial',date:seed.TODAY,event:'Roster created',detail:'Day shift · six personnel across four sample locations',actor:'Security Head'}])
  function activity(event:string,detail:string,affectedRosters?:readonly string[]){
    const {date,seconds:time}=campusDateTime()
    const record={id:crypto.randomUUID(),date,time,event,detail,actor:currentUser?.name||'Actor not recorded',actorId:currentUser?.accountId,personId:currentUser?.personId}
    setActivities(old=>[record,...old])
    if(!affectedRosters)setRosterStates({})
    else if(affectedRosters.length)setRosterStates(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!affectedRosters.includes(key))))
  }
  return {currentUser,accounts:authState.accounts,authResult:authState.result,enterDemo,logout,manageGuardAccount,visits,visitorProfiles:visitorState.profiles,visitorResult:visitorState.result,checkInVisitor,checkOutVisitor,incidents,setIncidents,items,setItems,people,setPeople,assignments,setAssignments,weeklyDrafts,saveWeeklyDraft,posts,setPosts,dutyPostLinks,setDutyPostLinks,mapPhoto,setMapPhoto,rosterStates,setRosterStatus,activities,activity}
}
export const DemoContext=createContext<ReturnType<typeof useStoreValue>|null>(null)

export function useDemo(){const value=useContext(DemoContext);if(!value)throw new Error('DemoProvider missing');return value}

