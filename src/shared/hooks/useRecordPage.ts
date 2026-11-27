import { useEffect } from 'react'
export function useRecordPage<T>(rows:T[],pageValue:string,sizeValue:string,change:(key:'page',value:string)=>void,enabled=true){
  const size=Number(sizeValue),pages=Math.max(1,Math.ceil(rows.length/size))
  const requested=/^[1-9][0-9]*$/.test(pageValue)&&Number.isSafeInteger(Number(pageValue))?Number(pageValue):1
  const page=Math.min(requested,pages)
  useEffect(()=>{if(enabled&&pageValue!==String(page))change('page',String(page))},[enabled,pageValue,page,change])
  return {page,pages,size,rows:rows.slice((page-1)*size,page*size)}
}
export function compareLogbookRecords<T extends {id:string}>(a:T,b:T,sort:string,value:(record:T)=>string){
  const comparison=value(a).localeCompare(value(b),undefined,{sensitivity:'base',numeric:true})
  return (sort==='Newest First'||sort.endsWith('Z-A')?-comparison:comparison)||a.id.localeCompare(b.id)
}
