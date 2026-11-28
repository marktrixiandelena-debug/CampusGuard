import type { Item } from '../../data/data.ts'
import { isReportDate } from '../reporting/reporting.ts'

export const itemCategories=['Wallets & IDs','Personal Items','Clothing','Electronics','School Supplies']
export const itemReporterTypes=['Student','Guard','Staff','Visitor']
export type ItemIntake = {
  type:'Lost'|'Found'
  name:string; category:string; location:string; date:string; time:string
  reporterType:string; reporter:string; contact:string; description:string; photo?:string
}

export function buildItemRecord(id:string,input:ItemIntake,today:string):Item|undefined{
  const name=input.name.trim(),description=input.description.trim()
  const location=input.location.trim(),reporter=input.reporter.trim()
  if(!id||!name||!description||!location||!reporter||
    !itemCategories.includes(input.category)||!itemReporterTypes.includes(input.reporterType)||
    !isReportDate(input.date)||input.date>today||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))return
  return {...input,id,name,description,location,reporter,contact:input.contact.trim(),
    status:input.type==='Found'?'Unclaimed':'Reported Lost',history:['Sample record created at the Security Office.']}
}

export function intakeFromDocument(template:'lost'|'found',values:Record<string,string>,photo?:string):ItemIntake{
  const found=template==='found'
  const [date='',time='']=(values.reportedAt??'').split('T')
  return {type:found?'Found':'Lost',date,time,photo,name:values.itemName??'',description:values.itemDescription??'',
    category:values.category??'',reporterType:values.reporterType??'',
    location:(found?values.foundLocation:values.lastKnownLocation)??'',
    reporter:(found?values.recordReporter:values.reporterName)??'',
    contact:(found?values.recordContact:values.contact)??''}
}
