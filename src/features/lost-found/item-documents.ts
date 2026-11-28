import type { Item } from '../../data/data.ts'
import { isReportDate } from '../reporting/reporting.ts'

export const itemDocumentTitles = {lost:'Reported Lost Form',found:'Reported Found Form'} as const
export type ItemDocumentTemplate = keyof typeof itemDocumentTitles
export type ItemDocument = {
  id: string
  itemId: string
  template: ItemDocumentTemplate
  fields: Readonly<Record<string,string>>
  createdAt: string
  preparedBy: {id:string;name:string}
}
export type NewItemDocument = Omit<ItemDocument,'createdAt'|'preparedBy'>

export function itemDocumentTemplate(item:Item){
  return item.type==='Lost'?'lost':item.type==='Found'?'found':undefined
}

export function itemDocumentPrefill(item:Item):Record<string,string>{
  const fields:Record<string,string>={
    referenceNumber:item.id,
    itemName:item.name,
    itemDescription:item.description,
  }
  if(isReportDate(item.date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))fields.reportedAt=item.date+'T'+item.time
  if(item.type==='Lost')Object.assign(fields,{lastKnownLocation:item.location,reporterName:item.reporter,contact:item.contact})
  if(item.type==='Found')fields.foundLocation=item.location
  return Object.fromEntries(Object.entries(fields).filter(([,value])=>value.trim()))
}
