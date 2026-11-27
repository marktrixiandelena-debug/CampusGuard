import { ResponsiveRecords } from '../../shared/ui/ResponsiveRecords'
import { useSummaryHref } from '../../shared/hooks/useSummaryHref'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FormEvent } from 'react'
import { useDemo } from '../../app/store'
import { dateLabel, periodMatches } from '../../data/data'
import { useCampusDate } from '../../shared/hooks/useCampusDate'
import type { Item } from '../../data/data'
import { ItemMatchReview } from './ItemMatchReview'
import ItemDetails, { OwnershipFacts, ReleaseFacts } from './ItemDetails'
import './lost-found-grid.css'
import { FilterControl, FilterResults, FilterChips, MoreFiltersButton, QuickFilters } from '../../shared/ui/RecordFilters'
import type { ActiveFilter } from '../../shared/ui/RecordFilters'
import { Badge, Field, Footer, Heading, Modal, Panel, SearchBox, Segments, Select, Stats } from '../../shared/ui/ui'
import { DashboardContext } from '../dashboard/DashboardContext'
import { useDashboardEntry, useLogbookFilters } from '../../shared/hooks/useLogbookFilters'
import { itemFilterDefaults, itemPresets, matchesItemStatus } from '../dashboard/dashboard-data'

const categories=['Wallets & IDs','Personal Items','Clothing','Electronics','School Supplies']
const identificationTypes=['National ID','Student ID',"Driver's License"]
const staticImages=import.meta.glob('/public/design/*',{eager:true,query:'?url',import:'default'}) as Record<string,string>

const itemSorts=['Newest First','Oldest First','Item Name A-Z','Item Name Z-A','Category A-Z','Category Z-A','Location A-Z','Location Z-A']
const logbookDefaults={...itemFilterDefaults,display:'Table',page:'1',pageSize:'10'}
type Stage='record'|'view'|'matches'|'linked'|'verify'|'verified'|'release'|'returned'
function reciprocalLostReport(items:Item[],found:Item){
  return items.find(item=>item.id===found.matchedId&&item.type==='Lost'&&item.matchedId===found.id&&item.category===found.category)
}
function canVerify(item:Item|undefined):item is Item{
  return item?.type==='Found'&&item.status!=='Returned'&&!item.ownershipVerified&&!item.verification&&!item.release
}
function canRelease(item:Item|undefined):item is Item{
  return item?.type==='Found'&&item.status!=='Returned'&&!!item.ownershipVerified&&!item.release
}
export default function LostFound(){
  const summaryHref=useSummaryHref()
  const campusToday=useCampusDate()
  const {items,setItems,currentUser}=useDemo()
  const [params,setParams]=useSearchParams()
  const {filters,setFilter}=useLogbookFilters<typeof logbookDefaults>(logbookDefaults,itemPresets,{type:['All','Lost','Found'],status:['All','Awaiting Return','Possible Match','Unclaimed','Returned','Overdue'],period:['Today','Week','Month','All'],category:['All Categories',...categories],sort:itemSorts,display:['Table','Grid'],pageSize:['10','25','50']},{resetPageOnChange:['search','type','status','period','category','sort','pageSize']})
  const {search,type,status,period,category,sort}=filters
  const setSearch=(value:string)=>setFilter('search',value),setType=(value:string)=>setFilter('type',value),setStatus=(value:string)=>setFilter('status',value),setPeriod=(value:string)=>setFilter('period',value),setCategory=(value:string)=>setFilter('category',value),setSort=(value:string)=>setFilter('sort',value)
  const view=filters.display,setView=(value:string)=>setFilter('display',value)
  const clearFilters=()=>{const next=new URLSearchParams(params);for(const key of ['search','type','status','period','category','view','page'])next.delete(key);setParams(next,{replace:true})}
  const [stage,setStage]=useState<Stage|null>(null),[selectedId,setSelectedId]=useState(''),[recordType,setRecordType]=useState('Lost'),[photo,setPhoto]=useState<string>(),[error,setError]=useState('')
  const cameraInput=useRef<HTMLInputElement>(null),libraryInput=useRef<HTMLInputElement>(null),photoRead=useRef(0)
  const confirmationSubmitted=useRef(false)
  const [photoLoading,setPhotoLoading]=useState(false),[photoError,setPhotoError]=useState('')
  useEffect(()=>()=>{photoRead.current++},[])
  function selectPhoto(input:HTMLInputElement){
    const file=input.files?.[0];input.value='';if(!file)return
    const request=++photoRead.current;setPhotoLoading(false);setPhotoError('')
    if(!file.type.startsWith('image/')||file.size>5_000_000){setPhotoError('Choose an image no larger than 5 MB.');return}
    setPhotoLoading(true);const reader=new FileReader()
    reader.onload=()=>{if(request!==photoRead.current)return;setPhoto(String(reader.result));setPhotoLoading(false)}
    reader.onerror=()=>{if(request!==photoRead.current)return;setPhotoError('The photo could not be read. Choose another image.');setPhotoLoading(false)}
    reader.readAsDataURL(file)
  }
  function removePhoto(){photoRead.current++;setPhoto(undefined);setPhotoLoading(false);setPhotoError('')}
  const entry=useDashboardEntry(items,item=>{setSelectedId(item.id);setStage('view');setError('')},()=>{setSelectedId('');setRecordType('Lost');setPhoto(undefined);setStage('record');setError('')})
  const selected=items.find(i=>i.id===selectedId)
  const linked=items.find(i=>i.id===selected?.matchedId)
  const rows=items.filter(i=>(type==='All'||i.type===type)&&matchesItemStatus(i,status)&&(category==='All Categories'||i.category===category)&&periodMatches(i.date,period)&&`${i.id} ${i.name} ${i.category} ${i.location} ${i.description}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>{
    const descending=sort==='Newest First'||sort.endsWith('Z-A')
    const field=sort.startsWith('Item Name')?'name':sort.startsWith('Category')?'category':sort.startsWith('Location')?'location':null
    const compared=field?a[field].localeCompare(b[field],undefined,{sensitivity:'base',numeric:true}):(a.date+'T'+a.time).localeCompare(b.date+'T'+b.time)
    return (descending?-compared:compared)||a.id.localeCompare(b.id)
  })
  const pageSize=Number(filters.pageSize),pageCount=Math.max(1,Math.ceil(rows.length/pageSize))
  const requestedPage=/^[1-9][0-9]*$/.test(filters.page)&&Number.isSafeInteger(Number(filters.page))?Number(filters.page):1
  const page=Math.min(requestedPage,pageCount),pageRows=rows.slice((page-1)*pageSize,page*pageSize)
  useEffect(()=>{if(filters.page!==String(page))setFilter('page',String(page))},[filters.page,page,setFilter])
  const sortableColumns:Record<string,[string,string]>={'Item Name':['Item Name A-Z','Item Name Z-A'],Category:['Category A-Z','Category Z-A'],Location:['Location A-Z','Location Z-A'],'Date / Time':['Newest First','Oldest First']}
  const emptyState=<div className="empty item-empty"><strong>{items.length?'No items match your search or filters.':'No lost or found items recorded yet.'}</strong><p>{items.length?'Try another search or clear the filters to see more records.':'Select Record Item to add the first report.'}</p>{(search.trim()||type!=='All'||status!=='All'||category!=='All Categories'||period!=='All')&&<button className="outline" onClick={clearFilters}>Clear filters</button>}</div>

  const close=()=>{removePhoto();setStage(null);setError('')}
  const [moreFilters,setMoreFilters]=useState(false)
  const activeFilters:ActiveFilter[]=[
    ...(search.trim()?[{key:'search',label:`Search: ${search.trim()}`,remove:()=>setSearch('')}]:[]),
    ...(type!=='All'?[{key:'type',label:`Record type: ${type}`,remove:()=>setType('All')}]:[]),
    ...(status!=='All'?[{key:'status',label:`Status: ${status}`,remove:()=>setStatus('All')}]:[]),
    ...(period!=='All'?[{key:'period',label:`Time period: ${period}`,remove:()=>setPeriod('All')}]:[]),
    ...(category!=='All Categories'?[{key:'category',label:`Category: ${category}`,remove:()=>setCategory('All Categories')}]:[]),
  ]
  const open=(item:Item)=>{setSelectedId(item.id);setStage('view')}
  function saveRecord(e:FormEvent<HTMLFormElement>){e.preventDefault();if(photoLoading)return;const data=new FormData(e.currentTarget);const value=(name:string)=>String(data.get(name)||'').trim();if(!value('name')||!value('description')||!value('reporter')||!value('location')){setError('Enter all required details.');return}const item:Item={id:`LF-${crypto.randomUUID().slice(0,8)}`,name:value('name'),category:value('category'),location:value('location'),date:value('date'),time:value('time'),type:recordType,status:recordType==='Found'?'Unclaimed':'Reported Lost',reporterType:value('reporterType'),reporter:value('reporter'),contact:value('contact'),description:value('description'),photo,history:['Sample record created at the Security Office.']};setItems(old=>[item,...old]);close()}
  const found=selected?.type==='Found'?selected:
    linked?.type==='Found'&&reciprocalLostReport(items,linked)?.id===selected?.id?linked:undefined
  function beginConfirmation(next:'verify'|'release'){
    confirmationSubmitted.current=false
    setError('')
    setStage(next)
  }
  function verifyOwnership(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(confirmationSubmitted.current||currentUser?.role!=='Security Head'||!canVerify(found))return
    const lost=reciprocalLostReport(items,found)
    if(!lost||lost.status==='Returned'){setError('The linked lost report is unavailable for verification.');return}
    const fields=new FormData(event.currentTarget)
    const claimant=String(fields.get('claimant')??'').trim()
    const evidence=String(fields.get('evidence')??'').trim()
    const idType=String(fields.get('idType')??'')
    if(!claimant||!evidence||!identificationTypes.includes(idType)||!fields.has('ownershipChecked')){
      setError('Enter the claimant, ID type, and evidence notes, then confirm the checks.')
      return
    }
    const verification={idType,actorId:currentUser.accountId,actorName:currentUser.name,at:new Date().toISOString()}
    confirmationSubmitted.current=true
    setItems(records=>{
      const item=records.find(record=>record.id===found.id)
      if(!canVerify(item))return records
      const currentLost=reciprocalLostReport(records,item)
      if(currentLost?.id!==lost.id||currentLost.status==='Returned')return records
      return records.map(record=>record.id===item.id?{...record,ownershipVerified:true,claimant,evidence,verification}:record)
    })
    setSelectedId(found.id)
    setError('')
    setStage('verified')
  }
  function releaseItem(event:FormEvent<HTMLFormElement>){
    event.preventDefault()
    if(confirmationSubmitted.current||currentUser?.role!=='Security Head'||!canRelease(found))return
    const fields=new FormData(event.currentTarget)
    const recipient=String(fields.get('recipient')??'').trim()
    const releaseLocation=String(fields.get('location')??'').trim()
    if(!recipient||!releaseLocation||!fields.has('handoverConfirmed')){
      setError('Enter the recipient and release location, then confirm the physical handover.')
      return
    }
    const release={actorId:currentUser.accountId,actorName:currentUser.name,at:new Date().toISOString()}
    confirmationSubmitted.current=true
    setItems(records=>{
      const item=records.find(record=>record.id===found.id)
      if(!canRelease(item))return records
      const lost=reciprocalLostReport(records,item)
      return records.map(record=>{
        if(record.id===item.id)return {...record,status:'Returned',recipient,releaseLocation,release}
        if(record.id===lost?.id&&record.status!=='Returned')return {...record,status:'Returned'}
        return record
      })
    })
    setSelectedId(found.id)
    setError('')
    setStage('returned')
  }
  function advanceItem(){
    if(canRelease(found)){
      setSelectedId(found.id)
      setStage('verified')
    }else setStage(selected?.matchedId?'linked':'matches')
  }
  function linkReports(candidate:Item){
    if(!selected||selected.matchedId||selected.status==='Returned'||candidate.type===selected.type||candidate.category!==selected.category||candidate.status==='Returned'||candidate.matchedId)return
    setItems(old=>old.map(record=>record.id===selected.id?{...record,matchedId:candidate.id,status:'Possible Match'}:record.id===candidate.id?{...record,matchedId:selected.id,status:'Possible Match'}:record))
    setStage('linked')
  }
  return <><DashboardContext {...entry}/><Heading title="Lost & Found" subtitle="Record, search, match, verify, and track lost and found property." action={<button className="primary" onClick={()=>setStage('record')}>+ Record Item</button>}/><Stats title="Lost & found overview" metadata="All recorded dates" context="Overdue items and possible-match reports may overlap other counts." rows={[
{label:'Found Items Awaiting Return',value:items.filter(i=>i.type==='Found'&&i.status!=='Returned').length,note:'Found reports not yet marked returned',emphasis:'attention',href:summaryHref('/lost-found',{type:'Found',status:'Awaiting Return',period:'All'})},
{label:'Overdue Found Items',value:items.filter(i=>i.type==='Found'&&i.status==='Overdue').length,note:'Found reports marked overdue',emphasis:'urgent',href:summaryHref('/lost-found',{type:'Found',status:'Overdue',period:'All'})},
{label:'Reports with Possible Matches',value:items.filter(i=>i.status==='Possible Match').length,note:'Flagged reports, not unique matched pairs',emphasis:'attention',href:summaryHref('/lost-found',{status:'Possible Match',period:'All'})},
{label:'Found Items Returned',value:items.filter(i=>i.type==='Found'&&i.status==='Returned').length,note:'Found records only; linked lost reports excluded',href:summaryHref('/lost-found',{type:'Found',status:'Returned',period:'All'})}]}/><Panel title="Item Records" className="record-filters record-results-panel" action={<FilterResults count={rows.length} total={items.length} unit="records" active={activeFilters.length>0} clear={clearFilters}/>} >
    <div className="record-toolbar">
      <QuickFilters label="Record type" options={['All','Lost','Found']} value={type} change={setType}/>
      <div className="record-toolbar-search"><SearchBox value={search} change={setSearch} placeholder="Search lost and found items..."/></div>
      <FilterControl label="Sort"><Select label="Sort items" value={sort} change={setSort} options={itemSorts}/></FilterControl><FilterControl label="View"><Segments responsiveTableLabel label="Display mode" options={['Table','Grid']} value={view} change={setView}/></FilterControl>
      <MoreFiltersButton expanded={moreFilters} toggle={()=>setMoreFilters(v=>!v)} active={Number(status!=='All')+Number(category!=='All Categories')+Number(period!=='All')} controls="item-extra-filters"/>
    </div>
    <div className="filter-row record-filter-row record-extra-filters" id="item-extra-filters" hidden={!moreFilters}>
      <FilterControl label="Status"><Select label="Item status" options={['All','Awaiting Return','Possible Match','Unclaimed','Returned','Overdue']} value={status} change={setStatus}/></FilterControl>
      <FilterControl label="Category"><Select label="Category" value={category} change={setCategory} options={['All Categories',...categories]}/></FilterControl>
      <FilterControl label="Time period"><Select label="Item time period" options={['Today','Week','Month','All']} value={period} change={setPeriod}/></FilterControl>
    </div>
    <FilterChips filters={activeFilters}/>
    {view==='Table'?<ResponsiveRecords label="Item records" records={pageRows.map(i=>({id:i.id,title:i.name,badges:<><Badge value={i.type}/><Badge value={i.status}/></>,metadata:[{label:'Date',value:dateLabel(i.date)+' '+i.time},{label:'Location',value:i.location}],actions:<button className="outline" onClick={()=>open(i)} aria-label={`View details for ${i.name}`}>View details</button>}))} empty={emptyState}><div className="table-scroll"><table className="record-table-headers"><thead><tr>{['Item Name','Category','Location','Date / Time','Type','Status','Actions'].map(h=>{const pair=sortableColumns[h],active=pair?.includes(sort);return <th key={h} scope="col" aria-sort={pair?(active?((sort==='Newest First'||sort.endsWith('Z-A'))?'descending':'ascending'):'none'):undefined}>{pair?<button className="item-sort-button" onClick={()=>setSort(active&&sort===pair[0]?pair[1]:pair[0])}>{h}<span aria-hidden="true">{active?(sort==='Newest First'||sort.endsWith('Z-A')?' \u2193':' \u2191'):' \u2195'}</span></button>:h}</th>})}</tr></thead><tbody>{rows.length?pageRows.map(i=><tr key={i.id} data-record-id={i.id}><td>{i.name}</td><td>{i.category}</td><td>{i.location}</td><td>{dateLabel(i.date)} · {i.time}</td><td>{i.type}<small className="muted block">By {i.reporterType}</small></td><td><Badge value={i.status}/></td><td><button className="text-button" onClick={()=>open(i)}>View</button></td></tr>):<tr><td colSpan={7}>{emptyState}</td></tr>}</tbody></table></div></ResponsiveRecords>:<div className="item-grid lost-found-grid">{pageRows.map(i=><article className="item-card" key={i.id}><div className="item-photo">{(i.photo||staticImages['/public/design/item-placeholder.png'])&&<img src={i.photo||staticImages['/public/design/item-placeholder.png']} alt={i.name}/>}</div><div className="item-info"><div className="module-heading"><h3>{i.name}</h3><Badge value={i.type}/></div><p>{i.category}</p><dl className="details-grid"><div><dt>Recorded By</dt><dd>{i.reporterType}</dd></div><div><dt>Location</dt><dd>{i.location}</dd></div><div><dt>Date / Time</dt><dd>{dateLabel(i.date)} · {i.time}</dd></div><div><dt>Status</dt><dd><Badge value={i.status}/></dd></div></dl><button className="text-button" onClick={()=>open(i)}>VIEW</button></div></article>)}{!rows.length&&emptyState}</div>}<div className="item-pagination" aria-label="Item record pages"><span role="status">{rows.length?`Showing ${(page-1)*pageSize+1} to ${Math.min(page*pageSize,rows.length)} of ${rows.length} records`:'Showing 0 records'}</span><label>Records per page <select aria-label="Records per page" value={filters.pageSize} onChange={e=>setFilter('pageSize',e.target.value)}>{[10,25,50].map(size=><option key={size}>{size}</option>)}</select></label><div><button className="outline" disabled={page===1} onClick={()=>setFilter('page',String(page-1))}>Previous</button><span>Page {page} of {pageCount}</span><button className="outline" disabled={page===pageCount||!rows.length} onClick={()=>setFilter('page',String(page+1))}>Next</button></div></div></Panel>
  {stage==='record'&&<Modal title="Record Item" subtitle="Add a new lost or found item report to CampusGuard" close={close}>{dismiss=><><form onSubmit={saveRecord}><Field label="RECORD TYPE"><Segments label="New record type" options={['Found','Lost']} value={recordType} change={setRecordType}/></Field><h3>Item Details</h3><div className="form-grid"><Field label="Item name *"><input name="name" required placeholder="e.g., Black leather wallet"/></Field><Field label="Category *"><select name="category" required><option value="">Select category</option>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label={recordType==='Lost'?'Last seen at *':'Found at *'}><input key={recordType} name="location" required placeholder="e.g., Gymnasium Lobby"/></Field><div className="form-grid"><Field label="Date *"><input name="date" type="date" defaultValue={campusToday} max={campusToday} required/></Field><Field label="Time *"><input name="time" type="time" required/></Field></div></div><Field label="Item description *"><textarea name="description" required placeholder="Describe the item: color, brand, features, or identifying details"/></Field><h3>Reporting Details</h3><div className="form-grid"><Field label="Reported by *"><select name="reporterType" required>{['Student','Guard','Staff','Visitor'].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="Reporter name *"><input name="reporter" required placeholder="Full name"/></Field><Field label="Contact number"><input name="contact" type="tel" placeholder="Contact for updates"/></Field><div className="field"><span>Photo (optional)</span><small className="muted">Take a picture or choose an image up to 5 MB.</small><div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button type="button" className="outline" onClick={()=>cameraInput.current?.click()}>{photo?'Replace: Take Photo':'Take Photo'}</button><button type="button" className="outline" onClick={()=>libraryInput.current?.click()}>{photo?'Replace: Choose Photo':'Choose Photo'}</button>{(photo||photoLoading)&&<button type="button" className="outline" onClick={removePhoto}>Remove Photo</button>}</div><input hidden ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={e=>selectPhoto(e.currentTarget)}/><input hidden ref={libraryInput} type="file" accept="image/*" onChange={e=>selectPhoto(e.currentTarget)}/>{photoLoading&&<small role="status">Loading photo?</small>}{photoError&&<p role="alert" className="error-text">{photoError}</p>}</div></div>{photo&&<img className="upload-preview" src={photo} alt="Selected item photo"/>}{error&&<p role="alert" className="error-text">{error}</p>}<Footer close={dismiss}><button type="submit" className="primary" disabled={photoLoading}>Save Record</button></Footer></form></>}</Modal>}
  {selected&&stage&&stage!=='record'&&<Modal key={stage} title={({view:'Item Details',matches:'Possible Matches',linked:'Linked Reports',verify:'Verify Ownership',verified:'Ownership Verified',release:'Record Physical Release',returned:'Item Returned'})[stage]} className={stage==='view'?'lost-item-dialog':undefined} close={close} subtitle={stage==='verify'?'The claimant must appear in person for verification.':stage==='release'?'Only proceed after handing the item to the verified claimant.':undefined}>{dismiss=><>
    {stage!=='matches'&&stage!=='view'&&<div className="detail-heading"><div><h3>{selected.name}</h3><Badge value={selected.type}/></div><Badge value={selected.status}/></div>}
    {stage==='view'&&<ItemDetails key={selected.id} item={selected} linked={linked} handover={found} close={dismiss} actionLabel={canRelease(found)?'Record Physical Release':selected.matchedId?'View Linked Reports':'Review Matches'} advance={advanceItem}/>}
    {stage==='matches'&&<ItemMatchReview selected={selected} items={items} link={linkReports} close={dismiss}/>}
    {stage==='linked'&&<><div className="callout amber"><strong>Possible Match &mdash; Awaiting Review</strong><p>The found item and lost report are linked for Security Office review.</p></div><h3>Reports Linked for Review</h3><div className="form-grid">{[selected,linked].filter(Boolean).map(i=><div className="callout" key={i!.id}><strong>{i!.type.toUpperCase()} REPORT</strong><p>{i!.name}</p><p>{i!.location} · {dateLabel(i!.date)}</p></div>)}</div><p>Compare unique details and confirm identity and ownership in person. Do not release yet.</p><Footer close={dismiss}>{canVerify(found)&&<button className="primary" onClick={()=>beginConfirmation('verify')}>Verify Ownership</button>}</Footer></>}
    {stage==='verify'&&<form onSubmit={verifyOwnership}>
      <div className="callout amber">Linking reports does not confirm that the claimant owns the item.</div>
      <h3>Claimant and Item Checks</h3>
      <div className="form-grid">
        <Field label="Claimant Name *"><input name="claimant" required pattern=".*\S.*"/></Field>
        <Field label="ID Type Checked *"><select name="idType" required defaultValue=""><option value="">Select identification type</option>{identificationTypes.map(type=><option key={type}>{type}</option>)}</select></Field>
      </div>
      <Field label="Ownership Evidence Notes *"><textarea name="evidence" required/></Field>
      <div className="checks"><label><input name="ownershipChecked" type="checkbox" required/>Identity checked, item details compared, and ownership evidence reviewed.</label></div>
      {error&&<p role="alert" className="error-text">{error}</p>}
      <Footer close={dismiss}><button className="primary" type="submit">Confirm Verification</button></Footer>
    </form>}
    {stage==='verified'&&<>
      <div className="callout green">Ownership Verified &mdash; Item Still Held</div>
      <OwnershipFacts item={selected}/>
      <p>Physical release requires a separate confirmation and record.</p>
      <Footer close={dismiss}>{canRelease(selected)&&<button className="primary" onClick={()=>beginConfirmation('release')}>Record Physical Release</button>}</Footer>
    </>}
    {stage==='release'&&<form onSubmit={releaseItem}>
      <div className="callout amber">Verification Complete &mdash; Release Still Pending</div>
      <h3>Handover Details</h3>
      <div className="form-grid">
        <Field label="Recipient Name *"><input name="recipient" defaultValue={selected.claimant} required pattern=".*\S.*"/></Field>
        <Field label="Release Location *"><input name="location" required placeholder="e.g., UNC Security Office"/></Field>
        <Field label="Released By"><input disabled value={currentUser?.name??''}/></Field>
        <Field label="Release Date / Time"><input disabled value="Recorded on confirmation (Asia/Manila)"/></Field>
      </div>
      <div className="checks"><label><input name="handoverConfirmed" type="checkbox" required/>I confirm the item was physically handed to the verified claimant.</label></div>
      {error&&<p role="alert" className="error-text">{error}</p>}
      <Footer close={dismiss}><button className="primary" type="submit">Confirm Release</button></Footer>
    </form>}
    {stage==='returned'&&<>
      <div className="callout green">Returned &mdash; Process Complete</div>
      <ReleaseFacts item={selected}/>
      <p>Physical handover has been confirmed in this frontend demonstration.</p>
      <Footer close={dismiss}/>
    </>}
  </>}</Modal>}</>
}
