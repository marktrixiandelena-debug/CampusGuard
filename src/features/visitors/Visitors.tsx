import { accountName, mayViewVisit } from '../auth/auth-data'
import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { SortHeading, RecordPagination, RecordEmpty } from '../../shared/ui/RecordTableTools'
import { useRecordPage, compareLogbookRecords } from '../../shared/hooks/useRecordPage'
import { useSearchParams } from 'react-router'
import { useSummaryHref } from '../../shared/hooks/useSummaryHref'
import { useEffect, useRef, useState } from 'react'
import VisitorRegistration from './VisitorRegistration'
import { useCampusDate } from '../../shared/hooks/useCampusDate'
import { canCheckOut, campusDateTime, visitorGatePosts, visitorGates, visitorPeriodMatches, visitorSummary, visitorEntryTimestamp, visitorCustodyLabel } from './visitor-data'
import { useDemo } from '../../app/store'
import type { Visit } from '../../data/data'
import { dateLabel } from '../../data/data'
import { Badge, Field, Footer, Heading, Modal, Panel, SearchBox, Select, Stats } from '../../shared/ui/ui'
import { FilterControl, FilterResults, FilterChips, MoreFiltersButton, QuickFilters } from '../../shared/ui/RecordFilters'
import type { ActiveFilter } from '../../shared/ui/RecordFilters'
import { DashboardContext } from '../dashboard/DashboardContext'
import { useDashboardEntry, useLogbookFilters } from '../../shared/hooks/useLogbookFilters'
import { visitorFilterDefaults, visitorPresets } from '../dashboard/dashboard-data'
const tableDefaults={...visitorFilterDefaults,sort:'Newest First',page:'1',pageSize:'10'}
const sortOptions=["Newest First","Oldest First","Visitor A-Z","Visitor Z-A","Gate A-Z","Gate Z-A"]
const sortColumns:Record<string,[string,string]>={"Visitor":["Visitor A-Z","Visitor Z-A"],"Entry":["Newest First","Oldest First"]}
export default function Visitors(){
  const [params,setParams]=useSearchParams()
  const clearFilters=()=>{const next=new URLSearchParams(params);for(const key of ["search","gate","period","status","outcome","vehicle","view","page"])next.delete(key);setParams(next,{replace:true})}
  const summaryHref=useSummaryHref()
  const db=useDemo()
  const visits=db.visits.filter(visit=>mayViewVisit(db.currentUser,visit))
  const gates=db.currentUser?.gates||[]
  const gateOptions=['All',...gates.map(gate=>gate.startsWith('Gate 1')?'Gate 1':'Gate 2')]
  const campusToday=useCampusDate()
  const counts=visitorSummary(visits,campusToday)
  const [stage,setStage]=useState<'register'|'details'|'checkout'|'personnel'|null>(null)
  const [message,setMessage]=useState('')
  const [rosterKind,setRosterKind]=useState<'entry'|'exit'>('entry')
  const previousStage=useRef(stage)
  useEffect(()=>{
    const dialog=document.querySelector<HTMLDialogElement>('dialog.visitor-transaction')
    const viewport=window.visualViewport
    const refresh=()=>{if(dialog&&viewport){dialog.style.setProperty('--visitor-vh',viewport.height+'px');dialog.style.setProperty('--visitor-top',viewport.offsetTop+'px')}}
    refresh();viewport?.addEventListener('resize',refresh);viewport?.addEventListener('scroll',refresh)
    if(previousStage.current==='personnel'&&stage==='details'){document.querySelector<HTMLElement>('[data-personnel-trigger='+rosterKind+']')?.focus()}
    else if(previousStage.current&&stage&&stage!=='register'){const heading=document.querySelector<HTMLElement>('dialog .dialog-heading h2');heading?.setAttribute('tabindex','-1');heading?.focus()}
    previousStage.current=stage
    return ()=>{viewport?.removeEventListener('resize',refresh);viewport?.removeEventListener('scroll',refresh)}
  },[stage,rosterKind])
  const {filters,setFilter}=useLogbookFilters<typeof tableDefaults>(tableDefaults,visitorPresets,{gate:gateOptions,period:['Today','Week','Month','All'],status:['All','Inside','Exited'],outcome:['All','Entered','Denied'],vehicle:['Any vehicle','With vehicle','Without vehicle'],sort:sortOptions,pageSize:['10','25','50']},{resetPageOnChange:['search','gate','period','status','outcome','vehicle','sort','pageSize']})
  const {search,gate,period,status,outcome,vehicle,sort}=filters
  const setSearch=(value:string)=>setFilter('search',value),setGate=(value:string)=>setFilter('gate',value),setPeriod=(value:string)=>setFilter('period',value),setStatus=(value:string)=>setFilter('status',value),setOutcome=(value:string)=>setFilter('outcome',value),setVehicle=(value:string)=>setFilter('vehicle',value)
  const [selectedId,setSelectedId]=useState('')
  const selected=visits.find(v=>v.id===selectedId)
  const setSelected=(visit:Visit|null)=>{setSelectedId(visit?.id||'');setStage(visit?'details':null)}
  const entry=useDashboardEntry(visits,record=>setSelected(record),()=>setStage('register'))
  const rows=visits.filter(v=>(gate==='All'||v.gate.startsWith(gate))&&visitorPeriodMatches(v.date,period,campusToday)&&(status==='All'||v.status===status)&&(outcome==='All'||v.outcome===outcome)&&(vehicle==='Any vehicle'||(vehicle==='With vehicle'?v.vehicle!=='No':v.vehicle==='No'))&&`${v.name} ${v.id} ${v.identification} ${v.purpose} ${v.vehicle} ${v.pass} ${v.gate} ${v.exitGate||''}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>compareLogbookRecords(a,b,sort,r=>sort.startsWith('Visitor')?r.name:sort.startsWith('Gate')?r.gate:visitorEntryTimestamp(r)))
  const [moreFilters,setMoreFilters]=useState(false)
  const pagination=useRecordPage(rows,filters.page,filters.pageSize,setFilter)
  const activeFilters:ActiveFilter[]=[
    ...(search.trim()?[{key:'search',label:`Search: ${search.trim()}`,remove:()=>setSearch('')}]:[]),
    ...(gate!=='All'?[{key:'gate',label:`Gate: ${gate}`,remove:()=>setGate('All')}]:[]),
    ...(period!=='Today'?[{key:'period',label:`Time period: ${period}`,remove:()=>setPeriod('Today')}]:[]),
    ...(status!=='All'?[{key:'status',label:`Status: ${status}`,remove:()=>setStatus('All')}]:[]),
    ...(outcome!=='All'?[{key:'outcome',label:`Outcome: ${outcome}`,remove:()=>setOutcome('All')}]:[]),
    ...(vehicle!=='Any vehicle'?[{key:'vehicle',label:vehicle,remove:()=>setVehicle('Any vehicle')}]:[]),
  ]
  const emptyVisitorState=!activeFilters.length&&period==='Today'&&visits.length?<div className="empty record-empty"><strong>No visitor records for today.</strong><p>New check-ins appear here. Choose all dates to review the sample history.</p><button className="outline" onClick={()=>setPeriod('All')}>Show all dates</button></div>:<RecordEmpty total={visits.length} active={activeFilters.length>0} noun="visitor records" clear={clearFilters}/>
  const checkout=(visit:Visit)=>{setSelectedId(visit.id);setStage('checkout')}
  const guardName=(id?:string)=>db.people.find(p=>p.id===id)?.name||'Not Recorded'
  const actorName=(accountId?:string,personId?:string)=>accountId?accountName(db.accounts.find(a=>a.id===accountId),db.people):guardName(personId)
  const transactionTime=(at?:string)=>{if(!at)return 'Not Recorded';const value=campusDateTime(new Date(at));return dateLabel(value.date)+' '+value.seconds+' (Asia/Manila)'}
  const entryInfo=(visit:Visit)=><><span className="visitor-date-line"><span>{dateLabel(visit.date)}</span><span className="visitor-clock">{visit.entryAt?campusDateTime(new Date(visit.entryAt)).seconds:visit.time}</span></span><small className="muted block">{visit.gate}</small></>
  const exitInfo=(visit:Visit)=>{
    if(visit.outcome==='Denied')return <span className="muted">Not applicable</span>
    if(visit.status==='Inside')return <span className="muted">Not checked out</span>
    if(!visit.exitAt&&!visit.exitGate)return <span className="muted">Not Recorded</span>
    const when=visit.exitAt?campusDateTime(new Date(visit.exitAt)):undefined
    return <>{when?<time className="visitor-date-line" dateTime={visit.exitAt}><span>{dateLabel(when.date)}</span><span className="visitor-clock">{when.seconds}</span></time>:<span className="muted">Not Recorded</span>}<small className="muted block">{visit.exitGate||'Not Recorded'}</small></>
  }
  const visitStatus=(visit:Visit)=><><Badge value={visit.outcome==='Denied'?'Denied':visit.status}/><small className="visitor-outcome">{visit.outcome==='Denied'?'Visit: Not applicable':`Entry: ${visit.outcome}`}</small></>
  const snapshot=selected&&(rosterKind==='entry'?selected.entryAssignment:selected.exitAssignment)
  const responsibleId=selected&&(rosterKind==='entry'?selected.entryGuardId:selected.exitGuardId)
  const actions=(visit:Visit,mobile=false)=><><button className={mobile?'outline':'text-button'} onClick={()=>setSelected(visit)} aria-label={`View details for ${visit.name}`}>{mobile?'View details':'View'}</button>{canCheckOut(visit)&&<button className={mobile?'outline':'text-button'} onClick={()=>checkout(visit)} aria-label={`Check out ${visit.name}`}>Check Out</button>}</>
  return <><DashboardContext {...entry}/><Heading title="Gate & Visitor Management" subtitle="Register visitors and manage campus entry and exit records." action={<div className="page-heading-actions visitor-heading-actions"><button className="primary" onClick={()=>{setMessage('');setStage('register')}}>+ Register Visitor</button><span className="page-heading-caption">{db.currentUser?.role==='Security Head'?'Access: All gates':'Authorized gates: '+gates.join(', ')}</span></div>}/>{message&&<p className="visitor-success" role="status">{message}</p>}<Stats title="Visitor overview" metadata={<>{dateLabel(campusToday)} &middot; Asia/Manila</>} context="Inside includes recorded visits from all dates." rows={[
{label:'Currently Inside',value:counts.inside,note:'Recorded entry/exit status; exits may be missing',href:summaryHref('/visitors',{period:'All',status:'Inside'})},
{label:'Entries Today',value:counts.entries,note:'Admitted visits on the campus date',href:summaryHref('/visitors',{period:'Today',outcome:'Entered'})},
{label:'Vehicle Entries Today',value:counts.vehicles,note:'Admitted visits with vehicles',href:summaryHref('/visitors',{period:'Today',outcome:'Entered',vehicle:'With vehicle'})},
{label:'Denied Today',value:counts.denied,note:'Entry denied on the campus date',emphasis:'attention',href:summaryHref('/visitors',{period:'Today',outcome:'Denied'})}]}/><Panel title="Access History" className="record-filters record-results-panel" action={<FilterResults count={rows.length} total={visits.length} unit="records" active={activeFilters.length>0} clear={clearFilters}/>}>
    <div className="record-toolbar">
      <QuickFilters label="Visitor status" options={['All','Inside','Exited']} value={status} change={setStatus}/>
      <div className="record-toolbar-search"><SearchBox value={search} change={setSearch} placeholder="Search visitors..."/></div>
      <FilterControl label="Time period"><Select label="Time period" options={['Today','Week','Month','All']} value={period} change={setPeriod}/></FilterControl>
      <FilterControl label="Sort"><Select label="Sort visitors" value={sort} change={value=>setFilter('sort',value)} options={sortOptions}/></FilterControl>
      <MoreFiltersButton expanded={moreFilters} toggle={()=>setMoreFilters(v=>!v)} active={Number(gate!=='All')+Number(outcome!=='All')+Number(vehicle!=='Any vehicle')} controls="visitor-extra-filters"/>
    </div>
    <div className="filter-row record-filter-row record-extra-filters" id="visitor-extra-filters" hidden={!moreFilters}>
      <FilterControl label="Gate"><Select label="Gate" options={gateOptions} value={gate} change={setGate}/></FilterControl>
      <FilterControl label="Outcome"><Select label="Access outcome" options={['All','Entered','Denied']} value={outcome} change={setOutcome}/></FilterControl>
      <FilterControl label="Vehicle"><Select label="Vehicle" options={['Any vehicle','With vehicle','Without vehicle']} value={vehicle} change={setVehicle}/></FilterControl>
    </div>
    <FilterChips filters={activeFilters}/>
    <ResponsiveRecords label="Visitor records" records={pagination.rows.map(v=>({id:v.id,title:v.name,badges:visitStatus(v),metadata:[{label:'Visit ID',value:v.id},{label:'Purpose',value:v.purpose},{label:'Entry',value:entryInfo(v)},...(v.status==='Exited'?[{label:'Exit',value:exitInfo(v)}]:[]),{label:'ID Custody',value:visitorCustodyLabel(v)}],actions:actions(v,true)}))} empty={emptyVisitorState}>
      <div className="table-scroll"><table className="record-table-compact record-table-headers visitor-logbook-table"><colgroup>{[17,8,13,16,16,11,10,9].map((width,index)=><col key={index} style={{width:width+'%'}}/>)}</colgroup><thead><tr>{['Visitor','ID Type','Purpose','Entry','Exit','Status','ID Custody','Actions'].map(h=><SortHeading key={h} label={h} pair={sortColumns[h]} value={sort} change={value=>setFilter('sort',value)}/>)}</tr></thead><tbody>{rows.length?pagination.rows.map(v=><tr key={v.id} data-record-id={v.id}>
        <td><button className="text-button name-button" onClick={()=>setSelected(v)}>{v.name}</button><small className="muted block visitor-reference">{v.id}</small></td>
        <td>{v.identification}</td><td>{v.purpose}</td><td>{entryInfo(v)}</td><td>{exitInfo(v)}</td>
        <td><div className="visitor-status">{visitStatus(v)}</div></td><td><span className={'visitor-custody'+(visitorCustodyLabel(v)==='Return Pending'?' visitor-custody-pending':visitorCustodyLabel(v)==='Not Recorded'?' muted':'')}>{visitorCustodyLabel(v)}</span></td>
        <td><div className="visitor-record-actions">{actions(v)}</div></td>
      </tr>):<tr><td colSpan={8}>{emptyVisitorState}</td></tr>}</tbody></table></div>
    </ResponsiveRecords><RecordPagination {...pagination} total={rows.length} change={setFilter}/></Panel>{stage==='register'&&<VisitorRegistration initialGate={gates.length===1?gates[0]:gate==='Gate 1'?visitorGates[0]:gate==='Gate 2'?visitorGates[1]:''} close={()=>setStage(null)} complete={text=>{setMessage(text);setStage(null)}}/>}{selected&&stage&&stage!=='register'&&<Modal title={stage==='checkout'?'Visitor Check-Out':stage==='personnel'?'Assigned Personnel':'Access Details'} subtitle="Visitor Information and Access History" className={stage==='details'?'visitor-details':'visitor-transaction'} close={()=>setSelected(null)}>{dismiss=><>
  {stage==='details'&&<>
    <div className="detail-heading"><div><h3>{selected.name}</h3><p className="muted">Identification Presented: {selected.identification}</p></div><Badge value={selected.status}/></div>
    <h3>Visit Information</h3><dl className="details-grid">{[['Record ID',selected.id],['Profile ID',selected.profileId||'Not Recorded'],['Date',dateLabel(selected.date)],['Time',selected.time],['Gate',selected.gate],['Vehicle',selected.vehicle],['Purpose',selected.purpose],['Sticker / Pass',selected.pass]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <h3>ID Custody</h3><dl className="details-grid"><div><dt>ID Deposited</dt><dd>{selected.idDeposited===undefined?'Not Recorded':selected.idDeposited?'Yes':'No'}</dd></div><div><dt>ID Return</dt><dd>{visitorCustodyLabel(selected)}</dd></div></dl>
    <h3>Security Post &amp; Personnel</h3>
    <div className="callout"><strong>Entry</strong><p>Gate: {selected.gate}</p><p>Entry confirmation: {selected.entryAt?<time dateTime={selected.entryAt}>{transactionTime(selected.entryAt)}</time>:transactionTime()}</p><p>Responsible personnel: {actorName(selected.entryActorId,selected.entryGuardId)}</p><p>Security post: {selected.entryAssignment?.post||visitorGatePosts[selected.gate]||'Security post mapping unavailable'}</p><p>Scheduled shift: {selected.entryAssignment?selected.entryAssignment.start+' to '+selected.entryAssignment.end:'Historical assignment unavailable'}</p><button type="button" className="outline" data-personnel-trigger="entry" onClick={()=>{setRosterKind('entry');setStage('personnel')}}>View Assigned Personnel</button></div>
    {selected.status==='Exited'&&<div className="callout"><strong>Exit</strong><p>Exit confirmation: {selected.exitAt?<time data-checkout-time dateTime={selected.exitAt}>{transactionTime(selected.exitAt)}</time>:transactionTime()}</p><p>Exit gate: {selected.exitGate||'Not Recorded'}</p><p>Responsible checkout personnel: {actorName(selected.exitActorId,selected.exitGuardId)}</p><button type="button" className="outline" data-personnel-trigger="exit" onClick={()=>{setRosterKind('exit');setStage('personnel')}}>View Assigned Personnel</button></div>}
    <h3>Activity History</h3><div className="callout"><strong>{selected.outcome==='Denied'?'Entry Denied':'Entry Recorded'}</strong><p>{dateLabel(selected.date)} &middot; {selected.time} &middot; {selected.gate}</p><p>Purpose: {selected.purpose} &middot; Outcome: {selected.outcome}</p>{selected.exitAt&&<p>Exit recorded: {transactionTime(selected.exitAt)}</p>}</div>
    <Footer close={dismiss}>{canCheckOut(selected)&&<button className="primary" onClick={()=>checkout(selected)}>Check Out</button>}</Footer>
  </>}
  {stage==='checkout'&&<VisitorCheckout visit={selected} close={dismiss} complete={text=>{setMessage(text);setSelected(null)}}/>}
  {stage==='personnel'&&<div className="visitor-dialog-content"><div className="visitor-form-body">
    <h3>{rosterKind==='entry'?'Entry':'Exit'} &mdash; {rosterKind==='entry'?selected.gate:selected.exitGate||'Gate Not Recorded'}</h3>
    <dl className="details-grid"><div><dt>Security post</dt><dd>{snapshot?.post||'Security post mapping unavailable'}</dd></div><div><dt>Assignment date</dt><dd>{snapshot?dateLabel(snapshot.date):'Historical assignment unavailable'}</dd></div><div><dt>Scheduled shift</dt><dd>{snapshot?snapshot.start+' to '+snapshot.end:'Not Recorded'}</dd></div><div><dt>Responsible transaction guard</dt><dd>{actorName(rosterKind==='entry'?selected.entryActorId:selected.exitActorId,responsibleId)}</dd></div></dl>
    {snapshot?<><p>Total scheduled guards: {snapshot.personIds.length}</p><ul className="visitor-personnel-list">{snapshot.personIds.map(id=><li key={id}><strong>{guardName(id)}</strong><span>{id===responsibleId?(rosterKind==='entry'?'Recorded visitor entry':'Recorded visitor checkout'):'Scheduled'}</span></li>)}</ul>{responsibleId&&!snapshot.personIds.includes(responsibleId)&&<p>The responsible guard is not listed in the captured assignment.</p>}</>:<p className="callout" role="status">Historical assignment information is unavailable. No roster has been inferred from current schedules.</p>}
    <p className="muted">Scheduled assignments do not establish physical presence or verified attendance.</p>
  </div><footer><button type="button" className="outline" onClick={()=>setStage('details')}>Back to Access Details</button></footer></div>}
  </>}</Modal>}</>
}

function VisitorCheckout({visit,close,complete}:{visit:Visit;close:()=>void;complete:(message:string)=>void}){
  const db=useDemo()
  const gates=db.currentUser?.gates||[]
  const [gate,setGate]=useState(()=>gates.length===1?gates[0]:''),[departed,setDeparted]=useState(false),[idReturned,setIdReturned]=useState(false),[pending,setPending]=useState('')
  const form=useRef<HTMLFormElement>(null),submitting=useRef(false),handled=useRef('')
  const result=db.visitorResult,errors=pending&&result?.requestId===pending?result.errors:{}
  const busy=!!pending&&result?.requestId!==pending
  useEffect(()=>{
    if(!pending||result?.requestId!==pending||handled.current===pending)return
    handled.current=pending;submitting.current=false
    if(result.ok){complete(result.message!);return}
    requestAnimationFrame(()=>form.current?.querySelector<HTMLElement>('[aria-invalid=true],.visitor-form-error')?.focus())
  },[pending,result,complete])
  return <form ref={form} noValidate onSubmit={event=>{event.preventDefault();if(submitting.current)return;submitting.current=true;setPending(db.checkOutVisitor({visitId:visit.id,gate,departed,idReturned}))}}><div className="visitor-form-body">
    <h3>{visit.name}</h3><dl className="details-grid">{[['Visit ID',visit.id],['Entry date and time',dateLabel(visit.date)+' '+visit.time],['Entry gate',visit.gate],['ID Deposited',visit.idDeposited===undefined?'Not Recorded':visit.idDeposited?'Yes':'No']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {!canCheckOut(visit)&&<p className="error-text" role="alert">This visitor is no longer Inside. Close this dialog and review the record.</p>}
    <div className="form-grid"><Field label="Exit Gate *"><select name="exitGate" required value={gate} onChange={e=>{setGate(e.target.value);setPending('')}} aria-invalid={!!errors.gate} aria-describedby={errors.gate?'checkout-gate-error':undefined}><option value="">Select exit gate</option>{gates.map(g=><option key={g}>{g}</option>)}</select>{errors.gate&&<small className="error-text" id="checkout-gate-error">{errors.gate}</small>}</Field>
</div>
    <div className="visitor-account-identity"><strong>Responsible Personnel: {db.currentUser?.name}</strong><Badge value={db.currentUser?.role||'Not signed in'}/><span className="muted">Exit time and this demo account are recorded on confirmation.</span></div>
    <div className="checks"><label><input type="checkbox" name="departed" required checked={departed} onChange={e=>{setDeparted(e.target.checked);setPending('')}} aria-invalid={!!errors.departed} aria-describedby={errors.departed?'checkout-departed-error':undefined}/>I confirm that the visitor has departed. *</label>{errors.departed&&<small id="checkout-departed-error" className="error-text">{errors.departed}</small>}
    {visit.idDeposited===true&&<label><input type="checkbox" name="idReturned" checked={idReturned} onChange={e=>setIdReturned(e.target.checked)}/>ID Returned &mdash; the deposited ID has been handed back.</label>}</div>
    {visit.idDeposited===true&&!idReturned&&<p className="callout amber">Checkout can proceed. ID custody will remain unresolved until an ID return is recorded.</p>}
    {visit.idDeposited===undefined&&<p className="callout">ID deposit information was not recorded for this legacy visit. Checkout will preserve the unknown custody status.</p>}
    {errors.form&&<p className="error-text visitor-form-error" role="alert" tabIndex={-1}>{errors.form}</p>}
    </div><Footer close={close}><button type="submit" className="primary" disabled={busy||!canCheckOut(visit)}>{busy?'Recording...':'Confirm Check-Out'}</button></Footer></form>
}
