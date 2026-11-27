import { shiftReportDate } from '../reporting/reporting.ts'
import type { WeeklyDraft } from './weekly-draft.ts'

export type CampusPost = { id:string; name:string; legacyName?:string; pin?:{x:number;y:number} }
export type DutyPostLinks = Partial<Record<number,string[]>>

export const validDeploymentTime = (time:string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)

export function weeklyDeployment(rosters:readonly WeeklyDraft[],date:string,time:string){
  const previous=shiftReportDate(date,-1)
  const covers=(roster:WeeklyDraft,day:string)=>roster.start<=day&&day<=roster.end
  return rosters.flatMap(roster=>{
    const duties=roster.duties.flatMap(duty=>{
      const overnight=duty.end<duty.start
      const carry=overnight&&covers(roster,previous)&&(!time||time<duty.end)
      const starts=covers(roster,date)&&(!time||(duty.start<=time&&(overnight||time<duty.end)))
      return [...(carry?[{duty,day:previous,carry:true}]:[]),...(starts?[{duty,day:date,carry:false}]:[])]
    })
    return duties.length||covers(roster,date)?[{roster,duties}]:[]
  }).sort((a,b)=>b.roster.start.localeCompare(a.roster.start)||b.roster.updatedAt.localeCompare(a.roster.updatedAt))
}
