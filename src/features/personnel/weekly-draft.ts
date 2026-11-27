import type { Person } from '../../data/data.ts'
import { isReportDate } from '../reporting/reporting.ts'
import type { weeklyDuties } from './weekly-duty-template.ts'

export type DutySelection = Pick<Person,'id'|'name'|'designation'>
export type WeeklyDraftDuty = (typeof weeklyDuties)[number] & {personnel?:DutySelection}
export type WeeklyPeriod = {start:string;end:string}
export type WeeklyDraft = WeeklyPeriod & {id:string;updatedAt:string;duties:WeeklyDraftDuty[]}

export function validWeeklyPeriod(period:WeeklyPeriod){
  return isReportDate(period.start)&&isReportDate(period.end)&&period.start<=period.end
}

export function overlappingDrafts(drafts:readonly WeeklyDraft[],period:WeeklyPeriod,editingId?:string){
  return validWeeklyPeriod(period)?drafts.filter(draft=>draft.id!==editingId&&draft.start<=period.end&&period.start<=draft.end):[]
}
