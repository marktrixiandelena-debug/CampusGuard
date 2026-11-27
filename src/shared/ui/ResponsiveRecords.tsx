import type { ReactNode } from 'react'
import './responsive-records.css'

type MobileRecord={
  id:string
  title:string
  badges:ReactNode
  metadata:{label:string;value:ReactNode}[]
  actions:ReactNode
}

export function ResponsiveRecords({label,records,empty,children}:{label:string;records:MobileRecord[];empty:ReactNode;children:ReactNode}){
  return <>
    <div className="desktop-records">{children}</div>
    <div className="mobile-records">
      {records.length?<ul className="mobile-record-list" aria-label={label}>{records.map(record=><li key={record.id} data-record-id={record.id}>
        <article className="mobile-record">
          <h3>{record.title}</h3>
          <div className="mobile-record-badges">{record.badges}</div>
          <dl>{record.metadata.map(field=><div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
          <div className="mobile-record-actions">{record.actions}</div>
        </article>
      </li>)}</ul>:empty}
    </div>
  </>
}
