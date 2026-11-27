import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { SortHeading, RecordPagination, RecordEmpty } from '../../shared/ui/RecordTableTools'
import { useRecordPage, compareLogbookRecords } from '../../shared/hooks/useRecordPage'
import { useSearchParams } from 'react-router'
import { useSummaryHref } from '../../shared/hooks/useSummaryHref'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useDemo } from '../../app/store'
import type { Incident } from '../../data/data'
import { dateLabel } from '../../data/data'
import { campusDateTime } from '../visitors/visitor-data'
import { FilterControl, FilterResults, FilterChips, MoreFiltersButton, QuickFilters } from '../../shared/ui/RecordFilters'
import type { ActiveFilter } from '../../shared/ui/RecordFilters'
import { Badge, Field, Footer, Heading, Modal, Panel, SearchBox, Select, Stats } from '../../shared/ui/ui'
import { DashboardContext } from '../dashboard/DashboardContext'
import { useDashboardEntry, useLogbookFilters } from '../../shared/hooks/useLogbookFilters'
import { incidentFilterDefaults, incidentPresets, matchesIncidentStatus } from '../dashboard/dashboard-data'
const types=['Disturbance','Protection-Related','Suspected Theft','Unauthorized Access','Parking-Related','Bullying']
const tableDefaults={...incidentFilterDefaults,sort:'Newest First',page:'1',pageSize:'10'}
const sortOptions=["Newest First","Oldest First","Incident ID A-Z","Incident ID Z-A","Type A-Z","Type Z-A","Location A-Z","Location Z-A"]
const sortColumns:Record<string,[string,string]>={"Incident ID":["Incident ID A-Z","Incident ID Z-A"],"Type":["Type A-Z","Type Z-A"],"Date / Time":["Newest First","Oldest First"],"Location":["Location A-Z","Location Z-A"]}
function formSnapshot(form:HTMLFormElement){return JSON.stringify(Array.from(new FormData(form)))}

export default function Incidents(){
  const [params,setParams]=useSearchParams()
  const clearFilters=()=>{const next=new URLSearchParams(params);for(const key of ["search","status","type","report","view","page"])next.delete(key);setParams(next,{replace:true})}
  const summaryHref=useSummaryHref()
  const {incidents,setIncidents,people}=useDemo()
  const {filters,setFilter}=useLogbookFilters<typeof tableDefaults>(tableDefaults,incidentPresets,{status:['All','Unresolved','Open','Being Monitored','Resolved'],type:['All Types',...types],report:['All Report Statuses','Draft','Submitted','Under Review','Forwarded'],sort:sortOptions,pageSize:['10','25','50']},{resetPageOnChange:['search','status','type','report','sort','pageSize']})
  const {search,status,type,report,sort}=filters
  const setSearch=(value:string)=>setFilter('search',value),setStatus=(value:string)=>setFilter('status',value),setType=(value:string)=>setFilter('type',value),setReport=(value:string)=>setFilter('report',value),setSort=(value:string)=>setFilter('sort',value)
  const [mode,setMode]=useState<'record'|'view'|'update'|null>(null),[selected,setSelected]=useState<Incident>(),[error,setError]=useState('')
  const [newOccurrence,setNewOccurrence]=useState('')
  const formRef=useRef<HTMLFormElement|null>(null)
  const initialDraft=useRef('')
  const submitted=useRef(false)
  const lastFormFocus=useRef<HTMLElement|null>(null)
  const keepEditingButton=useRef<HTMLButtonElement>(null)
  const discardConfirmed=useRef(false)
  const [pendingDismiss,setPendingDismiss]=useState<{dismiss:()=>void;dialog:HTMLDialogElement;focus:HTMLElement|null;scrollTop:number}|null>(null)
  const attachForm=useCallback((form:HTMLFormElement|null)=>{
    formRef.current=form
    if(form){
      initialDraft.current=formSnapshot(form)
      submitted.current=false
      lastFormFocus.current=null
    }
  },[])
  const openRecord=()=>{
    const {date,time}=campusDateTime()
    setNewOccurrence(date+'T'+time)
    setSelected(undefined)
    setError('')
    setMode('record')
  }
  const entry=useDashboardEntry(incidents,record=>{setSelected(record);setMode('view');setError('')},openRecord)
  const close=()=>{setMode(null);setError('')}
  function requestDismiss(dismiss:()=>void){
    const form=formRef.current,dialog=form?.closest('dialog')
    if(pendingDismiss||submitted.current)return
    if(!form||!dialog||formSnapshot(form)===initialDraft.current){dismiss();return}
    const active=document.activeElement
    const focus=active instanceof HTMLElement&&dialog.contains(active)?active:lastFormFocus.current
    discardConfirmed.current=false
    setPendingDismiss({dismiss,dialog,focus,scrollTop:dialog.scrollTop})
  }
  useLayoutEffect(()=>{if(pendingDismiss)keepEditingButton.current?.focus()},[pendingDismiss])
  function closeConfirmation(){
    if(!pendingDismiss)return
    const {dismiss,dialog,focus,scrollTop}=pendingDismiss
    setPendingDismiss(null)
    if(discardConfirmed.current){dismiss();return}
    requestAnimationFrame(()=>{
      if(!dialog.open||!dialog.isConnected)return
      focus?.focus({preventScroll:true})
      dialog.scrollTop=scrollTop
    })
  }
  const rows=incidents.filter(i=>matchesIncidentStatus(i,status)&&(type==='All Types'||i.type===type)&&(report==='All Report Statuses'||i.reportStatus===report)&&`${i.id} ${i.type} ${i.location} ${i.people} ${i.description}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>compareLogbookRecords(a,b,sort,r=>sort.startsWith('Incident ID')?r.id:sort.startsWith('Type')?r.type:sort.startsWith('Location')?r.location:r.date+'T'+r.time))
  const readonly=mode==='view'
  const [moreFilters,setMoreFilters]=useState(false)
  const pagination=useRecordPage(rows,filters.page,filters.pageSize,setFilter)
  const activeFilters:ActiveFilter[]=[
    ...(search.trim()?[{key:'search',label:`Search: ${search.trim()}`,remove:()=>setSearch('')}]:[]),
    ...(status!=='All'?[{key:'status',label:`Situation: ${status}`,remove:()=>setStatus('All')}]:[]),
    ...(type!=='All Types'?[{key:'type',label:`Type: ${type}`,remove:()=>setType('All Types')}]:[]),
    ...(report!=='All Report Statuses'?[{key:'report',label:`Report status: ${report}`,remove:()=>setReport('All Report Statuses')}]:[]),
  ]
  function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(submitted.current||pendingDismiss||mode==='view')return
    const fields=new FormData(e.currentTarget)
    const value=(name:string)=>String(fields.get(name)||'').trim()
    if(!value('location')||!value('description')){setError('Complete the location and description.');return}
    const [date,time]=value('datetime').split('T')
    const record:Incident={
      ...selected,
      id:selected?.id||`INC-2026-${String(Math.max(0,...incidents.map(i=>Number(i.id.split('-')[2])))+1).padStart(3,'0')}`,
      type:value('type'),date,time,location:value('location'),personnel:value('personnel'),reporter:value('reporter'),
      status:value('status'),reportStatus:selected?.reportStatus||'Draft',people:value('people'),description:value('description'),
      observations:value('observations'),actions:value('actions'),evidence:value('evidence'),
    }
    submitted.current=true
    setIncidents(old=>mode==='update'?old.map(i=>i.id===record.id?record:i):[record,...old])
    close()
  }
  return <><DashboardContext {...entry}/><Heading title="Incidents" subtitle="Record incidents, review reports, and follow up on open cases." action={<button className="primary" onClick={openRecord}>＋ Record Incident</button>}/><Stats title="Incident overview" metadata="All recorded dates" context="Situation status and report status are tracked separately." rows={[
{label:'Open Incidents',value:incidents.filter(i=>i.status==='Open').length,note:'Require follow-up',emphasis:'urgent',href:summaryHref('/incidents',{status:'Open'})},
{label:'Being Monitored',value:incidents.filter(i=>i.status==='Being Monitored').length,note:'Ongoing situations to review',emphasis:'attention',href:summaryHref('/incidents',{status:'Being Monitored'})},
{label:'Resolved Incidents',value:incidents.filter(i=>i.status==='Resolved').length,note:'Currently marked resolved',href:summaryHref('/incidents',{status:'Resolved'})},
{label:'Total Incidents',value:incidents.length,note:'Unique incident records',href:summaryHref('/incidents')}]}/><Panel title="Incident Cases" className="record-filters record-results-panel" action={<FilterResults count={rows.length} total={incidents.length} unit="cases" active={activeFilters.length>0} clear={clearFilters}/>} >
    <div className="record-toolbar">
      <QuickFilters label="Incident situation" options={['All','Unresolved','Open','Being Monitored','Resolved']} value={status} change={setStatus}/>
      <div className="record-toolbar-search"><SearchBox value={search} change={setSearch} placeholder="Search incidents..."/></div>
      <FilterControl label="Sort"><Select label="Incident sort order" value={sort} change={setSort} options={sortOptions}/></FilterControl>
      <MoreFiltersButton expanded={moreFilters} toggle={()=>setMoreFilters(v=>!v)} active={Number(type!=='All Types')+Number(report!=='All Report Statuses')} controls="incident-extra-filters"/>
    </div>
    <div className="filter-row record-filter-row record-extra-filters" id="incident-extra-filters" hidden={!moreFilters}>
      <FilterControl label="Incident type"><Select label="Incident type" value={type} change={setType} options={['All Types',...types]}/></FilterControl>
      <FilterControl label="Report status"><Select label="Report status" value={report} change={setReport} options={['All Report Statuses','Draft','Submitted','Under Review','Forwarded']}/></FilterControl>
    </div>
    <FilterChips filters={activeFilters}/>
    <ResponsiveRecords label="Incident records" records={pagination.rows.map(i=>({id:i.id,title:i.type,badges:<><span>Situation: <Badge value={i.status}/></span><span>Report: <Badge value={i.reportStatus}/></span></>,metadata:[{label:'Incident ID',value:i.id},{label:'Date',value:dateLabel(i.date)+' '+i.time},{label:'Location',value:i.location}],actions:<><button className="outline" onClick={()=>{setSelected(i);setMode('view')}} aria-label={`View details for ${i.id}`}>View details</button><button className="outline" onClick={()=>{setSelected(i);setMode('update')}} aria-label={`Update incident ${i.id}`}>Update Incident</button></>}))} empty={<RecordEmpty total={incidents.length} active={activeFilters.length>0} noun="incidents" clear={clearFilters}/>}><div className="table-scroll"><table className="record-table-compact record-table-headers"><thead><tr>{['Incident ID','Type','Date / Time','Location','Responding Personnel','Reported By','Situation','Report Status','Actions'].map(h=><SortHeading key={h} label={h} pair={sortColumns[h]} value={sort} change={value=>setFilter('sort',value)}/>)}</tr></thead><tbody>{rows.length?pagination.rows.map(i=><tr key={i.id} data-record-id={i.id}><td>{i.id}</td><td>{i.type}</td><td>{dateLabel(i.date)} – {i.time}</td><td>{i.location}</td><td>{people.find(p=>p.id===i.personnel)?.name||i.personnel||'Unassigned'}</td><td>{i.reporter}</td><td><Badge value={i.status}/></td><td><Badge value={i.reportStatus}/></td><td><select aria-label={`Actions for ${i.id}`} value="Actions" onChange={e=>{setSelected(i);setMode(e.target.value==='View Incident'?'view':'update')}}><option disabled>Actions</option><option>View Incident</option><option>Update Incident</option></select></td></tr>):<tr><td colSpan={9}><RecordEmpty total={incidents.length} active={activeFilters.length>0} noun="incidents" clear={clearFilters}/></td></tr>}</tbody></table></div></ResponsiveRecords><RecordPagination {...pagination} total={rows.length} change={setFilter}/></Panel>
  {mode&&<Modal
    key={`${mode}-${selected?.id}`}
    title={mode==='record'?'Record Incident':mode==='view'?'View Incident':'Update Incident'}
    close={close}
    onDismissRequest={readonly?undefined:requestDismiss}
  >{dismiss=><>
    {readonly&&selected&&<dl className="details-grid"><div><dt>Incident ID</dt><dd>{selected.id}</dd></div><div><dt>Report Status</dt><dd><Badge value={selected.reportStatus}/></dd></div></dl>}
    <form ref={attachForm} onFocus={event=>{lastFormFocus.current=event.target}} onSubmit={save}>
      <fieldset disabled={readonly} style={{border:0,padding:0,margin:0}}>
        <div className="form-grid">
          <Field label="Incident Type *"><select name="type" defaultValue={selected?.type??''} required>
            <option value="" disabled>Select an incident type</option>
            {types.map(type=><option key={type}>{type}</option>)}
          </select></Field>
          <Field label="Initial Situation Status"><select name="status" defaultValue={selected?.status||'Open'}>{['Open','Being Monitored','Resolved'].map(status=><option key={status}>{status}</option>)}</select></Field>
        </div>
        <Field label="Occurrence Date / Time (Asia/Manila) *"><input name="datetime" type="datetime-local" defaultValue={selected?`${selected.date}T${selected.time}`:newOccurrence} required/></Field>
        <Field label="Location *"><input name="location" defaultValue={selected?.location} required placeholder="e.g., College of Law – 2nd Floor Hallway"/></Field>
        <Field label="People Involved"><input name="people" defaultValue={selected?.people} placeholder="e.g., Student A (reporter), Student B (involved)"/></Field>
        <div className="form-grid">
          <Field label="Responding Security Personnel"><select name="personnel" defaultValue={selected?.personnel??''}>
            <option value="">Unassigned</option>
            {people.filter(person=>person.status==='Active'||person.id===selected?.personnel).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
          </select></Field>
          <Field label="Reported By"><input name="reporter" defaultValue={selected?.reporter}/></Field>
        </div>
        <Field label="What Happened *"><textarea name="description" required defaultValue={selected?.description} placeholder="Describe what happened in detail..."/></Field>
        <div className="form-grid">
          <Field label="Initial Observations"><textarea name="observations" defaultValue={selected?.observations} placeholder="Observations at the scene..."/></Field>
          <Field label="Initial Actions Taken"><textarea name="actions" defaultValue={selected?.actions} placeholder="Immediate actions taken..."/></Field>
        </div>
        <Field label="Evidence (if applicable)"><input name="evidence" defaultValue={selected?.evidence} placeholder="CCTV footage, written statements, photographs..."/></Field>
      </fieldset>
      {error&&<p className="error-text" role="alert">{error}</p>}
      <Footer close={dismiss}>{!readonly&&<button className="danger" type="submit">{mode==='record'?'Record Incident':'Save'}</button>}</Footer>
    </form>
  </>}</Modal>}
  {pendingDismiss&&<Modal title="Discard incident changes?" subtitle="Your unsaved changes will be lost." close={closeConfirmation}>{dismiss=>
    <footer>
      <button ref={keepEditingButton} className="outline" type="button" onClick={dismiss}>Keep editing</button>
      <button className="danger" type="button" onClick={()=>{discardConfirmed.current=true;dismiss()}}>Discard changes</button>
    </footer>
  }</Modal>}
  </>
}
