import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

// URL-backed filters let dashboard presets, source controls, reloads, and the
// browser's Back button use the same state. Unknown preset/option values fall
// back to ordinary page defaults; creation/detail parameters stay independent.
export function useLogbookFilters<T extends Record<string,string>>(defaults:T,presets:Record<string,Partial<T>>,options:Partial<Record<keyof T,readonly string[]>>,config?:{resetPageOnChange?:readonly (keyof T)[]}){
  const [params,setParams]=useSearchParams()
  const view=params.get('view')||''
  const preset=Object.hasOwn(presets,view)?presets[view]:{}
  const filters={...defaults,...preset}
  for(const key of Object.keys(defaults) as (keyof T)[]){
    const value=params.get(String(key))
    if(value!==null&&(!options[key]||options[key]?.includes(value)))filters[key]=value as T[keyof T]
  }
  function setFilter(key:keyof T,value:string){
    const next=new URLSearchParams(params)
    next.delete('view')
    for(const name of Object.keys(defaults) as (keyof T)[]){
      const current=name===key?value:filters[name]
      if(current===defaults[name])next.delete(String(name))
      else next.set(String(name),current)
    }
    if(config?.resetPageOnChange?.includes(key))next.delete('page')
    setParams(next,{replace:true})
  }
  function resetFilters(){
    const next=new URLSearchParams(params)
    next.delete('view')
    Object.keys(defaults).forEach(key=>next.delete(key))
    setParams(next,{replace:true})
  }
  return {filters,setFilter,resetFilters}
}

export function useDashboardEntry<T extends {id:string}>(records:T[],openRecord:(record:T)=>void,createRecord?:()=>void){
  const [params,setParams]=useSearchParams()
  const [missingRecord,setMissingRecord]=useState(false)
  const id=params.get('record'),create=params.get('action')==='new'&&!!createRecord
  const request=id!==null?`record:${id}`:create?'action:new':null
  const [handledRequest,setHandledRequest]=useState<string|null>(null)
  // Adjust the source page's own dialog state only when the incoming request
  // changes. This avoids an effect that repeatedly copies URL data into state.
  if(request!==handledRequest){
    setHandledRequest(request)
    if(id!==null){
      const record=records.find(row=>row.id===id)
      setMissingRecord(!record)
      if(record)openRecord(record)
    }else if(create){
      setMissingRecord(false)
      createRecord?.()
    }
  }
  useEffect(()=>{
    if(request===null)return
    // Consume one-time requests without adding a history entry. Closing a form
    // or a detail dialog must not immediately reopen it on the next render.
    const next=new URLSearchParams(params)
    next.delete('record')
    next.delete('action')
    setParams(next,{replace:true})
  },[params,setParams,request])
  return {missingRecord,dismissMissingRecord:()=>setMissingRecord(false)}
}
