import { TODAY } from '../../data/data.ts'
export function inReportPeriod(date:string,period:string,anchor=TODAY,from=anchor,to=anchor){
  if(period==='Custom')return date>=from&&date<=to
  if(period==='Month'||period==='Monthly')return date.slice(0,7)===anchor.slice(0,7)
  if(period==='Year'||period==='Yearly')return date.slice(0,4)===anchor.slice(0,4)
  if(period==='Week'||period==='Weekly')return date>=shiftReportDate(anchor,-6)&&date<=anchor
  return date===anchor
}
export const sources=['All Modules','Gate & Access','Security Incidents','Lost & Found','Security Personnel']

export const analyticsPeriods=['Selected Day','Last 7 Days','Last 30 Days','Calendar Month','Calendar Year','Custom']
export type ReportRange={from:string;to:string}
export type ReportBucket=ReportRange&{key:string;label:string;detail:string;hour?:number}
export type ReportInterval='hour'|'day'|'week'|'month'
const dayMs=86_400_000

// Campus-local calendar dates are not instants. UTC arithmetic keeps browser
// timezones and daylight-saving changes from shifting their boundaries.
function calendarDate(date:string){return new Date(`${date}T00:00:00Z`)}
export function isReportDate(date:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false
  const parsed=calendarDate(date)
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date
}
export function shiftReportDate(date:string,days:number){
  const parsed=calendarDate(date)
  parsed.setUTCDate(parsed.getUTCDate()+days)
  return parsed.toISOString().slice(0,10)
}
export function formatReportDate(date:string,options:Intl.DateTimeFormatOptions={month:'short',day:'numeric',year:'numeric'}){
  return new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(calendarDate(date))
}
export function resolveAnalyticsRange(period:string,anchor:string,from=anchor):ReportRange|null{
  if(!isReportDate(anchor))return null
  if(period==='Custom')return isReportDate(from)&&from<=anchor?{from,to:anchor}:null
  if(period==='Last 7 Days'||period==='Last 30 Days')return {from:shiftReportDate(anchor,period==='Last 7 Days'?-6:-29),to:anchor}
  if(period==='Calendar Month'){
    const end=calendarDate(`${anchor.slice(0,7)}-01`)
    end.setUTCMonth(end.getUTCMonth()+1)
    end.setUTCDate(0)
    return {from:`${anchor.slice(0,7)}-01`,to:end.toISOString().slice(0,10)}
  }
  if(period==='Calendar Year')return {from:`${anchor.slice(0,4)}-01-01`,to:`${anchor.slice(0,4)}-12-31`}
  return {from:anchor,to:anchor}
}
export function reportInterval(range:ReportRange,period:string):ReportInterval{
  if(period==='Selected Day')return 'hour'
  if(period==='Calendar Year')return 'month'
  const days=(calendarDate(range.to).getTime()-calendarDate(range.from).getTime())/dayMs+1
  return days<=31?'day':days<=180?'week':'month'
}
export function createReportBuckets(range:ReportRange,period:string):ReportBucket[]{
  const interval=reportInterval(range,period)
  if(interval==='hour')return Array.from({length:24},(_,hour)=>{
    const label=`${String(hour).padStart(2,'0')}:00`
    return {...range,hour,key:`${range.from}-${hour}`,label,detail:`${formatReportDate(range.from)} · ${label}–${String(hour).padStart(2,'0')}:59`}
  })
  const buckets:ReportBucket[]=[]
  for(let start=range.from;start<=range.to;){
    let end=start
    if(interval==='week')end=shiftReportDate(start,6)
    if(interval==='month'){
      const next=calendarDate(`${start.slice(0,7)}-01`)
      next.setUTCMonth(next.getUTCMonth()+1)
      next.setUTCDate(0)
      end=next.toISOString().slice(0,10)
    }
    if(end>range.to)end=range.to
    const partial=interval==='month'&&(start.slice(-2)!=='01'||shiftReportDate(end,1).slice(-2)!=='01')
    const fullRange=start===end?formatReportDate(start):`${formatReportDate(start)} – ${formatReportDate(end)}`
    const label=interval==='month'?`${formatReportDate(start,{month:'short',year:'numeric'})}${partial?'*':''}`:interval==='week'?`${formatReportDate(start,{month:'short',day:'numeric'})}–${formatReportDate(end,{month:'short',day:'numeric'})}`:formatReportDate(start,{month:'short',day:'numeric'})
    buckets.push({key:start,from:start,to:end,label,detail:`${fullRange}${partial?' (partial month)':''}`})
    start=shiftReportDate(end,1)
  }
  return buckets
}
export function countReportBuckets(records:{date:string;time?:string}[],buckets:ReportBucket[]){
  const counts=buckets.map(()=>0)
  for(const record of records){
    const index=buckets.findIndex(bucket=>record.date>=bucket.from&&record.date<=bucket.to&&(bucket.hour===undefined||(record.time!==undefined&&Number(record.time.slice(0,2))===bucket.hour)))
    if(index>=0)counts[index]++
  }
  return counts
}
