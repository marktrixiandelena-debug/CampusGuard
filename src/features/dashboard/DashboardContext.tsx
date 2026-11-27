import type { MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import './dashboard-context.css'

export function DashboardContext({missingRecord=false,dismissMissingRecord}:{missingRecord?:boolean;dismissMissingRecord?:()=>void}){
  const [params]=useSearchParams()
  function dismiss(event:MouseEvent<HTMLButtonElement>){
    const notice=event.currentTarget.parentElement
    if(!notice||notice.hasAttribute('inert'))return
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||!notice.animate){dismissMissingRecord?.();return}
    notice.setAttribute('inert','')
    const animation=notice.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-6px)'}],{duration:150,easing:'ease-in',fill:'forwards'})
    animation.finished.then(()=>{if(notice.isConnected)dismissMissingRecord?.()},()=>{})
  }
  return <>
    {params.get('from')==='dashboard'&&<Link to="/dashboard" className="dashboard-back-link"><ArrowLeft size={16} aria-hidden="true"/> Back to dashboard</Link>}
    {missingRecord&&<div className="dashboard-missing-record" role="status"><p>This record is no longer available. You can search the logbook below.</p><button type="button" className="outline" onClick={dismiss}>Dismiss</button></div>}
  </>
}
