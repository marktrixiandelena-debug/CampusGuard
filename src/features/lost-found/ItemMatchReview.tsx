import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Info, MapPin, Package } from 'lucide-react'
import type { Item } from '../../data/data'
import { dateLabel } from '../../data/data'
import { Badge, Footer } from '../../shared/ui/ui'
import './item-matches.css'

const normalizedName=(item:Item)=>item.name.trim().replace(/\s+/g,' ').toLowerCase()

function ReportDetails({item}:{item:Item}){
  return <article className="match-report"><div className="match-report-heading"><Badge value={item.type}/><small>{item.id}</small></div><h3>{item.name}</h3><dl><div><dt>Category</dt><dd>{item.category}</dd></div><div><dt>Location</dt><dd>{item.location}</dd></div><div><dt>Recorded</dt><dd>{dateLabel(item.date)} · {item.time}</dd></div><div><dt>Status</dt><dd><Badge value={item.status}/></dd></div><div><dt>Description</dt><dd>{item.description||'No description provided.'}</dd></div></dl></article>
}

export function ItemMatchReview({selected,items,link,close}:{selected:Item;items:Item[];link:(candidate:Item)=>void;close:()=>void}){
  const [reviewedId,setReviewedId]=useState('')
  const root=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),previousId=useRef('')
  const sameName=(item:Item)=>normalizedName(item)===normalizedName(selected)
  const candidates=items.filter(item=>item.type!==selected.type&&item.category===selected.category&&item.status!=='Returned'&&!item.matchedId)
    .sort((a,b)=>Number(sameName(b))-Number(sameName(a))||b.date.localeCompare(a.date)||a.id.localeCompare(b.id))
  const reviewed=candidates.find(item=>item.id===reviewedId)
  useEffect(()=>{
    if(reviewedId){previousId.current=reviewedId;heading.current?.focus()}
    else if(previousId.current){Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-match-id]')||[]).find(button=>button.dataset.matchId===previousId.current)?.focus()}
  },[reviewedId])
  return <div className="item-matches" ref={root}>
    {reviewed?<>
      <h3 className="match-section-title" tabIndex={-1} ref={heading}>Compare reports</h3>
      <p className="match-intro">Check the item descriptions, dates, and locations before linking these reports.</p>
      <div className="match-comparison"><ReportDetails item={selected}/><ReportDetails item={reviewed}/></div>
    </>:<>
      <div className="match-context"><div className="match-thumbnail">{selected.photo?<img src={selected.photo} alt=""/>:<Package size={24} aria-hidden="true"/>}</div><div className="match-context-copy"><small>Matching your {selected.type.toLowerCase()} report</small><h3>{selected.name}</h3><p>{selected.category} · {selected.id}</p></div><Badge value={selected.status}/></div>
      <div className="match-list-heading"><h3>Suggested {selected.type==='Lost'?'found':'lost'} reports</h3><small>{candidates.length} {candidates.length===1?'report':'reports'}</small></div>
      <p className="match-intro">Same-name reports appear first. Category-only suggestions may describe a different item.</p>
      {candidates.length?<div className="match-candidates" role="region" aria-label="Suggested matching reports" tabIndex={0}>{candidates.map(item=><article className="match-candidate" key={item.id}>
        <div className="match-candidate-copy"><span className={`match-reason${sameName(item)?' same-name':''}`}>{sameName(item)?'Same name and category':'Same category only'}</span><h3>{item.name}</h3><div className="match-meta"><span><MapPin size={13} aria-hidden="true"/>{item.location}</span><span><CalendarDays size={13} aria-hidden="true"/>{dateLabel(item.date)}</span></div><div className="match-candidate-status"><small>{item.id}</small><Badge value={item.status}/></div></div>
        <button type="button" className="outline match-review-button" data-match-id={item.id} aria-label={`Review match: ${item.name}, ${item.id}`} onClick={()=>setReviewedId(item.id)}>Review match <ArrowRight size={14} aria-hidden="true"/></button>
      </article>)}</div>:<div className="match-empty"><Package size={28} aria-hidden="true"/><h3>No matching reports yet</h3><p>There are no unlinked {selected.type==='Lost'?'found':'lost'} reports in this category. Check again when new reports are recorded.</p></div>}
    </>}
    <div className="match-note"><Info size={16} aria-hidden="true"/><p>Linking reports suggests a possible match. Verify ownership in person before releasing an item.</p></div>
    {reviewed?<footer className="match-footer"><button type="button" className="outline" onClick={()=>setReviewedId('')}>Back to matches</button><button type="button" className="primary" onClick={()=>link(reviewed)}>Link reports</button></footer>:<Footer close={close}/>}
  </div>
}
