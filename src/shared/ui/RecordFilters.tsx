import type { ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import './record-filters.css'

export type ActiveFilter = { key: string; label: string; remove: () => void }

export function QuickFilters({label,options,value,change}:{label:string;options:string[];value:string;change:(value:string)=>void}){
  return <div className="record-quick-filters" role="group" aria-label={label}>{options.map(option=><button type="button" key={option} aria-pressed={value===option} onClick={()=>change(option)}>{option}</button>)}</div>
}

export function MoreFiltersButton({expanded,toggle,active,controls}:{expanded:boolean;toggle:()=>void;active:number;controls:string}){
  return <button type="button" className="record-more-filters" aria-expanded={expanded} aria-controls={controls} onClick={toggle}>More filters{active>0&&<span className="record-more-count">{active}</span>}<ChevronDown size={14} aria-hidden="true"/></button>
}

export function FilterControl({label,children,search=false}:{label:string;children:ReactNode;search?:boolean}){
  return <div className={`record-filter-control${search?' record-filter-search':''}`} role="group" aria-label={label}><span className="record-filter-label">{label}</span>{children}</div>
}

export function FilterResults({count,total,unit,active,clear}:{count:number;total:number;unit:string;active:boolean;clear:()=>void}){
  return <div className="record-filter-results"><small className="muted" role="status">{count} of {total} {unit}</small>{active&&<button type="button" className="record-filter-clear" onClick={clear}>Clear all</button>}</div>
}

export function FilterChips({filters}:{filters:ActiveFilter[]}){
  if(!filters.length)return null
  return <div className="record-filter-chips" role="group" aria-label="Active filters">{filters.map(filter=><button type="button" key={filter.key} className="record-filter-chip" onClick={filter.remove} aria-label={`Remove ${filter.label} filter`}><span>{filter.label}</span><X size={12} aria-hidden="true"/></button>)}</div>
}
