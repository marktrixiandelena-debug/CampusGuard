import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, SyntheticEvent } from 'react'
import { Link, NavLink } from 'react-router'
import { Search, X } from 'lucide-react'
export function Modal({title,subtitle,children,close,onDismissRequest,wide=false,className=''}:{title:string;subtitle?:string;children:ReactNode|((dismiss:()=>void)=>ReactNode);close:()=>void;onDismissRequest?:(dismiss:()=>void)=>void;wide?:boolean;className?:string}){
  const titleId=useId()
  const [dialog,setDialog]=useState<HTMLDialogElement|null>(null)
  const opener=useRef<HTMLElement|null>(null)
  const mount=useCallback((node:HTMLDialogElement|null)=>{
    if(node){if(!opener.current)opener.current=document.activeElement as HTMLElement|null;node.showModal()}
    setDialog(node)
  },[])
  useEffect(()=>{
    if(!dialog)return
    const previous=opener.current
    return()=>{dialog.getAnimations().forEach(animation=>animation.cancel());dialog.close();if(previous?.isConnected)previous.focus()}
  },[dialog])
  const finishDismiss=useCallback(()=>{
    if(!dialog||dialog.dataset.closing)return
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||!dialog.animate){close();return}
    dialog.setAttribute('inert','')
    dialog.setAttribute('data-closing','true')
    const animation=dialog.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.98)'}],{duration:150,easing:'ease-in',fill:'forwards'})
    animation.finished.then(()=>{if(dialog.isConnected)close()},()=>{})
  },[close,dialog])
  const dismiss=()=>{
    if(!dialog||dialog.dataset.closing)return
    if(onDismissRequest)onDismissRequest(finishDismiss)
    else finishDismiss()
  }
  const cancel=(event:SyntheticEvent<HTMLDialogElement>)=>{
    if(event.cancelable||!onDismissRequest){event.preventDefault();dismiss();return}
    // A native close request can be noncancelable without recent user activation.
    const node=event.currentTarget,active=document.activeElement,scrollTop=node.scrollTop
    requestAnimationFrame(()=>{
      if(!node.isConnected||node.dataset.closing)return
      if(!node.open)node.showModal()
      if(active instanceof HTMLElement&&node.contains(active))active.focus({preventScroll:true})
      node.scrollTop=scrollTop
      dismiss()
    })
  }
  return <dialog className={[wide?'wide-dialog':'',className].filter(Boolean).join(' ')} ref={mount} onCancel={cancel} onClick={e=>{if(e.target===e.currentTarget)dismiss()}} aria-labelledby={titleId}><div className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p className="muted">{subtitle}</p>}</div><button type="button" aria-label="Close dialog" onClick={dismiss}><X size={18}/></button></div>{typeof children==='function'?children(dismiss):children}</dialog>
}
export function Heading({title,subtitle,action}:{title:string;subtitle:string;action?:ReactNode}){return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>}
export function Stats({rows,context,title,metadata}:{rows:{label:string;value:string|number;note:string;color?:string;href?:string;action?:string;emphasis?:'urgent'|'attention'}[];context?:string;title?:string;metadata?:ReactNode}){return <section className={context?'operational-summary':'summary-section'}>{title&&<div className="overview-heading"><h2>{title}</h2>{metadata&&<span>{metadata}</span>}</div>}{context&&<p className="summary-context">{context} List filters do not change these summaries.</p>}<div className={'summaries'+(context?' operational-cards'+(rows.length===3?' three-cards':''):'')}>{rows.map(r=>{const content=<><h2>{r.label}</h2><strong>{r.value}</strong><p>{r.note}</p>{r.href&&<span className="summary-action">{r.action||'View records'} <span aria-hidden="true">&rarr;</span></span>}</>;return r.href?<Link className={'panel summary '+(r.emphasis||'')} to={r.href} key={r.label}>{content}</Link>:<article className="panel summary" key={r.label}>{content}</article>})}</div></section>}
export function Tabs({rows,className=''}:{rows:{label:string;to:string;end?:boolean}[];className?:string}){return <div className={`tabs panel ${className}`}>{rows.map(r=><NavLink end={r.end??true} to={r.to} key={r.to} className={({isActive})=>isActive?'primary':''}>{r.label}</NavLink>)}</div>}
export function Segments({options,value,change,label,responsiveTableLabel=false}:{options:string[];value:string;change:(v:string)=>void;label:string;responsiveTableLabel?:boolean}){return <div className="segments" role="group" aria-label={label}>{options.map(o=><button type="button" key={o} data-option={o} aria-pressed={o===value} className={o===value?'primary':''} onClick={()=>change(o)}>{responsiveTableLabel&&o==='Table'?<><span className="desktop-table-label">Table</span><span className="mobile-table-label">List</span></>:o}</button>)}</div>}
export function SearchBox({value,change,placeholder}:{value:string;change:(v:string)=>void;placeholder:string}){return <label className="search-box"><Search size={16}/><input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>change(e.target.value)}/></label>}
export function Select({label,value,options,change}:{label:string;value:string;options:string[];change:(v:string)=>void}){return <select aria-label={label} value={value} onChange={e=>change(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select>}
export function Badge({value}:{value:string}){return <span className={`status-badge ${['Active','Exited','Entered','Returned','Resolved','Published','Verified'].includes(value)?'green':['Denied','Open','Overdue'].includes(value)?'red':['Draft','Unclaimed','Under Review'].includes(value)?'amber':'blue'}`}>{value}</span>}
export function Panel({title,children,action,className=''}:{title:string;children:ReactNode;action?:ReactNode;className?:string}){return <section className={`panel content-panel ${className}`}><div className="panel-title"><h2>{title}</h2>{action}</div>{children}</section>}
export function Empty({columns}:{columns:number}){return <tr><td className="empty" colSpan={columns}>No matching records. Adjust your search or filters.</td></tr>}
export function Footer({close,children}:{close:()=>void;children?:ReactNode}){return <footer><button className="outline" type="button" onClick={close}>{children?'Cancel':'Close'}</button>{children}</footer>}
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}
