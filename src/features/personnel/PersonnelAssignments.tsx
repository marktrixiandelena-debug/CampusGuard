import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDemo } from '../../app/store'
import { useCampusDate } from '../../shared/hooks/useCampusDate'
import { Badge, Field, Heading, SearchBox, Segments } from '../../shared/ui/ui'
import { formatReportDate, isReportDate } from '../reporting/reporting'
import { weeklyDraftPath } from './WeeklyDutySchedule'
import { formatDutyTour } from './weekly-duty-template'
import { validDeploymentTime, weeklyDeployment } from './deployment'
import { CampusMap, ManageCampusMap } from './CampusMap'
import './personnel-assignments.css'

type DeploymentRow = {
  id:string; name?:string; personId?:string; designation?:string; duty:string; description?:string;
  hours:string; carry?:boolean; overnight?:boolean; locations:string[]; postIds:string[];
}

export default function PersonnelAssignments(){
  const db=useDemo(),today=useCampusDate()
  const [params,setParams]=useSearchParams()
  const [managing,setManaging]=useState(false)
  const legacy=params.get('source')==='legacy'
  const suppliedDate=params.get('date')||''
  const date=isReportDate(suppliedDate)?suppliedDate:today
  const suppliedTime=params.get('time')||''
  const time=validDeploymentTime(suppliedTime)?suppliedTime:''
  const search=params.get('search')||'',personId=params.get('person')||''
  const start=params.get('start')||'',end=params.get('end')||''
  const legacyShift=validDeploymentTime(start)&&validDeploymentTime(end)&&start<end
  const post=db.posts.find(item=>item.id===params.get('post'))
  const mode=params.get('view')==='map'||(!params.has('view')&&db.mapPhoto)?'Map View':'List View'
  const candidates=legacy?[]:weeklyDeployment(db.weeklyDrafts,date,time)
  const selected=candidates.length===1?candidates[0]:candidates.find(entry=>entry.roster.id===params.get('schedule'))
  const roster=selected?.roster
  const query=search.trim().toLowerCase()

  function update(values:Record<string,string>,replace=false){
    const next=new URLSearchParams(params)
    Object.entries(values).forEach(([key,value])=>value?next.set(key,value):next.delete(key))
    setParams(next,{replace})
  }
  const rows:DeploymentRow[]=legacy?db.assignments.filter(a=>a.date===date&&
    (!legacyShift||(a.start===start&&a.end===end))&&(!time||(a.start<=time&&time<a.end))
  ).map(a=>{
    const person=db.people.find(p=>p.id===a.personId)
    return {id:a.id,personId:a.personId,name:person?.name??a.personId,designation:person?.designation,
      duty:'Guard assignment',hours:formatDutyTour(a),locations:[a.location],
      postIds:db.posts.filter(item=>item.legacyName===a.location).map(item=>item.id)}
  }):(selected?.duties??[]).map(({duty,day,carry})=>{
    const postIds=db.dutyPostLinks[duty.number]??[]
    return {id:day+'-'+duty.number,name:duty.personnel?.name,personId:duty.personnel?.id,designation:duty.personnel?.designation,
      duty:duty.name,description:[duty.designation,duty.details].filter(Boolean).join(' · '),hours:formatDutyTour(duty),
      carry,overnight:duty.end<duty.start,postIds,locations:db.posts.filter(item=>postIds.includes(item.id)).map(item=>item.name)}
  })
  const personnelMatches=rows.filter(row=>(!personId||row.personId===personId)&&
    [row.name,row.personId,row.designation].join(' ').toLowerCase().includes(query))
  const atPost=post?rows.filter(row=>row.postIds.includes(post.id)):rows
  const visible=post?personnelMatches.filter(row=>row.postIds.includes(post.id)):personnelMatches
  const matchingPosts=new Set(personnelMatches.flatMap(row=>row.postIds))
  const assigned=rows.filter(row=>row.personId).length
  const assignedAtPost=atPost.filter(row=>row.personId).length
  const personnelCount=new Set(rows.map(row=>row.personId).filter(Boolean)).size
  const empty=legacy&&!rows.length?'No legacy assignments for the selected date and time.':
    !legacy&&!candidates.length?'No saved schedule for the selected date and time.':
    !legacy&&!selected?'Choose a weekly schedule to view its duties.':
    !atPost.length?post?'No scheduled duties at this post for the selected time.':'No duties are scheduled for the selected time.':
    'No duties match the personnel filters.'
  const scheduleName=(start:string,end:string)=>formatReportDate(start)+' – '+formatReportDate(end)

  function profileLink(id:string){
    return '/personnel?'+new URLSearchParams({profile:id,assignmentDate:date,...(time?{assignmentTime:time}:{})})
  }

  return <section className="deployment">
    <Heading title="Personnel Assignments" subtitle="View planned campus deployment. Scheduled duties do not confirm attendance."
      action={<button className="outline" type="button" onClick={()=>setManaging(true)}>Manage Map</button>}/>
    <div className="panel deployment-filters">
      <Field label="Assignment source"><select value={legacy?'legacy':'weekly'} onChange={e=>update({source:e.target.value==='legacy'?'legacy':'',schedule:'',start:'',end:''})}>
        <option value="weekly">Weekly schedules</option><option value="legacy">Legacy assignments</option>
      </select></Field>
      <Field label="Campus date"><input type="date" value={date} onChange={e=>{if(isReportDate(e.target.value))update({date:e.target.value,schedule:''})}}/></Field>
      <Field label="Time"><select value={time?'specific':'all'} onChange={e=>update({time:e.target.value==='specific'?'06:00':'',schedule:''})}>
        <option value="all">All Hours</option><option value="specific">Specific time</option>
      </select></Field>
      {time&&<Field label="Campus time"><input type="time" value={time} onChange={e=>{if(validDeploymentTime(e.target.value))update({time:e.target.value,schedule:''})}}/></Field>}
      <div className="deployment-search"><SearchBox value={search} change={value=>update({search:value},true)} placeholder="Search name, ID or designation"/></div>
      <Field label="Personnel"><select name="person" value={personId} onChange={e=>update({person:e.target.value})}>
        <option value="">All personnel</option>
        {personId&&!db.people.some(p=>p.id===personId)&&<option value={personId}>{personId}</option>}
        {db.people.map(person=><option key={person.id} value={person.id}>{person.name} · {person.id}</option>)}
      </select></Field>
      <Field label="Campus post"><select value={post?.id??''} onChange={e=>update({post:e.target.value})}>
        <option value="">All posts</option>{db.posts.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      {!legacy&&candidates.length>1&&<Field label="Weekly schedule"><select value={roster?.id??''} onChange={e=>update({schedule:e.target.value})}>
        <option value="">Choose a schedule</option>{candidates.map(({roster:item,duties})=><option key={item.id} value={item.id}>
          {scheduleName(item.start,item.end)} · Draft{duties.length&&duties.every(duty=>duty.carry)?' · Overnight carryover':''}
        </option>)}
      </select></Field>}
    </div>
    <div className="deployment-toolbar">
      <Segments label="Assignment view" options={['List View','Map View']} value={mode} change={value=>update({view:value==='Map View'?'map':'list'})}/>
      {legacy&&legacyShift&&<button className="outline" type="button" onClick={()=>update({start:'',end:''})}>Clear shift · {formatDutyTour({start,end})}</button>}
      {(personId||search||post)&&<button className="text-button" type="button" onClick={()=>update({person:'',search:'',post:''})}>Clear personnel and post filters</button>}
    </div>
    <div className={mode==='Map View'?'deployment-layout':'deployment-layout list-only'}>
      {mode==='Map View'&&<CampusMap selected={post?.id} onSelect={id=>update({post:id})} highlighted={personId||search?matchingPosts:undefined}/>}
      <section className="panel deployment-results" aria-labelledby="deployment-results-title">
        <header>
          <div><h2 id="deployment-results-title">{post?.name??'Scheduled deployment'}</h2>
            <p className="muted">{formatReportDate(date)} · {time||'All Hours'} · Asia/Manila</p>
          </div>
          {legacy?<Badge value="Legacy assignments"/>:roster&&<Badge value="Draft"/>}
        </header>
        {roster&&<p className="deployment-source"><Link to={weeklyDraftPath+roster.id}>Weekly schedule · {scheduleName(roster.start,roster.end)}</Link></p>}
        {(legacy||!!roster)&&<p className="deployment-count" role="status">{legacy?
          `${personnelCount} personnel · ${rows.length} recorded assignments`:
          `${assigned} assigned · ${rows.length-assigned} vacant · ${rows.length} duties`}{visible.length!==rows.length&&` · ${visible.length} shown`}</p>}
        {post&&roster&&atPost.length>0&&<p className="deployment-count">At this post · {assignedAtPost} assigned · {atPost.length-assignedAtPost} vacant</p>}
        {visible.length?<table className="deployment-table"><thead><tr>
          <th scope="col">Duty / Location</th><th scope="col">Tour of duty</th><th scope="col">Personnel</th>
        </tr></thead><tbody>{visible.map(row=><tr key={row.id} data-deployment-row={row.id}>
          <th scope="row">{row.duty}{row.description&&<small>{row.description}</small>}<small>{row.locations.join(', ')||'No campus post linked'}</small></th>
          <td>{row.hours}{row.carry?<small>Continues from previous day</small>:row.overnight&&<small>Ends next day</small>}</td>
          <td>{row.personId&&row.name?<>
            {db.people.some(person=>person.id===row.personId)?<Link to={profileLink(row.personId)}>{row.name}</Link>:row.name}
            {row.designation&&<small>{row.designation}</small>}<small>{legacy?'Recorded':'Assigned'}</small>
          </>:<Badge value="Vacant"/>}</td>
        </tr>)}</tbody></table>:<p className="empty">{empty}</p>}
      </section>
    </div>
    {managing&&<ManageCampusMap close={()=>setManaging(false)}/>}
  </section>
}

