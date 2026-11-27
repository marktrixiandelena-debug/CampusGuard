import { personnelAssignmentsPath } from '../../app/navigation'
import { useCampusDate } from '../../shared/hooks/useCampusDate'
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CalendarDays, CheckCircle2, DoorOpen, FileText, PackagePlus, PackageSearch, ShieldAlert, UsersRound } from 'lucide-react'
import { Badge, Segments, Tabs } from '../../shared/ui/ui'
import { overviewTabs } from '../../app/navigation'
import { useDemo } from '../../app/store'
import { TODAY } from '../../data/data'
import { formatReportDate } from '../reporting/reporting'
import { dashboardHref, dashboardShift, getDashboardSummary, logbooks, recentLogbookEntries } from './dashboard-data'
import type { Logbook } from './dashboard-data'
import './dashboard.css'

const number=new Intl.NumberFormat('en-US')

export default function Dashboard(){
  const campusToday=useCampusDate()
  const db=useDemo(),counts=getDashboardSummary(db,TODAY,campusToday)
  const [logbook,setLogbook]=useState<Logbook>('incidents')
  const recent=recentLogbookEntries(db,logbook)
  const cards=[
    {key:'visitors',label:'Visitor entries today',value:counts.visitors,note:`Admitted visits - ${formatReportDate(campusToday)} (Manila)`,action:'View visitor logbook',icon:DoorOpen,color:'blue',href:dashboardHref('/visitors',{view:'today-entries'})},
    {key:'incidents',label:'Incidents to follow up',value:counts.unresolved,note:'Open or monitored · all dates',action:'Review incidents',icon:ShieldAlert,color:'red',href:dashboardHref('/incidents',{view:'unresolved'})},
    {key:'items',label:'Found items to return',value:counts.awaitingReturn,note:'Awaiting return · all dates',action:'View found items',icon:PackageSearch,color:'amber',href:dashboardHref('/lost-found',{view:'awaiting-return'})},
    {key:'guards',label:'Guards scheduled',value:counts.scheduled,note:'6am–2pm · legacy planned duty',action:'View personnel assignments',icon:UsersRound,color:'teal',href:dashboardHref(personnelAssignmentsPath,{source:'legacy',date:TODAY,...dashboardShift})},
  ]
  const attention=[
    {key:'open',label:'Open incidents',value:counts.open,description:'Review cases that still need a response.',tone:'red',href:dashboardHref('/incidents',{view:'open'})},
    {key:'overdue',label:'Found items marked overdue',value:counts.overdue,description:'Check the item records and follow up.',tone:'amber',href:dashboardHref('/lost-found',{view:'overdue-found'})},
    {key:'matches',label:'Item reports to review',value:counts.possibleMatch,description:'Check possible matches before confirming ownership.',tone:'blue',href:dashboardHref('/lost-found',{view:'possible-match'})},
    {key:'monitoring',label:'Incidents being monitored',value:counts.monitored,description:'Check whether these cases need an update.',tone:'blue',href:dashboardHref('/incidents',{view:'monitoring'})},
  ].filter(row=>row.value>0)
  const actions=[
    {label:'Record an incident',note:'Open a new incident report',icon:ShieldAlert,href:dashboardHref('/incidents',{action:'new'})},
    {label:'Record a lost or found item',note:'Add an item to the logbook',icon:PackagePlus,href:dashboardHref('/lost-found',{action:'new'})},
    {label:'View personnel assignments',note:'See the recorded sample shift',icon:CalendarDays,href:dashboardHref(personnelAssignmentsPath,{source:'legacy',date:TODAY,...dashboardShift})},
    {label:'Prepare daily report',note:'Open the report setup for the sample date',icon:FileText,href:dashboardHref('/reports')},
  ]

  return <div className="dashboard-page">
    <div className="page-heading"><div><h1>Security Dashboard</h1><p>Review the logbooks and follow up on work that needs attention.</p></div><span className="data-badge">ILLUSTRATIVE DATA</span></div>
    <Tabs rows={overviewTabs}/>
    <div className="dashboard-date"><CalendarDays size={17} aria-hidden="true"/><strong>{formatReportDate(TODAY,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong><span>Duty schedule sample date; visitor totals use the current campus date</span></div>
    <section className="summaries dashboard-summaries" aria-label="Operations summary">
      {cards.map(card=><Link to={card.href} className={`panel summary dashboard-kpi dashboard-${card.color}`} key={card.key} data-metric={card.key}>
        <div className="dashboard-kpi-heading"><h2>{card.label}</h2><card.icon size={20} aria-hidden="true"/></div>
        <strong>{number.format(card.value)}</strong><p>{card.note}</p>
        <span className="dashboard-kpi-action">{card.action}<ArrowRight size={15} aria-hidden="true"/></span>
      </Link>)}
    </section>
    <div className="dashboard-work-grid">
      <section className="panel dashboard-attention" aria-labelledby="dashboard-attention-title">
        <header className="dashboard-section-heading"><div><h2 id="dashboard-attention-title">Needs attention</h2><p>Outstanding work across all dates</p></div></header>
        {attention.length?<ul className="dashboard-attention-list">{attention.map(row=><li key={row.key}><Link to={row.href} className="dashboard-attention-row" data-attention={row.key}>
          <span className={`dashboard-task-count dashboard-${row.tone}`}>{number.format(row.value)}</span>
          <span className="dashboard-task-copy"><strong>{row.label}</strong><span>{row.description}</span></span>
          <span className="dashboard-review-label">Review <ArrowRight size={16} aria-hidden="true"/></span>
        </Link></li>)}</ul>:<div className="dashboard-clear-state"><CheckCircle2 size={30} aria-hidden="true"/><strong>No outstanding items to review.</strong><p>You can still open the logbooks or record something new.</p></div>}
      </section>
      <section className="panel dashboard-quick-actions" aria-labelledby="dashboard-actions-title">
        <header className="dashboard-section-heading"><div><h2 id="dashboard-actions-title">Quick actions</h2><p>Start a common task</p></div></header>
        <ul>{actions.map(action=><li key={action.label}><Link to={action.href}><action.icon size={21} aria-hidden="true"/><span><strong>{action.label}</strong><small>{action.note}</small></span><ArrowRight size={16} aria-hidden="true"/></Link></li>)}</ul>
      </section>
    </div>
    <section className="panel dashboard-logbook" aria-labelledby="dashboard-logbook-title">
      <header className="dashboard-section-heading"><div><h2 id="dashboard-logbook-title">Recent logbook entries</h2><p>The five most recent records in the selected logbook</p></div><Link className="dashboard-view-all" to={dashboardHref(logbooks[logbook].path,{view:'all'})}>View all <span className="dashboard-visually-hidden">{logbooks[logbook].label} records</span><ArrowRight size={16} aria-hidden="true"/></Link></header>
      <div className="dashboard-logbook-controls"><Segments label="Choose a logbook" options={Object.values(logbooks).map(book=>book.label)} value={logbooks[logbook].label} change={value=>setLogbook((Object.keys(logbooks) as Logbook[]).find(key=>logbooks[key].label===value)||'incidents')}/></div>
      <div aria-live="polite" className="dashboard-visually-hidden">{logbooks[logbook].label}: {recent.length} recent {recent.length===1?'record':'records'}</div>
      {recent.length?<>
        <div className="dashboard-logbook-columns" aria-hidden="true"><span>Date and time</span><span>Record</span><span>Location</span><span>Current status</span><span/></div>
        <ul className="dashboard-logbook-entries" aria-label={`Recent ${logbooks[logbook].label.toLowerCase()} records`}>{recent.map(entry=><li key={entry.id}>
          <time dateTime={`${entry.date}T${entry.time}+08:00`}><span>{formatReportDate(entry.date)}</span><small>{entry.time}</small></time>
          <div className="dashboard-record-name"><strong>{entry.title}</strong><small>{entry.id}</small></div>
          <span className="dashboard-record-location">{entry.location}</span>
          <span className="dashboard-record-status"><Badge value={entry.status}/></span>
          <Link className="dashboard-record-link" to={dashboardHref(logbooks[logbook].path,{view:'all',record:entry.id})} aria-label={`View record ${entry.id}`}>View record <ArrowRight size={15} aria-hidden="true"/></Link>
        </li>)}</ul>
      </>:<div className="dashboard-logbook-empty"><strong>No {logbooks[logbook].label.toLowerCase()} records yet.</strong><p>New records will appear here when they are added to the logbook.</p></div>}
    </section>
    <p className="dashboard-sample-note">Fictional sample records. Changes stay in this session; reloading restores the sample.</p>
  </div>
}
