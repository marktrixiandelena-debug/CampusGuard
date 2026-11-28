import { useState } from 'react'
import type { Item } from '../../data/data'
import { dateLabel } from '../../data/data'
import { Panel, SearchBox, Select } from '../../shared/ui/ui'
import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { campusDateTime } from '../visitors/visitor-data'
import { itemDocumentTitles } from './item-documents'
import type { ItemDocument, ItemDocumentTemplate } from './item-documents'

export function LostFoundDocuments({items,documents,onNew,onExisting,onTurnover,onViewItem,onOpen}:{
  items:readonly Item[]
  documents:readonly ItemDocument[]
  onNew:(type:ItemDocumentTemplate)=>void
  onExisting:(type:ItemDocumentTemplate)=>void
  onTurnover:()=>void
  onViewItem:(item:Item)=>void
  onOpen:(document:ItemDocument,print:boolean)=>void
}){
  const [search,setSearch]=useState('')
  const [type,setType]=useState('All types')
  const query=search.trim().toLowerCase()
  const rows=documents.filter(document=>{
    const title=itemDocumentTitles[document.template]
    return (type==='All types'||title===type)&&
      [document.itemId,document.fields.itemName,title,document.preparedBy.name].join(' ').toLowerCase().includes(query)
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  const created=(document:ItemDocument)=>dateLabel(campusDateTime(new Date(document.createdAt)).date)
  const actions=(document:ItemDocument)=><div className="lf-document-actions">
    <button type="button" className="outline" onClick={()=>onOpen(document,false)}>View</button>
    <button type="button" className="outline" onClick={()=>onOpen(document,true)}>Print</button>
  </div>
  function itemLink(document:ItemDocument){
    const item=items.find(item=>item.id===document.itemId)
    return item?<button type="button" className="text-button lf-document-item-link"
      aria-label={'View item '+document.itemId} onClick={()=>onViewItem(item)}>{document.itemId}</button>:document.itemId
  }
  const empty=<p className="empty">{documents.length?'No documents match your filters.':'No saved documents yet.'}</p>
  return <>
    <Panel title="Document templates" className="lf-template-panel">
      <ul className="lf-template-list">
        {(Object.keys(itemDocumentTitles) as ItemDocumentTemplate[]).map(template=><li key={template} data-template={template}>
          <strong>{itemDocumentTitles[template]}</strong>
          <div className="lf-document-actions" role="group" aria-label={itemDocumentTitles[template]}>
            <button type="button" className="outline" onClick={()=>onNew(template)}>New item</button>
            <button type="button" className="outline" onClick={()=>onExisting(template)}>Existing item</button>
          </div>
        </li>)}
        <li data-template="turnover"><div><strong>Turn-over Form</strong><small className="muted block">Preview for an eligible Found item.</small></div>
          <button type="button" className="outline" onClick={onTurnover}>Prepare preview</button>
        </li>
      </ul>
    </Panel>
    <Panel title="Generated documents">
      <div className="filter-row lf-document-filters">
        <SearchBox value={search} change={setSearch} placeholder="Search documents by item or form…"/>
        <Select label="Document type" value={type} change={setType} options={['All types',...Object.values(itemDocumentTitles)]}/>
        <p className="muted" role="status">{rows.length} of {documents.length} documents</p>
      </div>
      <ResponsiveRecords label="Generated documents" records={rows.map(document=>({
        id:document.id,title:itemDocumentTitles[document.template],badges:null,
        metadata:[{label:'Item reference',value:itemLink(document)},{label:'Date created',value:created(document)},
          {label:'Prepared by',value:document.preparedBy.name}],
        actions:actions(document),
      }))} empty={empty}>
        <div className="table-scroll"><table className="lf-document-table"><thead><tr>
          {['Document type','Item reference','Date created','Prepared by','Actions'].map(label=><th key={label} scope="col">{label}</th>)}
        </tr></thead><tbody>{rows.length?rows.map(document=><tr key={document.id} data-item-document={document.id}>
          <td>{itemDocumentTitles[document.template]}</td><td>{itemLink(document)}<small className="muted block">{document.fields.itemName}</small></td>
          <td>{created(document)}</td><td>{document.preparedBy.name}</td><td>{actions(document)}</td>
        </tr>):<tr><td colSpan={5}>{empty}</td></tr>}</tbody></table></div>
      </ResponsiveRecords>
    </Panel>
  </>
}

