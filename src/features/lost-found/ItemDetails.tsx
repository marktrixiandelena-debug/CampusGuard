import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Package, Search, ZoomIn } from 'lucide-react'
import type { Item } from '../../data/data'
import { dateLabel } from '../../data/data'
import { campusDateTime } from '../visitors/visitor-data'
import { Badge } from '../../shared/ui/ui'

function ActionTime({at}:{at:string}){
  const instant=new Date(at)
  if(!Number.isFinite(instant.getTime()))return null
  const {date,seconds}=campusDateTime(instant)
  return <time dateTime={at}>{dateLabel(date)} · {seconds} (Asia/Manila)</time>
}

export function OwnershipFacts({item}:{item:Item}){
  const {claimant,verification}=item
  return <dl className="lost-item-facts">
    {claimant&&<div><dt>Verified claimant</dt><dd>{claimant}</dd></div>}
    {verification?.idType&&<div><dt>ID type checked</dt><dd>{verification.idType}</dd></div>}
    {verification?.actorName&&<div><dt>Verified by</dt><dd>{verification.actorName}</dd></div>}
    {verification?.at&&<div><dt>Verified on</dt><dd><ActionTime at={verification.at}/></dd></div>}
  </dl>
}

export function ReleaseFacts({item}:{item:Item}){
  const {recipient,releaseLocation,release}=item
  return <dl className="lost-item-facts">
    {recipient&&<div><dt>Received by</dt><dd>{recipient}</dd></div>}
    {releaseLocation&&<div><dt>Release location</dt><dd>{releaseLocation}</dd></div>}
    {release?.actorName&&<div><dt>Handover confirmed by</dt><dd>{release.actorName}</dd></div>}
    {release?.at&&<div><dt>Released on</dt><dd><ActionTime at={release.at}/></dd></div>}
  </dl>
}

export default function ItemDetails({item,linked,handover=item,close,actionLabel,advance}:{item:Item;linked?:Item;handover?:Item;close:()=>void;actionLabel:string;advance:()=>void}){
  const [expanded,setExpanded]=useState(false),[failedPhoto,setFailedPhoto]=useState('')
  const body=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),photoHeading=useRef<HTMLHeadingElement>(null),itemHeading=useRef<HTMLHeadingElement>(null)
  const savedScroll=useRef(0),wasExpanded=useRef(false)
  const hasPhoto=!!item.photo&&failedPhoto!==item.photo
  const {verification,release}=handover
  const hasOwnershipFacts=!!(handover.claimant||verification)
  const hasReleaseFacts=!!(handover.recipient||handover.releaseLocation||release)
  const returned=item.status==='Returned'||handover.status==='Returned'
  const verified=!!(handover.ownershipVerified||verification)
  const history=(item.history??[]).flatMap(entry=>{
    if(entry==='Ownership verified by sample Security Head.')return verification?[]:['Ownership verified. Actor and time not recorded.']
    if(entry==='Physical handover confirmed by sample Security Head.')return release?[]:['Physical handover confirmed. Actor and time not recorded.']
    return [entry]
  })
  useEffect(()=>{
    if(expanded){if(body.current)body.current.scrollTop=0;photoHeading.current?.focus({preventScroll:true})}
    else if(wasExpanded.current){if(body.current)body.current.scrollTop=trigger.current?savedScroll.current:0;(trigger.current||itemHeading.current)?.focus({preventScroll:true})}
    wasExpanded.current=expanded
  },[expanded])
  const image=hasPhoto?<img src={item.photo} alt={item.name} onError={()=>setFailedPhoto(item.photo||'')}/>:<span className="lost-item-photo-empty"><Package size={36} aria-hidden="true"/>{item.photo?'Photo unavailable':'No photo provided'}</span>
  return <div className="lost-item-content">
    <div className="lost-item-body" ref={body}>
      {expanded?<>
        <h3 className="lost-item-photo-title" ref={photoHeading} tabIndex={-1}>Item photo &mdash; {item.name}</h3>
        <p className="muted">Record #{item.id}</p>
        <div className="lost-item-photo-full">{image}</div>
      </>:<>
        <div className="lost-item-heading"><div><h3 ref={itemHeading} tabIndex={-1}>{item.name}</h3><p>Record #{item.id} &middot; {item.type} report</p></div><Badge value={item.status}/></div>
        <div className="lost-item-overview">
          <div>
            {hasPhoto?<button type="button" className="lost-item-photo-trigger" ref={trigger} onClick={()=>{savedScroll.current=body.current?.scrollTop||0;setExpanded(true)}} aria-label={`View full photo of ${item.name}`}><span className="lost-item-photo-frame">{image}</span><span className="lost-item-photo-caption"><ZoomIn size={16} aria-hidden="true"/>View full photo</span></button>:<div className="lost-item-photo-frame">{image}</div>}
          </div>
          <dl className="lost-item-facts">
            <div><dt>Category</dt><dd>{item.category}</dd></div>
            <div><dt>{item.type==='Lost'?'Last Known Location':'Found At'}</dt><dd>{item.location}</dd></div>
            <div><dt>Reported On</dt><dd>{dateLabel(item.date)} &middot; {item.time}</dd></div>
            <div><dt>Reported By</dt><dd>{item.reporter}<small>{item.reporterType}</small></dd></div>
          </dl>
        </div>
        <section className="lost-item-section"><h3>Description</h3><p className="lost-item-description">{item.description||'No description provided.'}</p></section>
        {(!returned||item.matchedId)&&<section className="lost-item-section"><h3>{returned||verified?'Linked report':'Possible Matches'}</h3><div className="lost-item-match-summary"><Search size={18} aria-hidden="true"/><div>
          <strong>{item.matchedId?(linked?`${linked.name} - ${linked.id}`:`Linked report ${item.matchedId} is unavailable.`):item.status==='Possible Match'?'Flagged for review. No linked report recorded.':'No linked report yet.'}</strong>
          {!returned&&!verified&&<p>{item.matchedId?'Review the linked reports before confirming ownership.':`Compare this report with existing ${item.type==='Lost'?'found':'lost'}-item records.`}</p>}
        </div></div></section>}
        {hasOwnershipFacts&&<section className="lost-item-section"><h3>Ownership verification</h3><OwnershipFacts item={handover}/></section>}
        {(hasReleaseFacts||returned)&&<section className="lost-item-section"><h3>Physical handover</h3>{hasReleaseFacts?<ReleaseFacts item={handover}/>:<p className="muted">Handover details not recorded.</p>}</section>}
        <details className="lost-item-history"><summary>Activity history</summary>
          {history.map((entry,index)=><p key={index}>{entry}</p>)}
          {verification&&<p><strong>Ownership verified</strong> · {verification.actorName} · <ActionTime at={verification.at}/></p>}
          {release&&<p><strong>Physical handover confirmed</strong> · {release.actorName} · <ActionTime at={release.at}/></p>}
          {!history.length&&!verification&&!release&&<p>Sample record. No verified activity log has been provided.</p>}
        </details>
      </>}
    </div>
    <footer><button type="button" className="outline" onClick={close}>Close</button>{expanded?<button type="button" className="outline lost-item-photo-back" onClick={()=>setExpanded(false)}><ArrowLeft size={16} aria-hidden="true"/>Back to item details</button>:!returned&&<button type="button" className="primary" onClick={advance}>{actionLabel}</button>}</footer>
  </div>
}
