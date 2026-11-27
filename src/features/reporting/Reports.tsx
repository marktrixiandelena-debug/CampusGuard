import { useState } from 'react'
import { useDemo } from '../../app/store'
import { TODAY } from '../../data/data'
import { inReportPeriod, sources, isReportDate, shiftReportDate, formatReportDate } from './reporting'
import { Badge, Empty, Field, Footer, Heading, Modal, Panel, SearchBox, Segments, Select, Tabs } from '../../shared/ui/ui'
import { overviewTabs } from '../../app/navigation'
import { DashboardContext } from '../dashboard/DashboardContext'

type Archive={type:string;period:string;date:string;kind:string}
const archive:Archive[]=[{type:'Daily Report',period:'Oct 19, 2026',date:TODAY,kind:'Daily'},{type:'Weekly Report',period:'Oct 13–19, 2026',date:TODAY,kind:'Weekly'},{type:'Monthly Report',period:'September 2026',date:'2026-09-30',kind:'Monthly'},{type:'Yearly Report',period:'January–December 2026',date:'2026-12-31',kind:'Yearly'}]
const modules=sources.slice(1)
type ReportSettings={period:string;date:string;from:string;scope:string;included:string[]}
const defaults:ReportSettings={period:'Daily',date:TODAY,from:TODAY,scope:'All Modules',included:modules}
type ReportSnapshot={period:string;from:string;to:string;included:string[]}
type ReportDialog=
  | {stage:'generate';draft:ReportSettings}
  | {stage:'preview';snapshot:ReportSnapshot}
  | {stage:'details'|'regenerate';row:Archive}
  | {stage:'notice';snapshot?:ReportSnapshot}
type ReportState={committed:ReportSettings;dialog:ReportDialog|null;opener:HTMLButtonElement|null}

function copySettings(settings:ReportSettings){return {...settings,included:[...settings.included]}}

function validate(settings:ReportSettings){
  const {date,from,period,scope,included}=settings
  const effective=modules.filter(module=>included.includes(module)&&(scope==='All Modules'||scope===module))
  const validDates=isReportDate(date)&&(period!=='Custom'||(isReportDate(from)&&from<=date))
  return {effective,validDates}
}

function reportRange({period,date,from}:ReportSettings){
  if(period==='Custom')return {from,to:date}
  if(period==='Weekly')return {from:shiftReportDate(date,-6),to:date}
  if(period==='Monthly'){
    const start=date.slice(0,7)+'-01'
    const lastDay=new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),0)).getUTCDate()
    return {from:start,to:shiftReportDate(start,lastDay-1)}
  }
  if(period==='Yearly')return {from:date.slice(0,4)+'-01-01',to:date.slice(0,4)+'-12-31'}
  return {from:date,to:date}
}
function rangeLabel({from,to}:Pick<ReportSnapshot,'from'|'to'>){
  return from===to?formatReportDate(from):formatReportDate(from)+' to '+formatReportDate(to)
}
function snapshot(settings:ReportSettings):ReportSnapshot|null{
  const {effective,validDates}=validate(settings)
  if(!validDates||!effective.length)return null
  return {period:settings.period,...reportRange(settings),included:effective}
}

function SettingsFields({settings,change}:{settings:ReportSettings;change:(patch:Partial<ReportSettings>)=>void}){
  const {period,date,from,scope}=settings
  const custom=period==='Custom'
  return <div className={'report-config'+(custom?' report-config-custom':'')}>
    <div className="report-period"><Field label="REPORTING PERIOD"><Segments label="Report period" options={['Daily','Weekly','Monthly','Yearly','Custom']} value={period} change={period=>change({period})}/></Field></div>
    {custom&&<Field label="Start Date"><input aria-label="Report start date" type="date" value={from} max={date} onChange={e=>change({from:e.target.value})}/></Field>}
    <Field label={custom?'End Date':'Report Date'}><input aria-label="Report date" type="date" value={date} min={custom?from:undefined} onChange={e=>change({date:e.target.value})}/></Field>
    <Field label="Include records from"><Select label="Report source module" value={scope} change={scope=>change({scope})} options={sources}/></Field>
  </div>
}

function ReportSummary({report}:{report:ReportSnapshot}){
  return <><p className="muted">{report.period} · {rangeLabel(report)}</p><p className="muted">Included: {report.included.join(', ')}</p></>
}

const dateError='Choose valid dates, with the start date before or on the end date.'

export default function Reports(){
  const db=useDemo()
  const [{committed,dialog,opener},setReport]=useState<ReportState>(()=>({committed:copySettings(defaults),dialog:null,opener:null}))
  const [filter,setFilter]=useState('All Periods'),[search,setSearch]=useState('')
  const {effective,validDates}=validate(committed)
  const draft=dialog?.stage==='generate'?dialog.draft:null
  const draftValidation=draft?validate(draft):null
  const invalidDraft=!!draftValidation&&(!draftValidation.validDates||!draftValidation.effective.length)

  function openDialog(button:HTMLButtonElement,make:(settings:ReportSettings)=>ReportDialog|null){
    setReport(state=>{
      if(state.dialog)return state
      const next=make(state.committed)
      return next?{...state,dialog:next,opener:button}:state
    })
  }
  function close(){
    setReport(state=>({...state,dialog:null,opener:null}))
    requestAnimationFrame(()=>{if(opener?.isConnected&&!document.querySelector('dialog[open]'))opener.focus()})
  }
  function changeCommitted(patch:Partial<ReportSettings>){
    setReport(state=>({...state,committed:{...state.committed,...patch}}))
  }
  function changeDraft(update:(draft:ReportSettings)=>ReportSettings){
    setReport(state=>state.dialog?.stage==='generate'?{...state,dialog:{stage:'generate',draft:update(state.dialog.draft)}}:state)
  }
  function applyDraft(stage:'preview'|'notice'){
    setReport(state=>{
      if(state.dialog?.stage!=='generate')return state
      const output=snapshot(state.dialog.draft)
      if(!output)return state
      return {...state,committed:copySettings(state.dialog.draft),dialog:{stage,snapshot:output}}
    })
  }
  function openPreview(settings:ReportSettings):ReportDialog|null{
    const output=snapshot(settings)
    return output?{stage:'preview',snapshot:output}:null
  }

  const preview=dialog?.stage==='preview'?dialog.snapshot:null
  const matches=(date:string)=>!!preview&&inReportPeriod(date,'Custom',preview.to,preview.from,preview.to)
  const has=(module:string)=>preview?.included.includes(module)
  const rows=archive.filter(a=>(filter==='All Periods'||a.kind===filter)&&`${a.type} ${a.period}`.toLowerCase().includes(search.toLowerCase()))

  return <><DashboardContext/><Heading title="Security Reports" subtitle="Consolidated security reports and archived summaries" action={<span className="data-badge">ILLUSTRATIVE DATA</span>}/><Tabs rows={overviewTabs}/>
    <Panel title="Prepare Security Report" action={<span className="data-badge">PDF · V1 priority</span>}>
      <p className="panel-subtitle">Choose the period and records to include.</p>
      <div className="report-settings">
        <SettingsFields settings={committed} change={changeCommitted}/>
        {validDates?<p className="muted">Covered dates: {rangeLabel(reportRange(committed))}</p>:<p className="error-text" role="alert">{dateError}</p>}
        {effective.length?<p className="muted">Included: {effective.join(', ')}</p>:<p className="error-text" role="alert">No included modules match the selected scope. Change the scope or open PDF export settings to select a matching module.</p>}
        <div className="report-actions"><small className="muted" style={{marginRight:'auto'}}>PDF export is a demonstration; no file will be created.</small>
          <button className="primary" disabled={!validDates||!effective.length} onClick={e=>openDialog(e.currentTarget,openPreview)}>Preview Report</button>
          <button className="outline" onClick={e=>openDialog(e.currentTarget,settings=>({stage:'generate',draft:copySettings(settings)}))}>PDF export settings</button>
        </div>
      </div>
    </Panel>
    <Panel className="report-archive" title="Sample Report Archive" action={<div className="filter-row" style={{padding:0}}><Select label="Archive period" value={filter} change={setFilter} options={['All Periods','Daily','Weekly','Monthly','Yearly']}/><SearchBox value={search} change={setSearch} placeholder="Search reports..."/></div>}>
      <p className="panel-subtitle">Example archive rows show the intended structure, not actual generated files.</p>
      <div className="table-scroll"><table className="record-table-headers"><thead><tr>{['Report Type','Period','Source','Sample Status','Actions'].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{rows.length?rows.map(a=><tr key={a.type}><td>{a.type}</td><td>{a.period}</td><td>Four modules</td><td><Badge value="Sample only"/></td><td><div className="report-actions" style={{padding:0,border:0,margin:0,justifyContent:'flex-start'}}>
        <button className="outline" onClick={e=>openDialog(e.currentTarget,()=>openPreview({...defaults,period:a.kind,date:a.date,from:a.date}))}>Preview</button>
        <button className="outline" onClick={e=>openDialog(e.currentTarget,()=>({stage:'details',row:a}))}>Details</button>
      </div></td></tr>):<Empty columns={5}/>}</tbody></table></div>
      <p className="chart-description">These examples are not saved files.</p>
    </Panel>
    <details className="panel" style={{padding:20,marginBottom:18}}><summary>About reports</summary><div className="two-column"><Panel title="Reporting Workflow"><p className="panel-subtitle">Records are the source of truth, not previously exported PDFs.</p><div className="filter-row"><span className="badge">1 · Read operational records</span><span className="badge">2 · Calculate period totals</span><span className="badge">3 · Generate PDF & archive</span></div></Panel><Panel title="Reporting Rules"><div className="report-settings"><p className="muted">V1: Consolidated reports, PDF preview/export, archive.</p><p className="muted block">Planned: Scheduled generation, custom filters, CSV export.</p><p className="muted block">Privacy: aggregated data by default.</p></div></Panel></div></details>
    {dialog&&<Modal key={dialog.stage} title={({generate:'PDF Export Settings',preview:'Security Operations Report Preview',details:'Archived Report Details',regenerate:'Regenerate Security Report',notice:'Prototype Action'})[dialog.stage]} close={close}>{dismiss=><>
      {draft&&draftValidation&&<>
        <SettingsFields settings={draft} change={patch=>changeDraft(settings=>({...settings,...patch}))}/>
        {!draftValidation.validDates&&<p className="error-text" role="alert">{dateError}</p>}
        <h3 id="report-source-modules">Include source-module summaries</h3>
        <div className="checks" role="group" aria-labelledby="report-source-modules" aria-describedby={!draftValidation.effective.length?'report-source-error':undefined}>
          {modules.map(module=><label key={module}><input type="checkbox" checked={draft.included.includes(module)} onChange={e=>{
            const checked=e.target.checked
            changeDraft(settings=>({...settings,included:checked?[...settings.included,module]:settings.included.filter(value=>value!==module)}))
          }}/>{module}</label>)}
        </div>
        {!draftValidation.effective.length&&<p id="report-source-error" className="error-text" role="alert">{draft.scope==='All Modules'?'Select at least one source module.':`Include ${draft.scope} or choose a different source scope.`}</p>}
        <div className="callout info">Privacy-first output. This demo uses aggregated fictional data only.</div>
        <Footer close={dismiss}>
          <button className="outline" disabled={invalidDraft} onClick={()=>applyDraft('preview')}>Preview Report</button>
          <button className="outline" disabled={invalidDraft} onClick={()=>applyDraft('notice')}>PDF Export (Demo)</button>
        </Footer>
      </>}
      {preview&&<><div className="detail-heading"><strong>University of Nueva Caceres · Security Operations</strong><Badge value="Sample Preview"/></div><ReportSummary report={preview}/>{![...(has('Gate & Access')?db.visits:[]),...(has('Security Incidents')?db.incidents:[]),...(has('Lost & Found')?db.items:[]),...(has('Security Personnel')?db.assignments:[])].some(record=>matches(record.date))&&<p className="callout">No records for this period.</p>}{has('Gate & Access')&&<div className="report-preview-section"><strong>Gate & Access</strong><p>{db.visits.filter(v=>matches(v.date)&&v.outcome==='Entered').length} admitted visitor entries and {db.visits.filter(v=>matches(v.date)&&v.vehicle!=='No'&&v.outcome==='Entered').length} vehicle entries recorded.</p></div>}{has('Security Incidents')&&<div className="report-preview-section"><strong>Security Incidents</strong><p>{db.incidents.filter(i=>matches(i.date)).length} unique incidents; {db.incidents.filter(i=>matches(i.date)&&i.status==='Open').length} currently open records reported during this period.</p></div>}{has('Lost & Found')&&<div className="report-preview-section"><strong>Lost & Found</strong><p>{db.items.filter(i=>matches(i.date)).length} item reports and {db.items.filter(i=>matches(i.date)&&i.status==='Possible Match').length} current possible-match indicators among those reports.</p></div>}{has('Security Personnel')&&<div className="report-preview-section"><strong>Security Personnel</strong><p>{db.assignments.filter(a=>matches(a.date)).length} scheduled assignments; not verified attendance.</p></div>}<div className="callout info">Data protection and traceability. Aggregate report figures come from distinct source records; no personal identifiers are included.</div><Footer close={dismiss}><button className="primary" onClick={()=>setReport(state=>state.dialog?.stage==='preview'?{...state,dialog:{stage:'notice',snapshot:state.dialog.snapshot}}:state)}>PDF Export (Demo)</button></Footer></>}
      {dialog.stage==='details'&&<><dl className="details-grid">{[['Report Type',dialog.row.type],['Period',dialog.row.period],['Source','Four CampusGuard modules'],['File State','Not generated; sample only'],['Access','Demonstration only'],['Version History','No files or versions created']].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><div className="callout amber">Sample archive entry. Real files require creation timestamps, staff identity, version numbers and controlled access.</div><Footer close={dismiss}><button className="primary" onClick={()=>setReport(state=>state.dialog?.stage==='details'?{...state,dialog:{stage:'regenerate',row:state.dialog.row}}:state)}>Request Regeneration</button></Footer></>}
      {dialog.stage==='regenerate'&&<form onSubmit={e=>{e.preventDefault();setReport(state=>state.dialog?.stage==='regenerate'?{...state,dialog:{stage:'notice'}}:state)}}><div className="callout amber">Authorization required. This frontend demonstrates the action only.</div><Field label="Report"><input value={`${dialog.row.type} · ${dialog.row.period}`} disabled/></Field><Field label="Reason for regeneration *"><textarea required placeholder="Describe corrected source records or approved amendments."/></Field><div className="callout info">Recalculate from original records, not a previously exported PDF.</div><Footer close={dismiss}><button className="outline" type="submit">Regenerate (Authorized)</button></Footer></form>}
      {dialog.stage==='notice'&&<><p>No PDF was generated or modified.</p>{dialog.snapshot&&<ReportSummary report={dialog.snapshot}/>}<div className="callout">This click demonstrates where PDF generation, file download, or authorized report regeneration will happen. This frontend uses fictional local data only.</div><Footer close={dismiss}/></>}
    </>}</Modal>}
  </>
}
