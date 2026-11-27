import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useDemo } from '../../app/store'
import { mayViewVisit } from '../auth/auth-data'
import { useCampusDate } from '../../shared/hooks/useCampusDate'
import { visitorSummary } from '../visitors/visitor-data'
import { dateLabel } from '../../data/data'
import { Badge,Heading,Panel,Select,Stats } from '../../shared/ui/ui'
import '../auth/accounts.css'

export default function GuardDashboard(){
  const db=useDemo(),today=useCampusDate()
  const location=useLocation()
  useEffect(()=>{if(location.hash==='#my-duties'){const section=document.getElementById('my-duties');section?.scrollIntoView({block:'start'});section?.focus({preventScroll:true})}},[location.hash])
  const [period,setPeriod]=useState('Today')
  const visits=db.visits.filter(visit=>mayViewVisit(db.currentUser,visit)),counts=visitorSummary(visits,today)
  const own=db.assignments.filter(a=>a.personId===db.currentUser?.personId)
  const duties=own.filter(a=>period==='All Dates'||a.date===today).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start)||a.id.localeCompare(b.id))
  return <div className="guard-dashboard"><Heading title="My Security Dashboard" subtitle={`Welcome, ${db.currentUser?.name}. View your authorized visitor records and assigned duties.`} action={<div className="page-heading-actions"><Link className="primary guard-register" to="/visitors?action=new">+ Register Visitor</Link><span className="page-heading-caption">Authorized gates: {db.currentUser?.gates.join(', ')}</span></div>}/>
    <Stats title="My shift overview" metadata={<>{dateLabel(today)} &middot; Asia/Manila</>} context="Visitor counts cover your authorized gates. Inside includes recorded visits from all dates." rows={[
      {label:'Currently Inside',value:counts.inside,note:'Visitors admitted through your authorized gates',href:'/visitors?period=All&status=Inside'},
      {label:'Entries Today',value:counts.entries,note:'Admitted visits on the current campus date',href:'/visitors?period=Today&outcome=Entered'},
      {label:'My Assignments Today',value:own.filter(a=>a.date===today).length,note:'Scheduled assignments; not verified attendance',href:'#my-duties',action:'View my duties'},
    ]}/>
    <div id="my-duties" tabIndex={-1}><Panel title="My Assigned Duties" className="my-duties" action={<Select label="Duty dates" options={['Today','All Dates']} value={period} change={setPeriod}/>}>
      {duties.length?<ul className="guard-duty-list">{duties.map(duty=><li key={duty.id}><div><h3>{duty.location}</h3><p>{dateLabel(duty.date)} &middot; {duty.start}&ndash;{duty.end}</p></div><Badge value="Scheduled"/></li>)}</ul>:<div className="empty"><strong>No assignments recorded for this period.</strong><p>Choose All Dates to review your sample assignments.</p></div>}
      <p className="guard-duty-note">Scheduled assignments do not establish physical presence. Authorized gates are account permissions; they do not confirm a duty-post mapping.</p>
    </Panel></div>
  </div>
}
