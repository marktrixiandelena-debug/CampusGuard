import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { SortHeading, RecordPagination, RecordEmpty } from '../../shared/ui/RecordTableTools'
import { useRecordPage, compareLogbookRecords } from '../../shared/hooks/useRecordPage'
import { useSummaryHref } from '../../shared/hooks/useSummaryHref'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CalendarClock, CircleCheck, MapPin, UserRound } from 'lucide-react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import type { FormEvent, ReactNode } from 'react'
import { useDemo } from '../../app/store'
import { dateLabel, personnelDesignations, personnelResponsibilities, TODAY } from '../../data/data'
import type { Assignment, Person } from '../../data/data'
import { Badge, Field, Footer, Heading, Modal, Panel, SearchBox, Segments, Select, Stats, Tabs } from '../../shared/ui/ui'
import { dailyAssignmentsPath, personnelAssignmentsPath, personnelTabs } from '../../app/navigation'
import './personnel-directory.css'
import { useLogbookFilters } from '../../shared/hooks/useLogbookFilters'
import { DashboardContext } from '../dashboard/DashboardContext'
import { isReportDate } from '../reporting/reporting'
import PersonnelActivityHistory from './PersonnelActivityHistory'
import { newWeeklySchedulePath, weeklyDraftPath, weeklySchedulePath, WeeklyDutyRecords, WeeklyDutyWorkspace } from './WeeklyDutySchedule'
import { personnelActivity } from './personnel-activity'
import { dashboardShift } from '../dashboard/dashboard-data'
import { resolveSession } from '../auth/auth-data'
import { campusDateTime } from '../visitors/visitor-data'
import PersonnelAssignments from './PersonnelAssignments'
type Stage='register'|'profile'|null
function requestedSchedule(params:URLSearchParams){
  const date=params.get('date')||TODAY,start=params.get('start')||dashboardShift.start,end=params.get('end')||dashboardShift.end
  const validTime=(time:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const validShift=validTime(start)&&validTime(end)&&start<end
  return {date:isReportDate(date)?date:TODAY,start:validShift?start:dashboardShift.start,end:validShift?end:dashboardShift.end}
}
const profileTabs=['Profile','Assignments','Activity'] as const
const directoryDefaults={search:'',status:'All Status',designation:'All Designations',sort:'Name A-Z',display:'Table',page:'1',pageSize:'10'}
const directorySorts=['Name A-Z','Name Z-A','Position A-Z','Position Z-A','Personnel ID A-Z','Personnel ID Z-A']
const directoryColumns:Record<string,[string,string]>={Personnel:['Name A-Z','Name Z-A'],'Position / Designation':['Position A-Z','Position Z-A']}
const positions=['Security Guard','Senior Security Personnel']
const profileFields={name:'Full name',contact:'Contact number',position:'Position',designation:'Designation',organizationalResponsibility:'Organizational responsibility'} as const
const editableKeys=Object.keys(profileFields) as (keyof typeof profileFields)[]
const designationLabel=(person:Person)=>person.designation||'Not specified'
const responsibilityLabel=(person:Person)=>person.organizationalResponsibility||'None'
const normalizedName=(name:string)=>name.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase()
const assignmentKey=({date,start,end}:Assignment)=>`${date}|${start}|${end}`

function readProfile(data:FormData){
  const name=String(data.get('name')??'').trim(),contact=String(data.get('contact')??'').trim()
  const position=positions.find(value=>value===data.get('position'))
  const designation=personnelDesignations.find(value=>value===data.get('designation'))
  const organizationalResponsibility=personnelResponsibilities.find(value=>value===data.get('organizationalResponsibility'))
  if(!name||!position||(data.get('designation')&&!designation)||(data.get('organizationalResponsibility')&&!organizationalResponsibility))return null
  return {name,contact,position,designation,organizationalResponsibility}
}

function PersonnelFields({profile,people,photo}:{profile?:Person;people:Person[];photo?:ReactNode}){
  const [name,setName]=useState(profile?.name??'')
  const matches=normalizedName(name)?people.filter(person=>person.id!==profile?.id&&normalizedName(person.name)===normalizedName(name)):[]
  return <>
    <section className="personnel-dialog-section"><h3>Personnel Information</h3>
      {photo}
      {profile&&<Field label="Personnel ID"><input value={profile.id} readOnly/></Field>}
      <Field label="Full name *"><input name="name" required pattern=".*\S.*" defaultValue={profile?.name} onInput={event=>setName(event.currentTarget.value)} placeholder="Enter full name" aria-describedby={matches.length?'personnel-name-warning':undefined}/></Field>
      {!!matches.length&&<p id="personnel-name-warning" className="callout amber" role="status">Possible duplicate name. Matching personnel: {matches.map(person=>person.id).join(', ')}. You can still save.</p>}
      <Field label="Contact number (optional)"><input name="contact" type="tel" autoComplete="tel" defaultValue={profile?.contact}/></Field>
    </section>
    <section className="personnel-dialog-section"><h3>Employment Information</h3>
      <div className="form-grid">
        <Field label="Position *"><select name="position" required defaultValue={profile?.position??positions[0]}>{positions.map(position=><option key={position}>{position}</option>)}</select></Field>
        <Field label="Personnel designation"><select name="designation" defaultValue={profile?.designation??''}><option value="">Not specified</option>{personnelDesignations.map(value=><option key={value}>{value}</option>)}</select></Field>
      </div>
      <Field label="Organizational responsibility"><select name="organizationalResponsibility" defaultValue={profile?.organizationalResponsibility??''}><option value="">None</option>{personnelResponsibilities.map(value=><option key={value}>{value}</option>)}</select></Field>
      {!profile&&<fieldset className="personnel-status-choice"><legend>Personnel status *</legend><div>
        <label><input type="radio" name="status" value="Active" defaultChecked required/> Active</label>
        <label><input type="radio" name="status" value="Inactive" required/> Inactive</label>
      </div></fieldset>}
    </section>
  </>
}
export default function Personnel(){
  const summaryHref=useSummaryHref()
  const db=useDemo(),navigate=useNavigate(),path=useLocation().pathname
  const [params]=useSearchParams()
  const {date,start,end}=requestedSchedule(params)
  const mode=path.split('/')[2]||'personnel'
  const {filters:directoryFilters,setFilter:directoryFilter}=useLogbookFilters(directoryDefaults,{},{status:['All Status','Active','Inactive'],designation:['All Designations',...personnelDesignations,'Not specified'],sort:directorySorts,display:['Table','Grid'],pageSize:['10','25','50']},{resetPageOnChange:['search','status','designation','sort','pageSize']})
  const view=directoryFilters.display,setView=(value:string)=>directoryFilter('display',value)
  const clearDirectory=()=>{const next=new URLSearchParams(params);for(const key of ['search','status','designation','page'])next.delete(key);navigate({search:next.toString()},{replace:true})}
  const {search,status,designation}=directoryFilters
  const directoryFiltered=!!search||status!=='All Status'||designation!=='All Designations'
  const setSearch=(value:string)=>directoryFilter('search',value),setStatus=(value:string)=>directoryFilter('status',value)
  const [stage,setStage]=useState<Stage>(null),[person,setPerson]=useState<Person>(),[error,setError]=useState(''),[photo,setPhoto]=useState<string>()
  const [profileTab,setProfileTab]=useState<(typeof profileTabs)[number]>('Profile')
  const [profileEditing,setProfileEditing]=useState(false)
  const [confirmation,setConfirmation]=useState<'discard'|'deactivate'|'reactivate'|null>(null)
  const [notice,setNotice]=useState('')
  const profileForm=useRef<HTMLFormElement>(null),editProfileButton=useRef<HTMLButtonElement>(null)
  const safeAction=useRef<HTMLButtonElement>(null),draftFocus=useRef<HTMLElement|null>(null)
  const mutationPending=useRef(false)
  const [photoMode,setPhotoMode]=useState<'edit'|'full'|null>(null)
  const [photoLoading,setPhotoLoading]=useState(false),[photoError,setPhotoError]=useState(''),[failedPhoto,setFailedPhoto]=useState('')
  const cameraInput=useRef<HTMLInputElement>(null),pickerInput=useRef<HTMLInputElement>(null),photoRead=useRef(0)
  const photoHeading=useRef<HTMLHeadingElement>(null),profileHeading=useRef<HTMLHeadingElement>(null)
  const editButton=useRef<HTMLButtonElement>(null),viewPhotoButton=useRef<HTMLButtonElement>(null)
  const previousPhotoMode=useRef(photoMode)
  useLayoutEffect(()=>{if(profileEditing)profileForm.current?.querySelector<HTMLInputElement>('[name=name]')?.focus()},[profileEditing])
  useLayoutEffect(()=>{if(confirmation)safeAction.current?.focus()},[confirmation])
  useEffect(()=>{
    if(stage==='profile'){
      if(photoMode)photoHeading.current?.focus()
      else if(previousPhotoMode.current){
        const trigger=previousPhotoMode.current==='edit'?editButton.current:viewPhotoButton.current
        const target=trigger||profileHeading.current
        target?.focus()
      }
    }
    previousPhotoMode.current=photoMode
  },[stage,photoMode])
  useEffect(()=>()=>{photoRead.current++},[])
  const current=db.assignments.filter(a=>a.date===date&&a.start===start&&a.end===end)
  const profileAssignment=current.find(assignment=>assignment.personId===person?.id)
  const otherAssignments=stage==='profile'&&profileTab==='Assignments'
    ?db.assignments.filter(assignment=>assignment.personId===person?.id&&assignment.id!==profileAssignment?.id)
      .sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start))
    :[]
  const profileActivity=stage==='profile'&&profileTab==='Activity'&&person
    ?personnelActivity(person.id,db.visits,db.incidents)
    :[]
  const route=path.replace(/\/$/,'')
  const weeklyRecords=route===weeklySchedulePath
  const weeklyWorkspace=route===newWeeklySchedulePath
  const draftRoute=route.startsWith(weeklyDraftPath)
  const weeklyDraft=draftRoute?db.weeklyDrafts.find(row=>weeklyDraftPath+row.id===route):undefined
  const rows=db.people.filter(p=>(status==='All Status'||p.status===status)&&(designation==='All Designations'||designationLabel(p)===designation)&&`${p.id} ${p.name} ${p.position} ${designationLabel(p)} ${responsibilityLabel(p)}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>compareLogbookRecords(a,b,directoryFilters.sort,r=>directoryFilters.sort.startsWith('Position')?r.position:directoryFilters.sort.startsWith('Personnel ID')?r.id:r.name))
  const directoryPage=useRecordPage(rows,directoryFilters.page,directoryFilters.pageSize,directoryFilter,mode==='personnel')
  const close=()=>{
    setStage(null);setError('');resetPhoto();setFailedPhoto('');setPhotoMode(null);setProfileTab('Profile');setProfileEditing(false);setConfirmation(null)
    if(mode==='personnel'&&params.has('profile')){
      const next=new URLSearchParams(params)
      for(const key of ['profile','assignmentDate','assignmentTime'])next.delete(key)
      navigate({search:next.toString()},{replace:true})
    }
  }
  const openProfile=(person:Person)=>{setNotice('');setPerson(person);setStage('profile')}
  const profileRequest=mode==='personnel'?params.get('profile'):null
  const [handledProfile,setHandledProfile]=useState<string|null>(null)
  if(profileRequest!==handledProfile){
    setHandledProfile(profileRequest)
    const requested=db.people.find(item=>item.id===profileRequest)
    if(requested)openProfile(requested)
    else if(handledProfile)setStage(null)
  }
  const linkedAccount=db.accounts.find(account=>!!person&&account.personId===person.id)
  const linkedAccess=linkedAccount&&resolveSession(db.accounts,linkedAccount.id,db.people)
  const campusNow=confirmation==='deactivate'?campusDateTime():null
  const retainedUpcoming=campusNow?db.assignments.filter(a=>a.personId===person?.id&&(a.date>campusNow.date||a.date===campusNow.date&&a.end>campusNow.time)).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start)):[]
  function resetPhoto(value?:string){
    photoRead.current++
    setPhoto(value)
    setPhotoLoading(false)
    setPhotoError('')
  }
  function selectPersonnelPhoto(input:HTMLInputElement){
    const file=input.files?.[0]
    input.value=''
    if(!file)return
    const request=++photoRead.current
    setPhotoLoading(false)
    setPhotoError('')
    if(!file.type.startsWith('image/')||file.size>5_000_000){
      setPhotoError('Choose an image no larger than 5 MB.')
      return
    }
    setPhotoLoading(true)
    const fail=()=>{
      if(request!==photoRead.current)return
      setPhotoError('This image could not be opened. Choose another photo.')
      setPhotoLoading(false)
    }
    const reader=new FileReader()
    reader.onerror=fail
    reader.onload=()=>{
      if(request!==photoRead.current)return
      const source=String(reader.result),image=new Image()
      image.src=source
      image.decode().then(()=>{
        if(request!==photoRead.current)return
        setPhoto(source)
        setPhotoLoading(false)
      },fail)
    }
    reader.readAsDataURL(file)
  }
  function register(e:FormEvent<HTMLFormElement>){
    e.preventDefault()
    if(photoLoading||mutationPending.current||db.currentUser?.role!=='Security Head')return
    const data=new FormData(e.currentTarget),profile=readProfile(data),status=data.get('status')
    if(!profile||(status!=='Active'&&status!=='Inactive')){setError('Enter a full name and select valid employment information.');return}
    const id=`SEC-${String(Math.max(0,...db.people.map(p=>Number(p.id.split('-')[1])))+1).padStart(3,'0')}`
    mutationPending.current=true
    db.setPeople(old=>[...old,{...profile,id,status,photo}])
    db.activity('Personnel registered',`${id} · ${profile.name}`,[])
    setNotice(`Personnel registered · ${id}`)
    close()
  }
  function finishProfileEdit(){
    setProfileEditing(false)
    setError('')
    requestAnimationFrame(()=>editProfileButton.current?.focus())
  }
  function requestProfileDismiss(){
    if(confirmation||!person||!profileForm.current)return
    const data=new FormData(profileForm.current)
    if(!editableKeys.some(key=>String(data.get(key)??'').trim()!==(person[key]??''))){finishProfileEdit();return}
    const active=document.activeElement
    draftFocus.current=active instanceof HTMLElement&&profileForm.current.closest('dialog')?.contains(active)?active:profileForm.current.querySelector<HTMLInputElement>('[name=name]')
    setConfirmation('discard')
  }
  function keepProfile(){
    setConfirmation(null)
    if(confirmation==='discard')requestAnimationFrame(()=>draftFocus.current?.focus({preventScroll:true}))
  }
  function saveProfile(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(!person||confirmation||mutationPending.current||db.currentUser?.role!=='Security Head')return
    const profile=readProfile(new FormData(event.currentTarget))
    if(!profile){setError('Enter a full name and select valid employment information.');return}
    const changed=editableKeys.filter(key=>profile[key]!==person[key])
    if(changed.length){
      mutationPending.current=true
      db.setPeople(old=>old.map(p=>p.id===person.id?{...p,...profile}:p))
      setPerson({...person,...profile})
      const eventName=changed.length===1&&changed[0]==='designation'?'Personnel designation changed':
        changed.length===1&&changed[0]==='organizationalResponsibility'?'Organizational responsibility changed':'Personnel profile updated'
      db.activity(eventName,`${person.id} · ${changed.map(key=>profileFields[key]).join(', ')}`,[])
      setNotice(`Personnel profile updated · ${person.id}`)
    }
    finishProfileEdit()
  }
  function confirmStatus(){
    if(!person||(confirmation!=='deactivate'&&confirmation!=='reactivate')||mutationPending.current||db.currentUser?.role!=='Security Head')return
    const status=confirmation==='deactivate'?'Inactive':'Active'
    if(person.status===status)return
    const affected=[...new Set(db.assignments.filter(a=>a.personId===person.id).map(assignmentKey))]
    mutationPending.current=true
    db.setPeople(old=>old.map(p=>p.id===person.id?{...p,status}:p))
    setPerson({...person,status})
    const eventName=status==='Inactive'?'Personnel deactivated':'Personnel reactivated'
    db.activity(eventName,`${person.id} · Profile status: ${status}`,affected)
    setNotice(`${eventName} · ${person.id}`)
    setConfirmation(null)
    requestAnimationFrame(()=>profileHeading.current?.focus())
  }
  const photoControls=<div className="personnel-photo-controls">
    {photo&&photo!==failedPhoto?<img src={photo} alt="Selected personnel photo" className="personnel-photo-preview" onError={()=>setFailedPhoto(photo)}/>:<div className="personnel-photo-placeholder"><UserRound size={22} aria-hidden="true"/>No photo</div>}
    <div>
    <p className="muted">Optional personnel photo. Images up to 5 MB.</p>
    <div className="personnel-photo-actions">
      <button type="button" className="outline" onClick={()=>cameraInput.current?.click()}>Take Photo</button>
      <button type="button" className="outline" onClick={()=>pickerInput.current?.click()}>Choose Photo</button>
      {(photo||photoLoading)&&<button type="button" className="text-button" onClick={()=>resetPhoto()}>Remove Photo</button>}
    </div>
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={event=>selectPersonnelPhoto(event.currentTarget)}/>
    <input ref={pickerInput} type="file" accept="image/*" hidden onChange={event=>selectPersonnelPhoto(event.currentTarget)}/>
    {photoLoading&&<p role="status" className="muted">Loading photo...</p>}
    {photoError&&<p role="alert" className="error-text">{photoError}</p>}
    </div>
  </div>
  const hasPortrait=!!person?.photo&&person.photo!==failedPhoto
  if(route===dailyAssignmentsPath||(weeklyRecords&&['date','start','end'].some(key=>params.has(key)))){
    const next=new URLSearchParams(params)
    next.set('source','legacy')
    next.set('date',date)
    next.set('start',start)
    next.set('end',end)
    return <Navigate replace to={{pathname:personnelAssignmentsPath,search:next.toString()}}/>
  }
  if(route==='/personnel/campus-posts')return <Navigate replace to={{pathname:personnelAssignmentsPath,search:params.toString()}}/>
  if(route===personnelAssignmentsPath)return <><DashboardContext/><Tabs rows={personnelTabs} className="personnel-tabs"/><PersonnelAssignments/></>
  if(draftRoute&&!weeklyDraft)return <Navigate to={weeklySchedulePath} replace state={{missingDraft:true}}/>
  if(weeklyRecords||weeklyWorkspace||weeklyDraft)return <>
    <Tabs rows={personnelTabs} className="personnel-tabs"/>
    {weeklyWorkspace||weeklyDraft?<WeeklyDutyWorkspace key={weeklyDraft?.id??'new'} people={db.people} draft={weeklyDraft}/>:<WeeklyDutyRecords/>}
  </>
  if(route!=='/personnel'&&route!=='/personnel/activity-history')return <Navigate to="/dashboard" replace/>
  return <><DashboardContext/><Heading title="Security Personnel" subtitle="Manage personnel, scheduled shifts, campus posts and assignment history." action={<button className="primary" onClick={()=>{mutationPending.current=false;setNotice('');setStage('register')}}>＋ Add Personnel</button>}/>
  {notice&&stage!=='profile'&&<p className="callout green" role="status">{notice}</p>}
  <Stats title="Personnel overview" metadata={<>Selected schedule: {dateLabel(date)} &middot; {start} to {end}</>} context="Scheduled duty is not verified attendance. Active Personnel covers the entire directory." rows={[
{label:'Guards Scheduled',value:new Set(current.map(a=>a.personId)).size,note:'Selected shift; scheduled duty is not attendance',action:'View duty roster',href:summaryHref(personnelAssignmentsPath,{source:'legacy',date,start,end})},
{label:'Active Personnel',value:db.people.filter(p=>p.status==='Active').length,note:'Active profiles across the directory',action:'View active personnel',href:summaryHref('/personnel',{date,start,end,status:'Active'})},
{label:'Locations with Assignments',value:new Set(current.map(a=>a.location)).size,note:'Selected shift; does not confirm required-post coverage',action:'View personnel assignments',href:summaryHref(personnelAssignmentsPath,{source:'legacy',date,start,end})}]}/><Tabs rows={personnelTabs} className="personnel-tabs"/>
  {mode==='personnel'&&<Panel title="Personnel Directory" className="personnel-directory" action={<small className="muted" aria-live="polite">{rows.length} of {db.people.length} personnel</small>}>
    <div className="filter-row directory-filters">
      <SearchBox value={search} change={setSearch} placeholder="Search ID, name or position..."/>
      <Select label="Personnel status" value={status} change={setStatus} options={['All Status','Active','Inactive']}/>
      <Select label="Personnel designation" value={designation} change={value=>directoryFilter('designation',value)} options={['All Designations',...personnelDesignations,'Not specified']}/>
      <Select label="Sort personnel" value={directoryFilters.sort} change={value=>directoryFilter('sort',value)} options={directorySorts}/><Segments responsiveTableLabel label="Display mode" options={['Table','Grid']} value={view} change={v=>setView(v as 'Table'|'Grid')}/>
      {directoryFiltered&&<button className="text-button directory-reset" onClick={clearDirectory}>Clear filters</button>}
    </div>
    {view==='Table'?<ResponsiveRecords label="Personnel directory" records={directoryPage.rows.map(p=>({id:p.id,title:p.name,badges:<Badge value={p.status}/>,metadata:[{label:'Position',value:p.position+' · '+designationLabel(p)},...(p.organizationalResponsibility?[{label:'Responsibility',value:p.organizationalResponsibility}]:[]),{label:'Personnel ID',value:p.id},{label:'Shift post',value:current.find(a=>a.personId===p.id)?.location||'Not scheduled'}],actions:<button className="outline" onClick={()=>openProfile(p)} aria-label={`View profile for ${p.name}`}>View profile</button>}))} empty={<RecordEmpty total={db.people.length} active={directoryFiltered} noun="personnel" clear={clearDirectory}/>}><div className="table-scroll" tabIndex={0} role="region" aria-label="Personnel directory table"><table className="directory-table"><colgroup><col style={{width:'25%'}}/><col style={{width:'20%'}}/><col style={{width:'17%'}}/><col style={{width:'15%'}}/><col style={{width:'10%'}}/><col style={{width:'13%'}}/></colgroup><thead><tr>{['Personnel','Position / Designation','Organizational responsibility','Scheduled post','Status','Actions'].map(h=><SortHeading key={h} label={h} pair={directoryColumns[h]} value={directoryFilters.sort} change={value=>directoryFilter('sort',value)}/>)}</tr></thead><tbody>{rows.length?directoryPage.rows.map(p=><tr key={p.id} data-record-id={p.id}>
      <td><div className="directory-person"><span className="directory-avatar" aria-hidden="true">{p.photo?<img src={p.photo} alt=""/>:p.name.split(' ').filter(Boolean).map(n=>n[0]).filter((_,i,a)=>i===0||i===a.length-1).join('')}</span><div><button className="text-button directory-name" onClick={()=>openProfile(p)}>{p.name}</button><small className="directory-id">{p.id}</small></div></div></td>
      <td>{p.position}<small className="muted block">{designationLabel(p)}</small></td><td>{responsibilityLabel(p)}</td><td>{current.find(a=>a.personId===p.id)?.location||<span className="muted">Not scheduled</span>}</td><td><Badge value={p.status}/></td><td><button className="text-button directory-view" aria-label={`View profile for ${p.name}`} onClick={()=>openProfile(p)}>View profile <span aria-hidden="true">→</span></button></td>
    </tr>):<tr><td colSpan={6} className="empty"><RecordEmpty total={db.people.length} active={directoryFiltered} noun="personnel" clear={clearDirectory}/></td></tr>}</tbody></table></div></ResponsiveRecords>:<div className="item-grid">{directoryPage.rows.map(p=><article className="item-card personnel-card" key={p.id}><div className="item-photo">{p.photo?<img src={p.photo} alt={`${p.name} personnel photo`}/>:<span aria-label="No photo">No photo</span>}</div><div className="item-info"><div className="module-heading"><h3>{p.name}</h3><Badge value={p.status}/></div><p>{p.position} · {designationLabel(p)}</p>{p.organizationalResponsibility&&<p>{p.organizationalResponsibility}</p>}<small className="muted block">{p.id}</small><button className="outline" onClick={()=>openProfile(p)}>View Profile</button></div></article>)}{!rows.length&&<div className="directory-empty empty"><RecordEmpty total={db.people.length} active={directoryFiltered} noun="personnel" clear={clearDirectory}/></div>}</div>}
  <RecordPagination {...directoryPage} total={rows.length} change={directoryFilter}/></Panel>}
  {mode==='activity-history'&&<PersonnelActivityHistory/>}
  {stage&&<Modal key={stage} title={stage==='register'?'Register Personnel':profileEditing?'Edit Personnel Profile':'Personnel Profile'} close={close} onDismissRequest={profileEditing?requestProfileDismiss:undefined} subtitle={stage==='register'?'Add a new member to the security personnel directory.':undefined}>{dismiss=><>
  {stage==='register'&&<form className="personnel-register" onSubmit={register}>
    <p className="muted">Personnel ID is generated on save.</p>
    <PersonnelFields people={db.people} photo={photoControls}/>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <Footer close={dismiss}><button type="submit" className="primary" disabled={photoLoading}>Save Personnel</button></Footer>
  </form>}
  {stage==='profile'&&person&&(profileEditing?<form ref={profileForm} className="personnel-register" onSubmit={saveProfile}>
    <PersonnelFields profile={person} people={db.people}/>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <Footer close={dismiss}><button type="submit" className="primary">Save Changes</button></Footer>
  </form>:photoMode==='edit'?<form onSubmit={event=>{
    event.preventDefault()
    if(photoLoading)return
    db.setPeople(people=>people.map(record=>record.id===person.id?{...record,photo}:record))
    setPerson({...person,photo});setFailedPhoto('');resetPhoto();setPhotoMode(null)
  }}>
    <h3 ref={photoHeading} tabIndex={-1}>Update personnel photo</h3>
    {photoControls}
    <Footer close={()=>{resetPhoto();setPhotoMode(null)}}><button type="submit" className="primary" disabled={photoLoading}>Save Photo</button></Footer>
  </form>:photoMode==='full'?<>
    <h3 ref={photoHeading} tabIndex={-1}>{person.name}</h3>
    <div className="personnel-full-photo">{hasPortrait?<img src={person.photo} alt={person.name} onError={()=>setFailedPhoto(person.photo||'')}/>:<p className="muted">Photo unavailable</p>}</div>
    <footer><button type="button" className="outline" onClick={()=>setPhotoMode(null)}>Back to profile</button><button type="button" className="outline" onClick={dismiss}>Close</button></footer>
  </>:<div className="personnel-profile">
    <div className="personnel-profile-identity">
      <span className="directory-avatar" aria-hidden="true">{hasPortrait?<img src={person.photo} alt="" onError={()=>setFailedPhoto(person.photo||'')}/>:person.name.trim().split(/\s+/).map(part=>part[0]).filter((_,index,parts)=>index===0||index===parts.length-1).join('')}</span>
      <div><h3 ref={profileHeading} tabIndex={-1}>{person.name}</h3><p className="muted">{person.id} &middot; {person.position}</p></div>
      <Badge value={person.status}/>
    </div>
    <div className="personnel-profile-tabs" role="tablist" aria-label="Personnel profile sections" onKeyDown={event=>{
      const index=profileTabs.indexOf(profileTab)
      const next=event.key==='Home'?0:event.key==='End'?profileTabs.length-1:event.key==='ArrowRight'?(index+1)%profileTabs.length:event.key==='ArrowLeft'?(index+profileTabs.length-1)%profileTabs.length:-1
      if(next<0)return
      event.preventDefault()
      setProfileTab(profileTabs[next])
      event.currentTarget.querySelectorAll('button')[next]?.focus()
    }}>
      {profileTabs.map(tab=><button key={tab} type="button" id={'personnel-tab-'+tab} role="tab" aria-selected={profileTab===tab} aria-controls={'personnel-panel-'+tab} tabIndex={profileTab===tab?0:-1} onClick={()=>setProfileTab(tab)}>{tab}</button>)}
    </div>
    <section className="personnel-profile-panel" id="personnel-panel-Profile" role="tabpanel" aria-labelledby="personnel-tab-Profile" hidden={profileTab!=='Profile'}>
      {notice&&<p className="callout green" role="status">{notice}</p>}
      <div className="personnel-profile-tools"><h3>Personnel information</h3><button ref={editProfileButton} type="button" className="outline" onClick={()=>{mutationPending.current=false;setNotice('');setProfileEditing(true)}}>Edit Profile</button></div>
      <dl className="details-grid personnel-profile-facts">
        <div><dt>Personnel ID</dt><dd>{person.id}</dd></div>
        <div><dt>Full name</dt><dd>{person.name}</dd></div>
        <div><dt>Position</dt><dd>{person.position}</dd></div>
        <div><dt>Designation</dt><dd>{designationLabel(person)}</dd></div>
        <div><dt>Organizational responsibility</dt><dd>{responsibilityLabel(person)}</dd></div>
        <div className="personnel-profile-contact"><dt>Contact Number</dt><dd>{person.contact||'Not provided'}</dd></div>
        <div><dt>Personnel status</dt><dd>{person.status}</dd></div>
        <div><dt>Linked account</dt><dd>{linkedAccount?`${linkedAccount.role} · ${linkedAccount.enabled?'Enabled':'Disabled'}`:'No linked account'}</dd></div>
        {linkedAccount&&<div><dt>Effective account access</dt><dd>{linkedAccess?'Eligible to sign in':person.status==='Inactive'?'Unavailable · inactive personnel':linkedAccount.enabled?'Unavailable · account eligibility requirements not met':'Unavailable · account disabled'}</dd></div>}
      </dl>
      <div className="personnel-photo-actions">
        {hasPortrait&&<button type="button" className="outline" ref={viewPhotoButton} onClick={()=>setPhotoMode('full')}>View full photo</button>}
        <button type="button" className="outline" ref={editButton} onClick={()=>{resetPhoto(person.photo);setPhotoMode('edit')}}>{person.photo?'Update Photo':'Add Photo'}</button>
        <button type="button" className={person.status==='Active'?'danger':'outline'} onClick={()=>{mutationPending.current=false;setConfirmation(person.status==='Active'?'deactivate':'reactivate')}}>{person.status==='Active'?'Deactivate Personnel':'Reactivate Personnel'}</button>
      </div>
    </section>
    <section className="personnel-profile-panel" id="personnel-panel-Assignments" role="tabpanel" aria-labelledby="personnel-tab-Assignments" hidden={profileTab!=='Assignments'} tabIndex={0}>
      <h3>Selected Assignment</h3>
      <p className="personnel-assignment-line"><MapPin size={16} aria-hidden="true"/><strong>{profileAssignment?.location||'Not scheduled for this shift'}</strong></p>
      <p className="personnel-assignment-line"><CalendarClock size={16} aria-hidden="true"/><span>{dateLabel(date)} &middot; {start} to {end}</span></p>
      <p className="muted">Scheduled shifts do not verify attendance.</p>
      {otherAssignments.length>0&&<><h3>Other scheduled assignments</h3><ul className="personnel-profile-assignments">{otherAssignments.map(assignment=><li key={assignment.id}><strong>{assignment.location}</strong><span>{dateLabel(assignment.date)} &middot; {assignment.start} to {assignment.end}</span></li>)}</ul></>}
    </section>
    <section className="personnel-profile-panel" id="personnel-panel-Activity" role="tabpanel" aria-labelledby="personnel-tab-Activity" hidden={profileTab!=='Activity'} tabIndex={0}>
      <p className="muted">Visitor transactions and incident assignments linked to this person.</p>
      {profileActivity.length?<ol className="personnel-profile-timeline">{profileActivity.map(entry=><li key={entry.kind+entry.id}>
        <CircleCheck size={17} aria-hidden="true"/><div><strong>{entry.kind}</strong><p>{dateLabel(entry.date)} &middot; {entry.time} &middot; {entry.location}</p><small>{entry.id}</small></div>
      </li>)}</ol>:<p className="personnel-profile-empty">No linked activity recorded for this person.</p>}
    </section>
    <footer><button type="button" className="outline" onClick={dismiss}>Close</button>{profileTab==='Assignments'&&<button type="button" className="primary" onClick={()=>{
      const next=new URLSearchParams({person:person.id})
      for(const [source,target] of [['assignmentDate','date'],['assignmentTime','time']]){const value=params.get(source);if(value)next.set(target,value)}
      close();navigate({pathname:personnelAssignmentsPath,search:next.toString()})
    }}>View Assignments</button>}</footer>
  </div>)}
  </>}</Modal>}
  {confirmation&&person&&<Modal title={confirmation==='discard'?'Discard profile changes?':confirmation==='deactivate'?'Deactivate Personnel':'Reactivate Personnel'} close={keepProfile}>{dismiss=><>
    {confirmation==='discard'?<p>Your unsaved profile changes will be lost.</p>:<>
      <p><strong>{person.name} · {person.id}</strong></p>
      {confirmation==='deactivate'?<>
        <p>This person will be unavailable for new assignments. Existing schedules and operational records will be retained.</p>
        {linkedAccount&&<p>The linked Guard account will lose access while the profile is inactive. Its enabled setting will stay as recorded.</p>}
        <h3>Current and upcoming assignments</h3>
        {retainedUpcoming.length?<ul className="personnel-profile-assignments">{retainedUpcoming.map(a=><li key={a.id}><strong>{a.location}</strong><span>{dateLabel(a.date)} · {a.start} to {a.end}</span></li>)}</ul>:<p>No current or upcoming assignments recorded.</p>}
      </>:<p>This restores eligibility for new assignments. Any disabled Guard account stays disabled, and affected rosters need to be checked again.</p>}
    </>}
    <footer>
      <button ref={safeAction} className="outline" type="button" onClick={dismiss}>{confirmation==='discard'?'Keep editing':'Cancel'}</button>
      {confirmation==='discard'?<button className="danger" type="button" onClick={()=>{setConfirmation(null);finishProfileEdit()}}>Discard changes</button>:
        <button className={confirmation==='deactivate'?'danger':'primary'} type="button" onClick={confirmStatus}>{confirmation==='deactivate'?'Confirm Deactivation':'Confirm Reactivation'}</button>}
    </footer>
  </>}</Modal>}
  </>
}



