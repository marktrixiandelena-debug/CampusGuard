import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDemo } from '../../app/store'
import { analyticsPeriods, countReportBuckets, createReportBuckets, formatReportDate, reportInterval, resolveAnalyticsRange, sources } from './reporting'
import { Field, Heading, Panel, Segments, Select, Stats, Tabs } from '../../shared/ui/ui'
import { overviewTabs } from '../../app/navigation'
import './analytics.css'

const number=new Intl.NumberFormat('en-US')
const colors={visitors:'var(--navy)',incidents:'var(--text-muted)',lost:'var(--text-muted)',found:'var(--navy)',items:'var(--text-secondary)',assignments:'var(--navy-soft)'}
const tick={fontSize:12,fill:'#475569'}
const tooltipStyle={borderRadius:8,border:'1px solid #cbd5e1',fontSize:13,color:'#142d4e',maxWidth:280,whiteSpace:'normal' as const}
const share=(value:number,total:number)=>total?`${(value/total*100).toFixed(1)}%`:'0%'
type Ranking={name:string;value:number;share:string;displayValue:string}
type TimelinePoint={label:string;detail:string;visitors:number;lost:number;found:number}
type Series={key:'visitors'|'lost'|'found';name:string;color:string;dashed?:boolean}
const visitSeries:Series[]=[{key:'visitors',name:'Visitor entries',color:colors.visitors}]
const itemSeries:Series[]=[{key:'lost',name:'Lost reports',color:colors.lost},{key:'found',name:'Found reports',color:colors.found,dashed:true}]

function countScale(values:number[]){
  const maximum=Math.max(1,...values),step=Math.max(1,Math.ceil(maximum/4)),top=Math.ceil(maximum/step)*step
  return {top,ticks:Array.from({length:top/step+1},(_,i)=>i*step)}
}

function rank(rows:{name:string;value:number}[]):Ranking[]{
  const total=rows.reduce((sum,row)=>sum+row.value,0)
  return rows.sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).map(row=>({...row,share:share(row.value,total),displayValue:`${number.format(row.value)} · ${share(row.value,total)}`}))
}
function leading(rows:Ranking[],noun:string){
  const first=rows[0]
  if(!first?.value)return `No ${noun} recorded in this period.`
  const tied=rows.filter(row=>row.value===first.value).length>1
  return `${first.name}: ${number.format(first.value)} ${noun} (${first.share} of the total)${tied?'; tied for the highest count':''}.`
}
function NoRecords({name}:{name:string}){
  return <div className="analytics-empty"><strong>No {name} recorded for this period</strong><p>Try another date range or reset to the September sample.</p></div>
}
function Timeline({data,series,title,interval}:{data:TimelinePoint[];series:Series[];title:string;interval:string}){
  const scale=countScale(data.flatMap(row=>series.map(s=>row[s.key])))
  return <><div className="analytics-legend">{series.map(s=><span key={s.key}><i style={{borderColor:s.color,borderTopStyle:s.dashed?'dashed':'solid'}}/>{s.name}</span>)}</div><div className="analytics-chart">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={data} accessibilityLayer aria-label={`${title}. Use left and right arrow keys to explore exact values.`} margin={{top:16,right:18,bottom:12,left:0}}>
        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 4"/>
        <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} minTickGap={30} interval="preserveStartEnd" tickMargin={12}/>
        <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} domain={[0,scale.top]} ticks={scale.ticks} width={40}/>
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(_,payload)=>payload[0]?.payload.detail} formatter={(value,name)=>[number.format(Number(value)),name]} cursor={{stroke:'#94a3b8',strokeDasharray:'3 3'}}/>
        {series.map(s=><Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed?'6 4':undefined} dot={{r:2.5,strokeWidth:1.5,fill:'#fff'}} activeDot={{r:5}} isAnimationActive={false}/>)}
      </LineChart>
    </ResponsiveContainer>
  </div><p className="analytics-axis-caption">{series===visitSeries?'Visitor entries':'Reports'} per {interval} · campus local time{data.some(row=>row.label.endsWith('*'))?' · * Partial month':''}</p></>
}
function RankingChart({data,color,title,unit}:{data:Ranking[];color:string;title:string;unit:string}){
  const scale=countScale(data.map(row=>row.value))
  return <><div className="analytics-chart" style={{height:Math.max(250,data.length*56+56)}}><ResponsiveContainer width="100%" height="100%" minWidth={0}>
    <BarChart data={data} layout="vertical" accessibilityLayer aria-label={`${title}. Use arrow keys to explore exact values.`} margin={{top:8,right:90,bottom:12,left:0}}>
      <CartesianGrid horizontal={false} stroke="#e2e8f0" strokeDasharray="3 4"/>
      <XAxis type="number" tick={tick} axisLine={false} tickLine={false} allowDecimals={false} domain={[0,scale.top]} ticks={scale.ticks} tickMargin={8}/>
      <YAxis dataKey="name" type="category" width={110} tick={tick} axisLine={false} tickLine={false} interval={0}/>
      <Tooltip contentStyle={tooltipStyle} cursor={{fill:'#f1f5f9'}} formatter={(value,_,entry)=>[`${number.format(Number(value))} (${entry.payload.share})`,unit]}/>
      <Bar dataKey="value" name={unit} fill={color} radius={[0,4,4,0]} maxBarSize={20} isAnimationActive={false}><LabelList dataKey="displayValue" position="right" fill="#334155" fontSize={12} offset={8}/></Bar>
    </BarChart>
  </ResponsiveContainer></div><p className="analytics-axis-caption">Number of {unit.toLowerCase()} · labels show count and share</p></>
}
function RankingTable({title,data,unit}:{title:string;data:Ranking[];unit:string}){
  return <div className="analytics-table-scroll" role="region" aria-label={title} tabIndex={0}><table><caption>{title}</caption><thead><tr><th scope="col">{title.includes('Incidents')?'Category':'Location'}</th><th scope="col">{unit}</th><th scope="col">Share of total</th></tr></thead><tbody>{data.length?data.map(row=><tr key={row.name}><th scope="row">{row.name}</th><td>{number.format(row.value)}</td><td>{row.share}</td></tr>):<tr><td colSpan={3}>No scheduled assignments in this period.</td></tr>}</tbody><tfoot><tr><th scope="row">Total</th><td>{number.format(data.reduce((sum,row)=>sum+row.value,0))}</td><td>{data.some(row=>row.value)?'100%':'0%'}</td></tr></tfoot></table></div>
}

export default function Analytics(){
  const db=useDemo(),navigate=useNavigate()
  const [period,setPeriod]=useState('Calendar Month'),[source,setSource]=useState('All Modules'),[from,setFrom]=useState('2026-09-01'),[to,setTo]=useState('2026-09-30')
  const [showData,setShowData]=useState(false)
  const range=resolveAnalyticsRange(period,to,from)
  const match=(date:string)=>!!range&&date>=range.from&&date<=range.to
  const visible=(name:string)=>source==='All Modules'||source===name
  const visits=db.visits.filter(v=>match(v.date)&&v.outcome==='Entered'),incidents=db.incidents.filter(i=>match(i.date)),items=db.items.filter(i=>match(i.date)),assignments=db.assignments.filter(a=>match(a.date))
  const buckets=range?createReportBuckets(range,period):[]
  const visitorCounts=countReportBuckets(visits,buckets),lostCounts=countReportBuckets(items.filter(i=>i.type==='Lost'),buckets),foundCounts=countReportBuckets(items.filter(i=>i.type==='Found'),buckets)
  const timeline:TimelinePoint[]=buckets.map((bucket,i)=>({label:bucket.label,detail:bucket.detail,visitors:visitorCounts[i],lost:lostCounts[i],found:foundCounts[i]}))
  const interval=range?reportInterval(range,period):'day'
  const categoryForType:Record<string,string>={'Unauthorized Access':'Access-related','Suspected Theft':'Property-related','Parking-Related':'Property-related',Bullying:'Conduct-related','Protection-Related':'Conduct-related'}
  const categories=rank(['Access-related','Property-related','Conduct-related','Other'].map(name=>({name,value:incidents.filter(i=>(categoryForType[i.type]||'Other')===name).length})))
  const locations=rank([...new Set(assignments.map(a=>a.location))].map(name=>({name,value:assignments.filter(a=>a.location===name).length})))
  const lost=items.filter(i=>i.type==='Lost').length,found=items.filter(i=>i.type==='Found').length
  const peak=Math.max(0,...visitorCounts),peakIndex=visitorCounts.indexOf(peak),peakTies=visitorCounts.filter(count=>count===peak).length
  const summaryRows=[
    {module:'Gate & Access',label:'Visitor Entries',value:number.format(visits.length),note:'Admitted visits; excludes denied entries',color:colors.visitors},
    {module:'Security Incidents',label:'Incidents Recorded',value:number.format(incidents.length),note:'One count per incident record',color:colors.incidents},
    {module:'Lost & Found',label:'Lost & Found Reports',value:number.format(items.length),note:'Lost and found reports dated in this period',color:colors.items},
    {module:'Security Personnel',label:'Scheduled Assignments',value:number.format(assignments.length),note:'Planned duties; not verified attendance',color:colors.assignments},
  ].filter(row=>visible(row.module))
  const reset=()=>{setPeriod('Calendar Month');setSource('All Modules');setFrom('2026-09-01');setTo('2026-09-30')}
  const changePeriod=(value:string)=>{if(value==='Custom'&&range){setFrom(range.from);setTo(range.to)}setPeriod(value)}

  return <div className={`analytics-page${source!=='All Modules'?' analytics-single-module':''}`}>
    <Heading title="Security Analytics" subtitle="Understand recorded activity across campus security operations" action={<span className="data-badge">ILLUSTRATIVE DATA</span>}/>
    <Tabs rows={overviewTabs}/>
    <section className="panel analytics-filters" aria-label="Analytics filters">
      <div className="analytics-presets"><span className="analytics-field-label">Reporting period</span><Segments label="Analytics reporting period" options={analyticsPeriods} value={period} change={changePeriod}/></div>
      <div className="analytics-filter-controls">
        {period==='Custom'&&<Field label="From"><input aria-label="Analytics start date" type="date" value={from} max={to||undefined} required onChange={e=>setFrom(e.target.value)}/></Field>}
        <Field label={period==='Custom'?'To':period==='Calendar Month'?'Date in month':period==='Calendar Year'?'Date in year':period==='Selected Day'?'Selected date':'Period ending'}><input aria-label="Analytics end date" type="date" value={to} min={period==='Custom'?from:undefined} required onChange={e=>setTo(e.target.value)}/></Field>
        <Field label="Source module"><Select label="Analytics source module" value={source} change={setSource} options={sources}/></Field>
        <button className="outline" onClick={reset}>Reset Filters</button>
        <button className="primary analytics-reports-link" onClick={()=>navigate('/reports')}>Go to Reports →</button>
      </div>
      {range?<div className="analytics-active-range" aria-live="polite"><strong>{range.from===range.to?formatReportDate(range.from):`${formatReportDate(range.from)} – ${formatReportDate(range.to)}`}</strong><span>{source} · {interval==='hour'?'Hourly':interval==='day'?'Daily':interval==='week'?'Weekly':'Monthly'} trends · Asia/Manila</span></div>:<p className="analytics-range-error" role="alert">Choose valid dates. The start date must be on or before the end date.</p>}
    </section>
    <p className="analytics-data-note">Fictional sample records · Changes apply within this session; reloading restores the sample.</p>
    {range&&<>
      <Stats title="Period overview" metadata={source} rows={summaryRows}/>
      <div className="analytics-grid">
        {visible('Gate & Access')&&<Panel title="Visitor Entries Over Time" className="analytics-card">
          <div className="analytics-card-metric"><strong style={{color:colors.visitors}}>{number.format(visits.length)}</strong><span>admitted visitor entries</span></div>
          <p className="panel-subtitle">How does visitor traffic change during this period?</p>
          {visits.length?<Timeline data={timeline} series={visitSeries} title="Visitor entries over time" interval={interval}/>:<NoRecords name="admitted visitor entries"/>}
          <p className="analytics-takeaway">{peak?<>Peak: <strong>{number.format(peak)} entries</strong> · {buckets[peakIndex].detail}{peakTies>1?` (and ${peakTies-1} other ${interval}${peakTies>2?'s':''})`:''}.</>:'Only admitted visits count toward this trend.'}</p>
        </Panel>}
        {visible('Security Incidents')&&<Panel title="Incidents by Category" className="analytics-card">
          <div className="analytics-card-metric"><strong style={{color:colors.incidents}}>{number.format(incidents.length)}</strong><span>incidents recorded</span></div>
          <p className="panel-subtitle">Which incident categories have the most recorded cases?</p>
          {incidents.length?<RankingChart data={categories} title="Incidents by category" color={colors.incidents} unit="Incidents"/>:<NoRecords name="incidents"/>}
          <p className="analytics-takeaway">{leading(categories,'incidents')}</p>
        </Panel>}
        {visible('Lost & Found')&&<Panel title="Lost & Found Reports Over Time" className="analytics-card">
          <div className="analytics-card-metric analytics-paired-metric"><span><strong style={{color:colors.lost}}>{number.format(lost)}</strong> lost reports</span><span><strong style={{color:colors.found}}>{number.format(found)}</strong> found reports</span></div>
          <p className="panel-subtitle">How many lost and found reports were recorded?</p>
          {items.length?<Timeline data={timeline} series={itemSeries} title="Lost and found reports over time" interval={interval}/>:<NoRecords name="lost or found reports"/>}
          <div className="analytics-statuses"><span><strong>{number.format(items.filter(i=>i.status==='Returned').length)}</strong> Currently marked returned</span><span><strong>{number.format(items.filter(i=>i.status==='Possible Match').length)}</strong> Currently marked possible match</span></div>
          <p className="analytics-takeaway">Current statuses belong to reports dated in this range; they do not indicate when an item was returned or matched.</p>
        </Panel>}
        {visible('Security Personnel')&&<Panel title="Scheduled Assignments by Location" className="analytics-card">
          <div className="analytics-card-metric"><strong style={{color:colors.assignments}}>{number.format(assignments.length)}</strong><span>scheduled assignments</span></div>
          <p className="panel-subtitle">Where are the most duties scheduled? Counts are assignments, not guards.</p>
          {assignments.length?<RankingChart data={locations} title="Scheduled assignments by location" color={colors.assignments} unit="Assignments"/>:<NoRecords name="scheduled assignments"/>}
          <p className="analytics-takeaway">{leading(locations,'assignments')} Scheduled activity does not establish attendance or required-post coverage.</p>
        </Panel>}
      </div>
      <details className="panel analytics-data" open={showData} onToggle={e=>setShowData(e.currentTarget.open)}>
        <summary>Data tables <span>Exact chart values for the selected filters</span></summary>
        {showData&&<div className="analytics-table-content">
          <p>Use arrow keys to explore charts, or read the values below. Zero means no matching sample records. * marks a partial month; weekly rows show their exact included dates.</p>
          {(visible('Gate & Access')||visible('Lost & Found'))&&<div className="analytics-table-scroll" role="region" aria-label="Activity over time data" tabIndex={0}><table>
            <caption>Activity over time · {formatReportDate(range.from)} – {formatReportDate(range.to)}</caption>
            <thead><tr><th scope="col">{interval==='hour'?'Date and hour':'Date / interval'}</th>{visible('Gate & Access')&&<th scope="col">Visitor entries</th>}{visible('Lost & Found')&&<><th scope="col">Lost reports</th><th scope="col">Found reports</th></>}</tr></thead>
            <tbody>{timeline.map((row,i)=><tr key={buckets[i].key}><th scope="row">{row.detail}</th>{visible('Gate & Access')&&<td>{number.format(row.visitors)}</td>}{visible('Lost & Found')&&<><td>{number.format(row.lost)}</td><td>{number.format(row.found)}</td></>}</tr>)}</tbody>
            <tfoot><tr><th scope="row">Total</th>{visible('Gate & Access')&&<td>{number.format(visits.length)}</td>}{visible('Lost & Found')&&<><td>{number.format(lost)}</td><td>{number.format(found)}</td></>}</tr></tfoot>
          </table></div>}
          {visible('Security Incidents')&&<RankingTable title="Incidents by category" data={categories} unit="Incidents"/>}
          {visible('Security Personnel')&&<RankingTable title="Scheduled assignments by location" data={locations} unit="Assignments"/>}
        </div>}
      </details>
    </>}
  </div>
}
