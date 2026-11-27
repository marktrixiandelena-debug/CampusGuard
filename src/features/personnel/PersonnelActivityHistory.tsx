import { useState } from 'react'
import { dateLabel } from '../../data/data'
import { combinedPersonnelHistory } from './personnel-activity'
import type { PersonnelHistoryRow } from './personnel-activity'
import { RecordEmpty, RecordPagination } from '../../shared/ui/RecordTableTools'
import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { useDemo } from '../../app/store'
import { Footer, Modal, Panel, SearchBox } from '../../shared/ui/ui'
import { useRecordPage } from '../../shared/hooks/useRecordPage'

function when(row:PersonnelHistoryRow){
  return row.time?`${dateLabel(row.date)} · ${row.time.slice(0,5)}`:dateLabel(row.date)
}

export default function PersonnelActivityHistory(){
  const {activities,visits,incidents,people,accounts}=useDemo()
  const [search,setSearch]=useState('')
  const [category,setCategory]=useState('')
  const [person,setPerson]=useState('')
  const [date,setDate]=useState('')
  const [page,setPage]=useState('1')
  const [size,setSize]=useState('10')
  const [selected,setSelected]=useState<PersonnelHistoryRow>()
  const history=combinedPersonnelHistory(activities,visits,incidents,people,accounts)
  const peopleOptions=[...new Map(history.map(row=>[row.actorKey,row.actor]))].sort((a,b)=>a[1].localeCompare(b[1]))
  const dates=[...new Set(history.map(row=>row.date))]
  const query=search.trim().toLowerCase()
  const filtered=history.filter(row=>
    (!category||row.category===category)&&(!person||row.actorKey===person)&&(!date||row.date===date)
    &&`${row.event} ${row.actor} ${row.reference||''} ${row.detail}`.toLowerCase().includes(query)
  )
  const pagination=useRecordPage(filtered,page,size,(_,value)=>setPage(value))
  const hasFilters=!!(query||category||person||date)
  function clear(){setSearch('');setCategory('');setPerson('');setDate('');setPage('1')}
  const empty=<RecordEmpty total={history.length} active={hasFilters} noun="activity records" clear={clear}/>
  const view=(row:PersonnelHistoryRow)=><button type="button" className="text-button activity-history-view" aria-label={`View details for ${row.event}, ${row.reference||row.detail}`} onClick={()=>setSelected(row)}>View details</button>

  return <>
    <Panel title="Personnel Activity History" action={<span className="badge">Sample Data</span>}>
      <div className="activity-history-filters">
        <SearchBox value={search} change={value=>{setSearch(value);setPage('1')}} placeholder="Search personnel or activity…"/>
        <div className="activity-history-filter-options">
          <select aria-label="Activity category" value={category} onChange={event=>{setCategory(event.target.value);setPage('1')}}>
            <option value="">All Activities</option>
            <option>Visitor transactions</option><option>Incident assignments</option><option>Personnel changes</option>
          </select>
          <select aria-label="Activity personnel" value={person} onChange={event=>{setPerson(event.target.value);setPage('1')}}>
            <option value="">All Personnel</option>
            {peopleOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label="Activity date" value={date} onChange={event=>{setDate(event.target.value);setPage('1')}}>
            <option value="">All Dates</option>
            {dates.map(value=><option key={value} value={value}>{dateLabel(value)}</option>)}
          </select>
          {hasFilters&&<button type="button" className="text-button activity-history-view" onClick={clear}>Reset filters</button>}
        </div>
      </div>
      <ResponsiveRecords label="Personnel activity history" empty={empty} records={pagination.rows.map(row=>({
        id:row.id,title:row.event,badges:row.reference,
        metadata:[{label:'Date / Time',value:when(row)},{label:'Personnel',value:row.actor},{label:'Details',value:row.detail}],
        actions:view(row),
      }))}>
        <div className="table-scroll"><table className="activity-history-table record-table-headers">
          <thead><tr><th scope="col">Date / Time</th><th scope="col">Activity</th><th scope="col">Personnel</th></tr></thead>
          <tbody>{pagination.rows.length?pagination.rows.map(row=><tr key={row.id} data-record-id={row.id}>
            <td>{when(row)}</td><td><strong>{row.event}</strong><small className="muted block">{row.reference||row.detail}</small>{view(row)}</td><td>{row.actor}</td>
          </tr>):<tr><td colSpan={3}>{empty}</td></tr>}</tbody>
        </table></div>
      </ResponsiveRecords>
      <RecordPagination {...pagination} total={filtered.length} change={(key,value)=>{if(key==='pageSize'){setSize(value);setPage('1')}else setPage(value)}}/>
      <p className="activity-history-note">Illustrative activity records. Changes made in this demo last until the page is refreshed.</p>
    </Panel>
    {selected&&<Modal title="Activity Details" close={()=>setSelected(undefined)}>{dismiss=><>
      <h3>{selected.event}</h3>
      <dl className="details-grid">
        <div><dt>Date / Time</dt><dd>{when(selected)}</dd></div>
        <div><dt>Personnel</dt><dd>{selected.actor}</dd></div>
        {selected.reference&&<div><dt>Reference</dt><dd>{selected.reference}</dd></div>}
        <div><dt>Details</dt><dd>{selected.detail}</dd></div>
      </dl>
      <Footer close={dismiss}/>
    </>}</Modal>}
  </>
}
