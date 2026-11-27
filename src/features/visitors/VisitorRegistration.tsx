import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { useDemo } from '../../app/store'
import { Field, Footer, Modal } from '../../shared/ui/ui'
import { ArrowLeft, ArrowRight, Search, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import { matchingVisitors, visitorIdTypes, visitorName } from './visitor-data'
import type { CheckInInput, VisitorProfile } from './visitor-data'
import './visitor-registration.css'

export default function VisitorRegistration({initialGate,close,complete}:{initialGate:string;close:()=>void;complete:(message:string)=>void}){
  const db=useDemo()
  const gates=db.currentUser?.gates||[]
  const [form,setForm]=useState<CheckInInput>({firstName:'',middleName:'',lastName:'',idType:'',purpose:'',idDeposited:'',gate:initialGate,identityVerified:false})
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1)
  const [mode,setMode]=useState<'new'|'returning'|null>(null)
  const [pending,setPending]=useState('')
  const errors=pending&&db.visitorResult?.requestId===pending?db.visitorResult.errors:{}
  const busy=!!pending&&db.visitorResult?.requestId!==pending
  const handledResult=useRef('')
  const searchArea=useRef<HTMLDivElement>(null),searchInput=useRef<HTMLInputElement>(null),formRef=useRef<HTMLFormElement>(null),submitting=useRef(false)
  const ready=mode==='new'||(mode==='returning'&&!!form.profileId)
  useEffect(()=>{
    const target=mode==='new'?'[name=firstName]':mode==='returning'?(form.profileId?'[name=purpose]':'#visitor-profile-search'):'[data-visitor-mode=new]'
    const field=formRef.current?.querySelector<HTMLElement>(target)
    field?.focus({preventScroll:true})
    if(form.profileId)field?.scrollIntoView({block:'nearest'})
    else{const body=formRef.current?.querySelector('.visitor-form-body');if(body)body.scrollTop=0}
  },[mode,form.profileId])
  const matches=matchingVisitors(db.visitorProfiles,query)
  const expanded=open&&query.trim().length>=2
  const activeOptionId=expanded?matches[active]?.id:undefined
  useEffect(()=>{if(activeOptionId)document.getElementById(`visitor-option-${activeOptionId}`)?.scrollIntoView({block:'nearest'})},[activeOptionId])
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!searchArea.current?.contains(event.target as Node))setOpen(false)}
    document.addEventListener('pointerdown',outside)
    return ()=>document.removeEventListener('pointerdown',outside)
  },[])
  useEffect(()=>{
    const result=db.visitorResult
    if(!pending||result?.requestId!==pending||handledResult.current===pending)return
    handledResult.current=pending
    submitting.current=false
    if(result.ok){complete(result.message!);return}
    requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>('[aria-invalid=true],.visitor-form-error')?.focus())
  },[db.visitorResult,pending,complete])
  function change(key:keyof CheckInInput,value:string|boolean){
    const nameChanged=['firstName','middleName','lastName'].includes(key)
    setForm(old=>({...old,[key]:value,...(nameChanged?{profileId:undefined}:{}),...(nameChanged||key==='idType'?{identityVerified:false}:{})}))
    setPending('')
  }
  function resetSelection(nextQuery=''){
    if(submitting.current)return
    setForm(old=>({firstName:'',middleName:'',lastName:'',idType:'',purpose:'',idDeposited:'',gate:old.gate,identityVerified:false}))
    setQuery(nextQuery);setActive(-1);setPending('');setOpen(nextQuery.trim().length>=2)
  }
  function chooseMode(value:typeof mode){
    if(submitting.current)return
    resetSelection();setMode(value)
  }
  function select(profile:VisitorProfile){
    setForm(old=>({...old,profileId:profile.id,firstName:profile.firstName,middleName:profile.middleName||'',lastName:profile.lastName,idType:profile.idType,purpose:'',idDeposited:'',identityVerified:false}))
    setQuery(visitorName(profile));setOpen(false);setActive(-1);setPending('');searchInput.current?.focus()
  }
  function searchKeys(event:KeyboardEvent<HTMLInputElement>){
    if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setOpen(false);setActive(-1);return}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true)
      if(matches.length)setActive(index=>event.key==='ArrowDown'?(index+1)%matches.length:(index<=0?matches.length-1:index-1))
    }
    if(event.key==='Enter'){event.preventDefault();if(expanded&&active>=0&&matches[active])select(matches[active])}
  }
  function submit(event:FormEvent){
    event.preventDefault()
    if(submitting.current||!ready)return
    submitting.current=true
    setPending(db.checkInVisitor(form))
  }
  const error=(key:string)=>errors[key]?<small className="error-text" id={`registration-${key}-error`}>{errors[key]}</small>:null
  const invalid=(key:string)=>({'aria-invalid':!!errors[key],'aria-describedby':errors[key]?`registration-${key}-error`:undefined})
  return <Modal title="Record Visitor" subtitle="Guard-assisted check-in. Fields marked * are required." className="visitor-transaction visitor-kiosk" close={close}>{dismiss=><>
    <form noValidate onSubmit={submit} ref={formRef}>
      <div className="visitor-form-body">
        <div className="visitor-kiosk-context"><span>Entry gate: <strong>{form.gate||'Select a gate when recording'}</strong></span><span>Recorded by: <strong>{db.currentUser?.name}</strong></span></div>
        {!mode?<div className="visitor-kiosk-welcome">
          <h3>Who are you recording?</h3><p>Choose a visitor type to get started.</p>
          <div className="visitor-kiosk-choices">
            <button type="button" data-visitor-mode="new" onClick={()=>chooseMode('new')}><span className="visitor-choice-icon"><UserPlus size={28} aria-hidden="true"/></span><strong>New Visitor</strong><span>Record someone visiting for the first time.</span><span className="visitor-choice-action">Enter visitor details <ArrowRight size={18} aria-hidden="true"/></span></button>
            <button type="button" data-visitor-mode="returning" onClick={()=>chooseMode('returning')}><span className="visitor-choice-icon"><Search size={28} aria-hidden="true"/></span><strong>Returning Visitor</strong><span>Find a visitor's previous details.</span><span className="visitor-choice-action">Search visitor records <ArrowRight size={18} aria-hidden="true"/></span></button>
          </div>
        </div>:<>
          <div className="visitor-kiosk-path"><strong>{mode==='new'?<UserPlus size={20} aria-hidden="true"/>:<Search size={20} aria-hidden="true"/>}{mode==='new'?'New Visitor':'Returning Visitor'}</strong><button type="button" className="text-button" disabled={busy} onClick={()=>chooseMode(null)}><ArrowLeft size={16} aria-hidden="true"/>Change visitor type</button></div>
          {mode==='returning'&&!form.profileId&&<section className="visitor-kiosk-search">
            <h3>Find the returning visitor</h3><p>Search by name, then select the correct person. Similar names are listed separately.</p>
            <div ref={searchArea} className="visitor-autocomplete" onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false)}}>
              <Field label="Search Existing Visitor"><input id="visitor-profile-search" ref={searchInput} type="text" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded?'visitor-profile-suggestions':undefined} aria-activedescendant={activeOptionId?'visitor-option-'+activeOptionId:undefined} value={query} onChange={event=>{setQuery(event.target.value);setActive(-1);setOpen(true)}} onFocus={()=>setOpen(true)} onKeyDown={searchKeys} placeholder="Type at least 2 characters"/></Field>
              {expanded&&<><ul id="visitor-profile-suggestions" role="listbox" aria-label="Matching visitor profiles">{matches.map((profile,index)=><li id={'visitor-option-'+profile.id} role="option" aria-selected={active===index} key={profile.id} onMouseDown={event=>event.preventDefault()} onClick={()=>select(profile)}><strong>{visitorName(profile)}</strong><small>{profile.id} &middot; {profile.idType}</small></li>)}</ul>{!matches.length&&<div className="visitor-no-match" role="status"><strong>No matching visitors found.</strong><p>Check the spelling or record this person as a new visitor.</p><button className="outline" type="button" onClick={()=>chooseMode('new')}>Record as new visitor</button></div>}</>}
            </div>
          </section>}
          {ready&&<>
            <div className="visitor-kiosk-columns">
              <section className="visitor-kiosk-section" aria-labelledby="visitor-identity-heading"><h3 id="visitor-identity-heading"><UserRound size={18} aria-hidden="true"/>Visitor details</h3>
                {mode==='new'?<><div className="visitor-name-fields">
                  <Field label="First Name *"><input name="firstName" required value={form.firstName} onChange={event=>change('firstName',event.target.value)} {...invalid('firstName')}/>{error('firstName')}</Field>
                  <Field label="Middle Name (optional)"><input name="middleName" value={form.middleName} onChange={event=>change('middleName',event.target.value)}/></Field>
                  <Field label="Last Name *"><input name="lastName" required value={form.lastName} onChange={event=>change('lastName',event.target.value)} {...invalid('lastName')}/>{error('lastName')}</Field>
                </div><button type="button" className="text-button visitor-find-returning" disabled={busy} onClick={()=>chooseMode('returning')}>Find a returning visitor instead</button></>:<div className="visitor-profile-state"><span className="visitor-profile-label">Returning Visitor</span><strong>{visitorName(form)}</strong><span>{form.profileId} &middot; {db.visitorProfiles.find(profile=>profile.id===form.profileId)?.idType}</span><button className="text-button" type="button" disabled={busy} onClick={()=>resetSelection()}>Change visitor</button></div>}
                <Field label="ID Type *"><select name="idType" required value={form.idType} onChange={event=>change('idType',event.target.value)} {...invalid('idType')}><option value="">Select ID type</option>{visitorIdTypes.map(type=><option key={type}>{type}</option>)}</select>{error('idType')}</Field>
              </section>
              <section className="visitor-kiosk-section" aria-labelledby="visitor-visit-heading"><h3 id="visitor-visit-heading">This visit</h3>
                <Field label="Purpose of Visit *"><input name="purpose" required value={form.purpose} onChange={event=>change('purpose',event.target.value)} {...invalid('purpose')}/>{error('purpose')}</Field>
                <Field label="Entry Gate *"><select name="gate" required value={form.gate} onChange={event=>change('gate',event.target.value)} {...invalid('gate')}><option value="">Select entry gate</option>{gates.map(gate=><option key={gate}>{gate}</option>)}</select>{error('gate')}</Field>
                <fieldset className="visitor-radio" aria-describedby={errors.idDeposited?'registration-idDeposited-error':undefined}><legend>ID Deposited *</legend><div>{['Yes','No'].map(value=><label key={value}><input type="radio" name="idDeposited" required value={value} checked={form.idDeposited===value} onChange={()=>change('idDeposited',value)} {...invalid('idDeposited')}/>{value}</label>)}</div>{error('idDeposited')}</fieldset>
              </section>
            </div>
            <div className="checks visitor-kiosk-verification"><div><ShieldCheck size={22} aria-hidden="true"/><strong>Verify before check-in</strong></div><label><input type="checkbox" name="identityVerified" required checked={form.identityVerified} onChange={event=>change('identityVerified',event.target.checked)} {...invalid('identityVerified')}/>I checked the visitor's identity against the presented ID. *</label>{error('identityVerified')}</div>
          </>}
          {(errors.form||errors.profile)&&<p className="error-text visitor-form-error" role="alert" tabIndex={-1}>{errors.form||errors.profile}</p>}
        </>}
      </div>
      {ready?<Footer close={dismiss}><button type="submit" className="primary" disabled={busy}>{busy?'Recording...':'Confirm Check-In'}</button></Footer>:<footer><button className="outline" type="button" onClick={dismiss}>Cancel</button></footer>}
    </form>
  </>}</Modal>
}
