import { useRef, useState } from 'react'
import { MapPin, Maximize2, Minus, Plus } from 'lucide-react'
import { useDemo } from '../../app/store'
import { Field, Footer, Modal } from '../../shared/ui/ui'
import { formatDutyTour, weeklyDuties } from './weekly-duty-template'
import type { CampusPost } from './deployment'

type MapProps={selected?:string; onSelect:(id:string)=>void; highlighted?:Set<string>}
type MapImageProps=MapProps&{photo:string; posts:CampusPost[]; zoom?:number; onPlace?:(pin:NonNullable<CampusPost['pin']>)=>void}

function MapImage({photo,posts,selected,onSelect,highlighted,zoom=1,onPlace}:MapImageProps){
  return <div className="deployment-map-scroll" tabIndex={zoom>1?0:undefined} aria-label="Campus map image">
    <div className="deployment-map-image" style={{width:zoom*100+'%'}}>
      <img src={photo} alt="University of Nueva Caceres campus map" draggable={false} onClick={onPlace?event=>{
        const bounds=event.currentTarget.getBoundingClientRect()
        onPlace({x:Math.round((event.clientX-bounds.left)/bounds.width*100),y:Math.round((event.clientY-bounds.top)/bounds.height*100)})
      }:undefined}/>
      {posts.map(post=>post.pin&&<button type="button" className="deployment-pin" key={post.id}
        aria-label={post.name+(highlighted?.has(post.id)?', matching deployment':'')} title={post.name}
        aria-pressed={post.id===selected} data-matching={highlighted?.has(post.id)||false}
        style={{left:post.pin.x+'%',top:post.pin.y+'%'}} onClick={()=>onSelect(post.id)}><MapPin size={17} aria-hidden="true"/></button>)}
    </div>
  </div>
}

export function CampusMap(props:MapProps){
  const {mapPhoto,posts}=useDemo()
  const [zoom,setZoom]=useState(1),[full,setFull]=useState(false)
  function content(onSelect:MapProps['onSelect']){
    return <>
      <div className="deployment-map-tools" aria-label="Map zoom">
        <button type="button" className="outline" aria-label="Zoom out" disabled={zoom===1} onClick={()=>setZoom(zoom-.5)}><Minus size={16}/></button>
        <button type="button" className="outline" onClick={()=>setZoom(1)}>Reset zoom</button>
        <button type="button" className="outline" aria-label="Zoom in" disabled={zoom===2} onClick={()=>setZoom(zoom+.5)}><Plus size={16}/></button>
        <span className="muted">{Math.round(zoom*100)}%</span>
      </div>
      {mapPhoto&&<MapImage {...props} onSelect={onSelect} photo={mapPhoto} posts={posts} zoom={zoom}/>}
      {!posts.some(post=>post.pin)&&<p className="muted deployment-map-note">No pins placed. Select a post using the filter, or place pins in Manage Map.</p>}
    </>
  }
  return <section className="panel deployment-map" aria-labelledby="deployment-map-heading">
    <header><h2 id="deployment-map-heading">UNC Campus Map</h2>
      {mapPhoto&&<button type="button" className="outline deployment-full-map" onClick={()=>setFull(true)}><Maximize2 size={15} aria-hidden="true"/>Full screen</button>}
    </header>
    {mapPhoto?content(props.onSelect):<p className="empty">No campus map uploaded. Use List View, or upload an image in Manage Map.</p>}
    {full&&mapPhoto&&<Modal wide title="UNC Campus Map" className="deployment-map-fullscreen" close={()=>setFull(false)}>{dismiss=><>
      {content(id=>{props.onSelect(id);dismiss()})}<Footer close={dismiss}/>
    </>}</Modal>}
  </section>
}

export function ManageCampusMap({close}:{close:()=>void}){
  const db=useDemo()
  const [postId,setPostId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [pendingPhoto,setPendingPhoto]=useState<string|undefined>(),[placing,setPlacing]=useState(false),[loading,setLoading]=useState(false)
  const readVersion=useRef(0)
  const post=db.posts.find(item=>item.id===postId)
  const linked=(id:string)=>Object.values(db.dutyPostLinks).some(ids=>ids?.includes(id))
  const canRemove=!!post&&!linked(post.id)&&!db.assignments.some(row=>row.location===post.legacyName)
  const activity=(event:string,detail:string)=>db.activity(event,detail,[])
  function select(id:string){setPostId(id);setPlacing(false);setError('');setNotice('')}
  function savePost(name:string){
    const trimmed=name.trim()
    if(!trimmed||db.posts.some(item=>item.id!==postId&&item.name.toLowerCase()===trimmed.toLowerCase())){
      setError('Enter a unique post name.');return
    }
    if(post&&post.name===trimmed)return
    const id=post?.id??crypto.randomUUID()
    db.setPosts(items=>post?items.map(item=>item.id===id?{...item,name:trimmed}:item):[...items,{id,name:trimmed}])
    activity(post?'Campus post renamed':'Campus post created',post?post.name+' → '+trimmed:trimmed)
    select(id);setNotice(post?'Post name saved.':'Campus post added.')
  }
  function savePin(pin:NonNullable<CampusPost['pin']>){
    if(!post||!db.mapPhoto||Object.values(pin).some(value=>!Number.isFinite(value)||value<0||value>100))return
    db.setPosts(items=>items.map(item=>item.id===post.id?{...item,pin}:item))
    activity(post.pin?'Campus post moved':'Campus post pin placed',post.name)
    setPlacing(false);setNotice('Pin position saved.')
  }
  function loadPhoto(file?:File){
    if(!file)return
    const attempt=++readVersion.current
    setError('');setPendingPhoto(undefined);setLoading(false)
    if(!file.type.startsWith('image/')||file.size>10*1024*1024){
      setError('Choose an image file of 10 MB or less.');return
    }
    setLoading(true)
    const reader=new FileReader()
    function fail(){
      if(attempt!==readVersion.current)return
      setLoading(false);setError('The image could not be opened. Try another file.')
    }
    reader.onerror=fail
    reader.onload=()=>{
      if(attempt!==readVersion.current)return
      if(typeof reader.result!=='string')return fail()
      const image=new Image()
      image.onerror=fail
      image.onload=()=>{
        if(attempt!==readVersion.current)return
        setLoading(false);setPendingPhoto(image.src)
      }
      image.src=reader.result
    }
    reader.readAsDataURL(file)
  }
  function changePhoto(photo?:string){
    readVersion.current++
    db.setMapPhoto(photo)
    db.setPosts(items=>items.map(item=>({...item,pin:undefined})))
    activity(photo?(db.mapPhoto?'Campus map replaced':'Campus map uploaded'):'Campus map removed','UNC campus map')
    setPendingPhoto(undefined);setPlacing(false);setLoading(false)
    setNotice(photo?'Map image saved. Place or confirm pin positions on this image.':'Map image removed.')
  }

  return <Modal wide title="Manage Map" subtitle="Update the campus image, post pins, and links to weekly duties." close={()=>{readVersion.current++;close()}}>{dismiss=><>
    <div className="deployment-manage">
      <section><h3>Map image</h3>
        <Field label={db.mapPhoto?'Replace campus map':'Upload campus map'}><input type="file" accept="image/*" onChange={e=>{loadPhoto(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/></Field>
        {loading&&<p role="status" className="muted">Checking image…</p>}
        {pendingPhoto!==undefined?<div className="callout" role="group" aria-label="Confirm map image change">
          <p>{db.posts.some(item=>item.pin)?'Existing pins must be placed again after changing the map image. Duty links are kept.':'Save this change to the campus map?'}</p>
          <button type="button" className="outline" onClick={()=>setPendingPhoto(undefined)}>Cancel image change</button>{' '}
          <button type="button" className="primary" onClick={()=>changePhoto(pendingPhoto||undefined)}>{pendingPhoto?'Save map image':'Remove map image'}</button>
        </div>:db.mapPhoto&&<button type="button" className="text-button" onClick={()=>{readVersion.current++;setLoading(false);setPendingPhoto('')}}>Remove image</button>}
      </section>
      <section><h3>Campus posts</h3>
        <Field label="Choose a campus post"><select value={postId} onChange={e=>select(e.target.value)}>
          <option value="">New campus post</option>{db.posts.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
        </select></Field>
        <form className="deployment-manage-line" key={postId} onSubmit={e=>{e.preventDefault();savePost(String(new FormData(e.currentTarget).get('name')??''))}}>
          <Field label="Post name"><input name="name" defaultValue={post?.name} required maxLength={80}/></Field>
          <button type="submit" className="outline">{post?'Rename post':'Add campus post'}</button>
          {post&&<button type="button" className="outline" disabled={!canRemove} onClick={()=>{
            if(!canRemove)return
            db.setPosts(items=>items.filter(item=>item.id!==post.id));activity('Campus post removed',post.name);select('')
          }}>Remove post</button>}
        </form>
        {post&&!canRemove&&<p className="muted">Linked or historically referenced posts cannot be removed.</p>}
        {post&&db.mapPhoto&&<>
          <div className="deployment-map-tools">
            <button type="button" className="outline" aria-pressed={placing} onClick={()=>setPlacing(!placing)}>{placing?'Cancel placement':post.pin?'Move pin on map':'Place pin on map'}</button>
          </div>
          {placing&&<p className="muted" role="status">Select a point on the image, or enter the pin coordinates below.</p>}
          <MapImage photo={db.mapPhoto} posts={db.posts} selected={post.id} onSelect={select} onPlace={placing?savePin:undefined}/>
          <form className="deployment-manage-line" key={post.id+'-'+post.pin?.x+'-'+post.pin?.y} onSubmit={e=>{
            e.preventDefault();const values=new FormData(e.currentTarget)
            savePin({x:Number(values.get('x')),y:Number(values.get('y'))})
          }}>
            <Field label="Pin horizontal (%)"><input name="x" type="number" min="0" max="100" required defaultValue={post.pin?.x}/></Field>
            <Field label="Pin vertical (%)"><input name="y" type="number" min="0" max="100" required defaultValue={post.pin?.y}/></Field>
            <button type="submit" className="outline">Save pin</button>
          </form>
        </>}
        {post&&<form key={post.id} onSubmit={e=>{
          e.preventDefault()
          const checked=new Set(new FormData(e.currentTarget).getAll('duty').map(Number))
          if(weeklyDuties.every(duty=>checked.has(duty.number)===!!db.dutyPostLinks[duty.number]?.includes(post.id)))return
          db.setDutyPostLinks(previous=>Object.fromEntries(weeklyDuties.map(duty=>[duty.number,[
            ...(previous[duty.number]??[]).filter(id=>id!==post.id),...(checked.has(duty.number)?[post.id]:[]),
          ]])))
          activity('Campus post duty links updated',post.name);setNotice('Duty links saved.')
        }}>
          <fieldset className="deployment-duty-links"><legend>Weekly duties linked to {post.name}</legend>
            {weeklyDuties.map(duty=><label key={duty.number}><input name="duty" type="checkbox" value={duty.number}
              defaultChecked={db.dutyPostLinks[duty.number]?.includes(post.id)}/><span>{duty.name} · {formatDutyTour(duty)}</span></label>)}
          </fieldset>
          <button type="submit" className="outline">Save duty links</button>
        </form>}
      </section>
      {error&&<p role="alert" className="error-text">{error}</p>}
      {notice&&<p role="status" className="callout green">{notice}</p>}
    </div>
    <Footer close={dismiss}/>
  </>}</Modal>
}

