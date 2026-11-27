import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import { useDemo } from '../../app/store'
import { accountName,securityGates } from './auth-data'
import type { GuardAccountChange } from './auth-data'
import { Badge,Field,Footer,Heading,Modal,Panel,SearchBox } from '../../shared/ui/ui'
import './accounts.css'

type AccountStage='create'|'access'|'password'|'disable'|null
export default function GuardAccounts(){
  const db=useDemo()
  const [stage,setStage]=useState<AccountStage>(null),[selectedId,setSelectedId]=useState(''),[search,setSearch]=useState(''),[request,setRequest]=useState('')
  const locked=useRef(false),handled=useRef(''),formRef=useRef<HTMLFormElement>(null)
  const result=db.authResult?.requestId===request?db.authResult:null
  const busy=!!request&&!result
  const errors=result?.errors||{}
  const selected=db.accounts.find(account=>account.id===selectedId&&account.role==='Security Guard')
  const accounts=db.accounts.filter(account=>account.role==='Security Guard'&&`${account.username} ${accountName(account,db.people)}`.toLowerCase().includes(search.trim().toLowerCase()))
  const eligible=db.people.filter(person=>person.status==='Active'&&!db.accounts.some(account=>account.personId===person.id))
  useEffect(()=>{
    if(!request||!result||handled.current===request)return
    handled.current=request;locked.current=false
    if(!result.ok)requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>('[aria-invalid=true],.account-form-error')?.focus())
  },[request,result])
  if(db.currentUser?.role!=='Security Head')return <Navigate to="/dashboard" replace/>
  function open(next:AccountStage,id=''){setSelectedId(id);setStage(next);setRequest('');locked.current=false}
  function commit(change:GuardAccountChange){if(locked.current)return;locked.current=true;setRequest(db.manageGuardAccount(change))}
  return <div className="guard-accounts"><Heading title="Guard Accounts" subtitle="Manage demo guard accounts and gate access." action={<button className="primary" onClick={()=>open('create')}>+ Create Guard Account</button>}/>
    {result?.ok&&<p className="visitor-success" role="status">{result.message}</p>}
    <Panel title="Security Guard Accounts"><div className="filter-row"><SearchBox value={search} change={setSearch} placeholder="Search guard name or username..."/></div>
      {accounts.length?<ul className="account-list">{accounts.map(account=>{const person=db.people.find(p=>p.id===account.personId);return <li key={account.id}><div><h3>{accountName(account,db.people)}</h3><p>{account.username} &middot; {account.personId}</p><p>Authorized gates: {account.gates.join(', ')}</p></div><div className="account-row-actions"><Badge value={!account.enabled?'Disabled':person?.status!=='Active'?'Personnel inactive':'Active'}/><select aria-label={`Actions for ${account.username}`} value="" onChange={event=>{const value=event.target.value;if(value==='enable'){setStage(null);setRequest('');locked.current=false;commit({kind:'enabled',accountId:account.id,enabled:true})}else open(value as AccountStage,account.id)}}><option value="" disabled>Actions</option><option value="access">Edit Gate Access</option><option value="password">Reset Password</option><option value={account.enabled?'disable':'enable'}>{account.enabled?'Disable Account':'Enable Account'}</option></select></div></li>})}</ul>:<div className="empty"><strong>No guard accounts match your search.</strong>{search&&<button className="outline" onClick={()=>setSearch('')}>Clear search</button>}</div>}
    </Panel>
    {!stage&&result&&!result.ok&&<p className="error-text" role="alert">{Object.values(errors).join(' ')}</p>}
    <p className="muted">Account access and scheduled duties are separate. Account changes and passwords are temporary in this demo.</p>
    {stage&&!result?.ok&&<Modal key={stage+'|'+selectedId} title={stage==='create'?'Create Guard Account':stage==='access'?'Edit Gate Access':stage==='password'?'Reset Demo Password':'Disable Guard Account'} close={()=>setStage(null)}>{dismiss=><>
      {stage==='create'&&!eligible.length?<><p>No active personnel without an account are available. Add an active personnel profile first, then return here.</p><Footer close={dismiss}/></>:<form noValidate ref={formRef} onSubmit={event=>{
        event.preventDefault();const data=new FormData(event.currentTarget)
        if(stage==='create')commit({kind:'create',personId:String(data.get('personId')||''),username:String(data.get('username')||''),password:String(data.get('password')||''),gates:data.getAll('gates').map(String)})
        else if(selected&&stage==='access')commit({kind:'access',accountId:selected.id,gates:data.getAll('gates').map(String)})
        else if(selected&&stage==='password')commit({kind:'password',accountId:selected.id,password:String(data.get('password')||'')})
        else if(selected)commit({kind:'enabled',accountId:selected.id,enabled:false})
      }}>
        {selected&&<p className="account-selected">{accountName(selected,db.people)} &middot; {selected.username}</p>}
        {stage==='create'&&<><Field label="Personnel Profile *"><select name="personId" required defaultValue="" aria-invalid={!!errors.personId} aria-describedby={errors.personId?'account-person-error':undefined}><option value="">Select active personnel</option>{eligible.map(person=><option key={person.id} value={person.id}>{person.name} ({person.id})</option>)}</select>{errors.personId&&<small className="error-text" id="account-person-error">{errors.personId}</small>}</Field><Field label="Username *"><input name="username" required autoComplete="off" autoCapitalize="none" aria-invalid={!!errors.username} aria-describedby={errors.username?'account-username-error':undefined}/>{errors.username&&<small className="error-text" id="account-username-error">{errors.username}</small>}</Field></>}
        {(stage==='create'||stage==='password')&&<Field label={stage==='create'?'Initial Demo Password *':'New Demo Password *'}><input name="password" type="password" required minLength={8} autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password?'account-password-error':undefined}/>{errors.password&&<small className="error-text" id="account-password-error">{errors.password}</small>}</Field>}
        {(stage==='create'||stage==='access')&&<fieldset className="account-gates"><legend>Authorized Gates *</legend>{securityGates.map(gate=><label key={gate}><input name="gates" value={gate} type="checkbox" defaultChecked={stage==='access'&&selected?.gates.includes(gate)} aria-invalid={!!errors.gates} aria-describedby={errors.gates?'account-gates-error':undefined}/>{gate}</label>)}{errors.gates&&<small className="error-text" id="account-gates-error">{errors.gates}</small>}</fieldset>}
        {stage==='disable'&&<p>This guard will no longer be able to sign in while the account is disabled. Visitor records and duty assignments are preserved.</p>}
        {errors.form&&<p className="error-text account-form-error" role="alert" tabIndex={-1}>{errors.form}</p>}
        <Footer close={dismiss}><button type="submit" className="primary" disabled={busy}>{busy?'Saving...':stage==='create'?'Create Account':stage==='access'?'Save Gate Access':stage==='password'?'Reset Password':'Disable Account'}</button></Footer>
      </form>}
    </>}</Modal>}
  </div>
}
