import { useEffect, useState } from 'react'
import { campusDateTime } from '../../features/visitors/visitor-data'

export function useCampusDate(){
  const [,setDate]=useState(()=>campusDateTime().date)
  useEffect(()=>{
    const refresh=()=>setDate(campusDateTime().date)
    const timer=window.setInterval(refresh,30_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[])
  // Transactions must reflect a midnight boundary immediately, before the next timer tick.
  return campusDateTime().date
}
