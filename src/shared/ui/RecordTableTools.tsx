import './record-table-tools.css'
export function SortHeading({label,pair,value,change}:{label:string;pair?:readonly [string,string];value:string;change:(value:string)=>void}){
  const active=pair?.includes(value),descending=value==='Newest First'||value.endsWith('Z-A')
  return <th scope="col" aria-sort={pair?(active?(descending?'descending':'ascending'):'none'):undefined}>{pair?<button className="record-sort-button" onClick={()=>change(active&&value===pair[0]?pair[1]:pair[0])}>{label}<span aria-hidden="true">{active?(descending?' \u2193':' \u2191'):' \u2195'}</span></button>:label}</th>
}
export function RecordPagination({page,pages,size,total,change}:{page:number;pages:number;size:number;total:number;change:(key:'page'|'pageSize',value:string)=>void}){
  return <div className="record-pagination" aria-label="Record pages"><span role="status">{total?`Showing ${(page-1)*size+1} to ${Math.min(page*size,total)} of ${total} records`:'Showing 0 records'}</span><label>Records per page <select aria-label="Records per page" value={size} onChange={e=>change('pageSize',e.target.value)}>{[10,25,50].map(n=><option key={n}>{n}</option>)}</select></label><div><button className="outline" disabled={page===1} onClick={()=>change('page',String(page-1))}>Previous</button><span>Page {page} of {pages}</span><button className="outline" disabled={page===pages||!total} onClick={()=>change('page',String(page+1))}>Next</button></div></div>
}
export function RecordEmpty({total,active,noun,clear}:{total:number;active:boolean;noun:string;clear:()=>void}){
  return <div className="empty record-empty"><strong>{total?`No ${noun} match your search or filters.`:`No ${noun} recorded yet.`}</strong><p>{total?'Try another search or clear the filters to see more records.':'Records will appear here when they are added.'}</p>{active&&<button className="outline" onClick={clear}>Clear filters</button>}</div>
}
