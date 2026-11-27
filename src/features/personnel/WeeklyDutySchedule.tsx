import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, FileText, ListFilter, Moon, PanelRight, Plus, Search, Sun, Undo2, X } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useDemo } from '../../app/store'
import type { Person } from '../../data/data'
import { Badge, Field, Footer, Heading, Modal, Panel, Segments, Select } from '../../shared/ui/ui'
import { campusDateTime } from '../visitors/visitor-data'
import { formatReportDate } from '../reporting/reporting'
import { formatDutyTour, upcomingDutyPeriod, weeklyDuties } from './weekly-duty-template'
import { overlappingDrafts, validWeeklyPeriod } from './weekly-draft'
import type { DutySelection, WeeklyDraft, WeeklyDraftDuty, WeeklyPeriod } from './weekly-draft'
import { dutyResponsibility, weeklyDutyGroups } from './weekly-duty-groups'
import './weekly-duty-schedule.css'

export const weeklySchedulePath='/personnel/duty-schedule'
export const newWeeklySchedulePath=weeklySchedulePath+'/new'
export const weeklyDraftPath=weeklySchedulePath+'/draft/'

export function WeeklyDutyRecords(){
  const {weeklyDrafts}=useDemo()
  const {state}=useLocation()
  const records=[...weeklyDrafts].sort((a,b)=>b.start.localeCompare(a.start)||b.updatedAt.localeCompare(a.updatedAt))
  return <section className="weekly-duty">
    <Heading title="Duty Schedule" subtitle="Prepare weekly duty assignments." action={
      <div className="weekly-page-actions">
        <Link className="primary" to={newWeeklySchedulePath}><Plus size={16} aria-hidden="true"/>Create Schedule</Link>
      </div>
    }/>
    {state?.savedDraft&&<p role="status" className="callout green">Weekly schedule draft saved.</p>}
    {state?.missingDraft&&<p role="status" className="callout amber">This draft is unavailable. Saved drafts reset when you refresh.</p>}
    <Panel title="Weekly Schedule Records" className="weekly-records" action={<small className="muted">{records.length} {records.length===1?'record':'records'}</small>}>
      <table className="weekly-record-table">
        <thead><tr>{['Coverage period','Assigned duties','Status','Last updated','Actions'].map(label=><th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{records.length?records.map(draft=>{
          const period=`${formatReportDate(draft.start)} – ${formatReportDate(draft.end)}`
          return <tr key={draft.id} className="weekly-record-row">
            <th scope="row">{period}</th>
            <td>{draft.duties.filter(duty=>duty.personnel).length} / {draft.duties.length}<span className="weekly-record-mobile"> assigned</span></td>
            <td><Badge value="Draft"/></td>
            <td><span className="weekly-record-mobile">Updated </span>{formatReportDate(campusDateTime(new Date(draft.updatedAt)).date)}</td>
            <td><Link className="text-button" to={weeklyDraftPath+draft.id} aria-label={`Open draft for ${period}`}>Open Draft</Link></td>
          </tr>
        }):<tr><td colSpan={5} className="empty">
          <strong>No weekly schedules yet</strong>
          <p>Choose Create Schedule to start preparing a roster.</p>
        </td></tr>}</tbody>
      </table>
    </Panel>
  </section>
}


function WeeklySchedulePreview({period,duties,selections,close}:{period:WeeklyPeriod;duties:readonly WeeklyDraftDuty[];selections:Record<number,DutySelection>;close:()=>void}){
  const coverage=validWeeklyPeriod(period)
    ?`${formatReportDate(period.start)} – ${formatReportDate(period.end)}`
    :!period.start||!period.end?'Coverage dates are incomplete.':'Coverage dates are invalid.'
  return <Modal title="Preview Schedule" className="weekly-preview" wide close={close}>{dismiss=><>
    <article className="weekly-preview-sheet" aria-label="Weekly Duty Details">
      <header className="weekly-preview-heading">
        <div><p>University of Nueva Caceres · Security Office</p><h3>Weekly Duty Details</h3></div>
        <div><span>UNC-FM-SO-09</span><Badge value="DRAFT"/></div>
      </header>
      <p className="weekly-preview-coverage"><strong>Coverage period</strong> {coverage}</p>
      {(['Day','Night'] as const).map(shift=><section key={shift} aria-label={shift+' Shift'}>
        <h4>{shift} Shift</h4>
        <table className="weekly-preview-table" aria-label={shift+' Shift duties'}>
          <thead><tr>{['No.','Post description','Tour of duty','Personnel'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{duties.filter(duty=>duty.shift===shift).map(duty=><tr key={duty.number} data-preview-duty={duty.number}>
            <td>{duty.number}</td>
            <th scope="row">{duty.description}</th>
            <td className="weekly-duty-hours">{formatDutyTour(duty)}{duty.end<duty.start&&<small>Ends next day</small>}</td>
            <td>{selections[duty.number]?.name}</td>
          </tr>)}</tbody>
        </table>
      </section>)}
    </article>
    <Footer close={dismiss}/>
  </>}</Modal>
}

type AssignmentChange={number:number;previous?:DutySelection}
const groupSlotOrder=weeklyDutyGroups.flatMap(group=>group.slots)

export function WeeklyDutyWorkspace({people,draft}:{people:readonly Person[];draft?:WeeklyDraft}){
  const {weeklyDrafts,saveWeeklyDraft}=useDemo()
  const navigate=useNavigate()
  const saving=useRef(false)
  const workspace=useRef<HTMLElement>(null)
  const dutyList=useRef<HTMLDivElement>(null)
  const heading=useRef<HTMLHeadingElement>(null)
  const personnelSearch=useRef<HTMLInputElement>(null)
  const personnelToggle=useRef<HTMLButtonElement>(null)
  const duties=draft?.duties??weeklyDuties
  const [period,setPeriod]=useState(()=>draft?{start:draft.start,end:draft.end}:upcomingDutyPeriod(campusDateTime().date))
  const [assignments,setAssignments]=useState<{selections:Record<number,DutySelection>;undo:AssignmentChange[]}>(()=>({
    selections:Object.fromEntries(draft?.duties.flatMap(duty=>duty.personnel?[[duty.number,duty.personnel]]:[])??[]),undo:[],
  }))
  const [showSaveError,setShowSaveError]=useState(false)
  const [showPreview,setShowPreview]=useState(false)
  const [filter,setFilter]=useState('All duties')
  const [expandedGroups,setExpandedGroups]=useState(()=>new Set(weeklyDutyGroups.map(group=>group.id)))
  const [personFilter,setPersonFilter]=useState('All')
  const [search,setSearch]=useState('')
  const [wide,setWide]=useState(false)
  const [sidebarOpen,setSidebarOpen]=useState(true)
  const [drawerOpen,setDrawerOpen]=useState(false)
  const [personId,setPersonId]=useState('')
  const [target,setTarget]=useState<number>()
  const [announcement,setAnnouncement]=useState('')
  const {selections}=assignments
  const assigned=Object.keys(selections).length
  const unassigned=duties.length-assigned
  const overlaps=overlappingDrafts(weeklyDrafts,period,draft?.id)
  const duplicate=overlaps.find(row=>row.start===period.start&&row.end===period.end)
  const active=people.filter(person=>person.status==='Active')
  const selectedPerson=active.find(person=>person.id===personId)
  const selectedDuty=duties.find(duty=>duty.number===target)
  const selectedGroup=weeklyDutyGroups.find(group=>group.slots.some(number=>number===target))
  const dutyById=new Map(duties.map(duty=>[duty.number,duty]))
  function matchesFilter(duty:WeeklyDraftDuty,value=filter){
    if(value==='Unassigned duties')return !selections[duty.number]
    return value==='All duties'||value===duty.shift+' shift'
  }
  const displayedGroups=weeklyDutyGroups.flatMap(group=>{
    const rows=group.slots.flatMap(number=>{
      const duty=dutyById.get(number)
      return duty?[duty]:[]
    })
    const visible=rows.filter(duty=>matchesFilter(duty))
    return visible.length?[{...group,rows,visible}]:[]
  })
  const peopleWithDuties=active.map(person=>({
    person,duties:duties.filter(duty=>selections[duty.number]?.id===person.id),
  })).sort((a,b)=>Number(!!a.duties.length)-Number(!!b.duties.length)||a.person.name.localeCompare(b.person.name))
  const visiblePeople=peopleWithDuties.filter(({person,duties})=>
    (personFilter==='All'||(personFilter==='Assigned')===!!duties.length)&&
    search.trim().toLowerCase().split(/\s+/).every(term=>
      `${person.name} ${person.id} ${person.designation??''}`.toLowerCase().includes(term)))
  const assignedPeople=peopleWithDuties.filter(({duties})=>!!duties.length).length

  useEffect(()=>{
    heading.current?.focus()
    const section=workspace.current
    if(!section)return
    const resize=new ResizeObserver(([entry])=>{
      const hasRoom=entry.contentRect.width>=880
      setWide(hasRoom)
      if(hasRoom)setDrawerOpen(false)
    })
    resize.observe(section)
    return ()=>resize.disconnect()
  },[])
  function focusDuty(number?:number,mode:'exact'|'next'|'restored'='exact'){
    requestAnimationFrame(()=>{
      const buttons=Array.from(workspace.current?.querySelectorAll<HTMLButtonElement>('.weekly-assign-button')??[])
      const group=weeklyDutyGroups.find(row=>row.slots.some(slot=>slot===number))
      const groupButton=group?document.getElementById('weekly-group-'+group.id):null
      const after=number===undefined?-1:groupSlotOrder.indexOf(number)
      const button=mode==='restored'?workspace.current?.querySelector<HTMLButtonElement>(`.weekly-remove-button[data-duty="${number}"]`):
        mode==='next'?buttons.find(row=>groupSlotOrder.indexOf(Number(row.dataset.duty))>after)??buttons[0]:
        number===undefined?buttons[0]:buttons.find(row=>Number(row.dataset.duty)===number)
      const next=button??groupButton??workspace.current?.querySelector<HTMLSelectElement>('[aria-label="Filter duty assignments"]')
      next?.focus({preventScroll:true})
      if(!next||!dutyList.current?.contains(next))return
      const target=next.getBoundingClientRect()
      if(!draft){
        const toolbar=workspace.current?.querySelector('.weekly-toolbar')?.getBoundingClientRect()
        const footer=workspace.current?.querySelector('.weekly-footer')?.getBoundingClientRect()
        if(target.top<Math.max(0,toolbar?.bottom??0)||target.bottom>Math.min(window.innerHeight,footer?.top??window.innerHeight)){
          next.scrollIntoView({block:'center'})
        }
        return
      }
      const area=dutyList.current.getBoundingClientRect()
      const header=next.closest('.weekly-operational-group')?.querySelector<HTMLElement>('.weekly-group-heading')
      const top=area.top+(header&&!header.contains(next)?header.offsetHeight:0)+8
      if(target.top<top)dutyList.current.scrollTop+=target.top-top
      else if(target.bottom>area.bottom-8)dutyList.current.scrollTop+=target.bottom-area.bottom+8
    })
  }
  function toggleGroup(id:string){
    const expanded=expandedGroups.has(id)
    setExpandedGroups(previous=>{
      const next=new Set(previous)
      if(expanded)next.delete(id)
      else next.add(id)
      return next
    })
    if(expanded&&selectedGroup?.id===id)setTarget(undefined)
  }
  function openPersonnel(){
    if(wide)setSidebarOpen(true)
    else setDrawerOpen(true)
    requestAnimationFrame(()=>personnelSearch.current?.focus())
  }
  function clearChoice(){
    setTarget(undefined)
    setPersonId('')
  }
  function cancelAssignment(){
    clearChoice()
    setDrawerOpen(false)
    if(target!==undefined)focusDuty(target)
    else requestAnimationFrame(()=>{
      const person=workspace.current?.querySelector<HTMLButtonElement>(`.weekly-personnel-list [data-person-id="${CSS.escape(personId)}"]`)
      const origin=person??personnelToggle.current
      origin?.focus()
    })
  }
  function assign(number:number,person:Person){
    const duty=duties.find(row=>row.number===number)
    if(!duty||selections[number]||person.status!=='Active')return
    setAssignments(previous=>previous.selections[number]?previous:{
      selections:{...previous.selections,[number]:{id:person.id,name:person.name,designation:person.designation}},undo:[...previous.undo,{number}],
    })
    clearChoice()
    setDrawerOpen(false)
    setAnnouncement(`${person.name} assigned to duty ${number}, ${duty.name}.`)
    focusDuty(number,'next')
  }
  function chooseDuty(number:number){
    if(selectedPerson){assign(number,selectedPerson);return}
    setTarget(number)
    openPersonnel()
  }
  function choosePerson(person:Person){
    if(target!==undefined){assign(target,person);return}
    setPersonId(personId===person.id?'':person.id)
    setDrawerOpen(false)
    focusDuty()
  }
  function remove(number:number){
    if(!selections[number])return
    setAssignments(previous=>{
      const removed=previous.selections[number]
      if(!removed)return previous
      const selections={...previous.selections}
      delete selections[number]
      return {selections,undo:[...previous.undo,{number,previous:removed}]}
    })
    clearChoice()
    setAnnouncement(`Assignment removed from duty ${number}.`)
    focusDuty(number)
  }
  function undo(){
    const change=assignments.undo.at(-1)
    if(!change)return
    const {number,previous:restored}=change
    setAssignments(previous=>{
      const selections={...previous.selections}
      if(restored)selections[number]=restored
      else delete selections[number]
      return {selections,undo:previous.undo.slice(0,-1)}
    })
    clearChoice()
    setAnnouncement(`Assignment to duty ${number} undone.`)
    focusDuty(number,restored?'restored':'exact')
  }

  function save(){
    if(saving.current)return
    if(!validWeeklyPeriod(period)||duplicate){
      setShowSaveError(true)
      requestAnimationFrame(()=>workspace.current?.querySelector<HTMLElement>('.weekly-save-feedback')?.focus())
      return
    }
    saving.current=true
    saveWeeklyDraft({...period,id:draft?.id??crypto.randomUUID(),updatedAt:new Date().toISOString(),
      duties:duties.map(duty=>({...duty,personnel:selections[duty.number]}))})
    navigate(weeklySchedulePath,{replace:true,state:{savedDraft:true}})
  }

  const personnelPanel=<>
    <div className="weekly-personnel-tools">
      {selectedDuty&&selectedGroup&&<div className="weekly-target-note" aria-live="polite">
        <span>Assigning to</span>
        <strong>{selectedGroup.name}</strong>
        <span>{dutyResponsibility(selectedDuty)} · {selectedDuty.shift} Shift</span>
        <span className="weekly-duty-hours">{formatDutyTour(selectedDuty)}{selectedDuty.end<selectedDuty.start?' · Ends next day':''}</span>
      </div>}
      <label className="search-box"><Search size={16} aria-hidden="true"/><input ref={personnelSearch} type="search" value={search}
        aria-label="Search personnel" placeholder="Search name, ID or designation" onChange={event=>setSearch(event.target.value)}/></label>
      <Segments label="Filter personnel" options={['All','Unassigned','Assigned']} value={personFilter} change={setPersonFilter}/>
      <p className="muted">{active.length-assignedPeople} unassigned in this roster</p>
    </div>
    <div className="weekly-personnel-list" role="region" aria-label="Personnel results" tabIndex={draft||!wide?0:undefined}>
      {visiblePeople.length?<ul>{visiblePeople.map(({person,duties})=><li key={person.id}>
        <button type="button" data-person-id={person.id} aria-pressed={personId===person.id}
          onClick={()=>choosePerson(person)}>
          <strong>{person.name}</strong>
          <small>{person.id}{person.designation?` · ${person.designation}`:''}</small>
          {duties.length?duties.map(duty=><span className="weekly-person-duty" key={duty.number}>
            {duty.name} · {formatDutyTour(duty)}{duty.end<duty.start?' · Ends next day':''}
          </span>):<span className="weekly-person-unassigned">Unassigned in this roster</span>}
        </button>
      </li>)}</ul>:<p className="weekly-no-duties muted">No active personnel match.</p>}
    </div>
  </>

  return <section className="weekly-duty" ref={workspace}>
    <Link className="weekly-back text-button" to={weeklySchedulePath}><ArrowLeft size={16} aria-hidden="true"/>Back to Duty Schedule</Link>
    <div className="page-heading">
      <div><h1 ref={heading} tabIndex={-1}>{draft?'Edit':'Create'} Weekly Duty Schedule</h1><p>Prepare personnel assignments for the selected coverage period.</p></div>
      <Badge value="Draft"/>
    </div>
    <div className={draft?'panel weekly-workspace':'panel weekly-workspace weekly-workspace-create'}>
      <div className="weekly-coverage">
        <Field label="Period start"><input type="date" value={period.start} onChange={event=>{setShowSaveError(false);setPeriod({...period,start:event.target.value})}}/></Field>
        <Field label="Period end"><input type="date" value={period.end} onChange={event=>{setShowSaveError(false);setPeriod({...period,end:event.target.value})}}/></Field>
      </div>
      <div className="weekly-toolbar">
        <button type="button" className="outline" disabled={!assignments.undo.length} onClick={undo}><Undo2 size={15} aria-hidden="true"/>Undo</button>
        <button ref={personnelToggle} type="button" className="outline" aria-expanded={wide?sidebarOpen:drawerOpen} aria-haspopup={wide?undefined:'dialog'}
          aria-controls={wide&&sidebarOpen?'weekly-personnel':undefined}
          onClick={()=>{if(wide&&sidebarOpen){setSidebarOpen(false);clearChoice()}else openPersonnel()}}>
          <PanelRight size={15} aria-hidden="true"/>{wide&&sidebarOpen?'Hide Personnel':'Show Personnel'}
        </button>
        <div className="weekly-progress">
          <span><strong>{assigned} of {duties.length}</strong> assigned</span>
          <progress value={assigned} max={duties.length} aria-label="Duty assignment progress"/>
          <span>{unassigned} vacant</span>
        </div>
      </div>
      <span className="sr-only" role="status">{announcement}</span>
      <div className={wide&&sidebarOpen?'weekly-layout with-personnel':'weekly-layout'}>
        <div className="weekly-roster">
          <div className="weekly-assignment-heading">
            <div><h2 id="weekly-duties-heading">Duty Assignments</h2>
              {selectedPerson||selectedDuty?<p className="weekly-choice">
                <span>{selectedPerson?`Assign ${selectedPerson.name} to a vacant duty.`:'Choose personnel for the highlighted slot.'}</span>
                {selectedPerson&&<button type="button" className="text-button weekly-cancel-assignment" onClick={cancelAssignment}>Cancel assignment</button>}
              </p>:<p className="muted">Select a vacant duty or choose personnel first.</p>}
            </div>
            <label className="weekly-duty-filter">
              <span><ListFilter size={14} aria-hidden="true"/>Filter duties</span>
              <Select label="Filter duty assignments" value={filter} options={['All duties','Unassigned duties','Day shift','Night shift']}
                change={value=>{
                  setFilter(value)
                  if(selectedDuty&&!matchesFilter(selectedDuty,value))setTarget(undefined)
                }}/>
            </label>
          </div>
          <div className="weekly-group-actions">
            <button type="button" className="text-button" disabled={expandedGroups.size===weeklyDutyGroups.length}
              onClick={()=>setExpandedGroups(new Set(weeklyDutyGroups.map(group=>group.id)))}>Expand All</button>
            <button type="button" className="text-button" disabled={!expandedGroups.size}
              onClick={()=>{setExpandedGroups(new Set());setTarget(undefined)}}>Collapse All</button>
          </div>
          <div className="weekly-duty-list" ref={dutyList}
            role="region" aria-labelledby="weekly-duties-heading" tabIndex={draft?0:undefined}>
          {!displayedGroups.length&&<p className="weekly-no-duties muted">No duties match this filter.</p>}
          {displayedGroups.map(group=>{
            const expanded=expandedGroups.has(group.id)
            const filled=group.rows.filter(duty=>selections[duty.number]).length
            const vacant=group.rows.length-filled
            const groupButtonId='weekly-group-'+group.id
            const groupPanelId=groupButtonId+'-panel'
            return <section className="weekly-operational-group" key={group.id} data-duty-group={group.id} aria-labelledby={groupButtonId}>
              <h3 className="weekly-group-heading"><button id={groupButtonId} type="button" aria-expanded={expanded}
                aria-controls={groupPanelId} onClick={()=>toggleGroup(group.id)}>
                <ChevronDown size={16} aria-hidden="true"/><span>{group.name}</span>
                <small>{filled}/{group.rows.length} assigned{vacant>0&&` · ${vacant} vacant`}</small>
              </button></h3>
              <div id={groupPanelId} hidden={!expanded}>
              {expanded&&(['Day','Night'] as const).map(shift=>{
                const visible=group.visible.filter(duty=>duty.shift===shift)
                if(!visible.length)return null
                const shiftId=`${groupButtonId}-${shift}`
                const ShiftIcon=shift==='Day'?Sun:Moon
                return <section className="weekly-shift" key={shift} aria-labelledby={shiftId}>
                <h4 id={shiftId}><ShiftIcon size={14} aria-hidden="true"/>{shift} Shift</h4>
                <table className="weekly-duty-table" role="table" aria-labelledby={`${groupButtonId} ${shiftId}`}>
                <thead role="rowgroup"><tr role="row"><th scope="col">Responsibility</th><th scope="col">Tour of Duty</th><th scope="col">Personnel</th></tr></thead>
                <tbody role="rowgroup">{visible.map((duty,index)=>{
                  const previous=visible[index-1]
                  const responsibility=dutyResponsibility(duty)
                  const repeats=!!previous&&dutyResponsibility(previous)===responsibility&&previous.designation===duty.designation&&previous.details===duty.details
                  const slotLabel=`${group.name}, ${shift} Shift, ${responsibility}, ${formatDutyTour(duty)}${duty.end<duty.start?', ends next day':''}`
                  return <tr role="row" key={duty.number} data-duty-number={duty.number} data-repeat={repeats}
                  data-target={target===duty.number} data-available={!!selectedPerson&&!selections[duty.number]}>
                  <th role="rowheader" scope="row" className="weekly-duty-description">
                    <div className="weekly-responsibility-label"><span>{responsibility}</span>
                    {(duty.designation||duty.details)&&<small>{[duty.designation,duty.details].filter(Boolean).join(' · ')}</small>}</div>
                  </th>
                  <td role="cell" className="weekly-duty-hours">{formatDutyTour(duty)}
                    {duty.end<duty.start&&<small className="muted">Ends next day</small>}
                  </td>
                  <td role="cell" className="weekly-duty-personnel">{selections[duty.number]?<div className="weekly-assigned-person">
                    <span className="weekly-assigned-name">{selections[duty.number].name}</span>
                    <button type="button" className="weekly-remove-button" data-duty={duty.number} title="Remove assignment"
                      aria-label={`Remove assignment: ${slotLabel}`} onClick={()=>remove(duty.number)}><X size={16} aria-hidden="true"/></button>
                    </div>:target===duty.number?
                    <button type="button" className="outline weekly-cancel-assignment" onClick={cancelAssignment}>Cancel assignment</button>:
                    <button type="button" className="outline weekly-assign-button" data-duty={duty.number}
                      aria-label={`Assign: ${slotLabel}`} onClick={()=>chooseDuty(duty.number)}>
                      <Plus size={14} aria-hidden="true"/>Assign
                    </button>}</td>
                </tr>})}</tbody>
                </table></section>
              })}
              </div>
            </section>
          })}
          </div>
        </div>
        {wide&&sidebarOpen&&<aside id="weekly-personnel" className="weekly-personnel" aria-label="Personnel">
          <h2>Personnel</h2>
          {personnelPanel}
        </aside>}
      </div>
      <div className="weekly-footer">
        {showSaveError?<p className="error-text weekly-save-feedback" role="alert" tabIndex={-1}>
          {duplicate?<>A draft already covers these dates. <Link to={weeklyDraftPath+duplicate.id}>Open existing draft</Link></>:'Enter valid coverage dates with the end on or after the start.'}
        </p>:overlaps.length>0&&<p className="muted weekly-save-feedback" role="status">This period overlaps {duplicate?'an existing draft with the same dates.':'another draft. You can still save it.'}</p>}
        <p className="muted">Saved drafts reset on refresh.</p>
        <div className="weekly-footer-actions">
          <button type="button" className="outline" onClick={()=>setShowPreview(true)}><FileText size={15} aria-hidden="true"/>Preview Schedule</button>
          <Link className="outline" to={weeklySchedulePath}>Cancel</Link>
          <button type="button" className="primary weekly-save-button" onClick={save}>Save Draft</button>
        </div>
      </div>
    </div>
    {!wide&&drawerOpen&&<Modal title="Personnel" className="weekly-personnel-dialog" close={cancelAssignment}>
      {dismiss=><div className="weekly-drawer-content" onKeyDown={event=>{
        if(event.key==='Escape'){
          event.preventDefault()
          dismiss()
        }
      }}>{personnelPanel}{selectedDuty&&<footer>
        <button type="button" className="outline weekly-cancel-assignment" onClick={dismiss}>Cancel assignment</button>
      </footer>}</div>}
    </Modal>}
    {showPreview&&<WeeklySchedulePreview period={period} duties={duties} selections={selections} close={()=>setShowPreview(false)}/>}
  </section>
}
