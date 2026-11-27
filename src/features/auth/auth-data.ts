import type { Person, Visit } from '../../data/data.ts'

export type UserRole='Security Head'|'Security Guard'
export type MockAccount={id:string;username:string;password:string;role:UserRole;name?:string;personId?:string;enabled:boolean;gates:string[]}
export type SessionUser={accountId:string;username:string;name:string;role:UserRole;personId?:string;gates:string[]}
export const securityGates=['Gate 1 (Main)','Gate 2 (Side)']
// shortcut: these credentials are public demo fixtures; replace with server authentication before real use.
export const mockAccounts:MockAccount[]=[
  {id:'ACCOUNT-HEAD',username:'head',password:'CampusHead123!',role:'Security Head',name:'Rosario Bautista',enabled:true,gates:[...securityGates]},
  {id:'ACCOUNT-MAIN',username:'guard.main',password:'CampusGuard123!',role:'Security Guard',personId:'SEC-001',enabled:true,gates:[securityGates[0]]},
  {id:'ACCOUNT-SIDE',username:'guard.side',password:'CampusGuard123!',role:'Security Guard',personId:'SEC-003',enabled:true,gates:[securityGates[1]]},
]
export function accountName(account:MockAccount|undefined,people:Person[]){
  return account?.role==='Security Head'?account.name||'Security Head':people.find(p=>p.id===account?.personId)?.name||'Not Recorded'
}
export function resolveSession(accounts:MockAccount[],sessionId:string|null,people:Person[]):SessionUser|null{
  const account=accounts.find(a=>a.id===sessionId)
  if(!account?.enabled||!['Security Head','Security Guard'].includes(account.role))return null
  if(account.role==='Security Guard'&&(!people.some(p=>p.id===account.personId&&p.status==='Active')||!account.gates.length||account.gates.some(g=>!securityGates.includes(g))))return null
  return {accountId:account.id,username:account.username,name:accountName(account,people),role:account.role,personId:account.role==='Security Guard'?account.personId:undefined,gates:account.role==='Security Head'?[...securityGates]:account.gates}
}
export function canAccessPath(user:SessionUser|null,path:string){
  if(!user)return false
  path=path.replace(/\/+$/,'')||'/'
  if(['/dashboard','/visitors','/help'].includes(path))return true
  return user.role==='Security Head'&&(['/analytics','/reports','/incidents','/lost-found','/accounts','/personnel'].includes(path)||path.startsWith('/personnel/'))
}
export const canUseGate=(user:SessionUser|null,gate:string)=>!!user&&securityGates.includes(gate)&&(user.role==='Security Head'||user.gates.includes(gate))
export const mayViewVisit=(user:SessionUser|null,visit:Visit)=>canUseGate(user,visit.gate)

export type GuardAccountChange=
  |{kind:'create';personId:string;username:string;password:string;gates:string[]}
  |{kind:'access';accountId:string;gates:string[]}
  |{kind:'enabled';accountId:string;enabled:boolean}
  |{kind:'password';accountId:string;password:string}
export type AuthResult={requestId:string;ok:boolean;message?:string;errors:Record<string,string>}
export type AuthState={accounts:MockAccount[];sessionId:string|null;result:AuthResult|null}
export type AuthAction=
  |{type:'login';requestId:string;username:string;password:string;people:Person[]}
  |{type:'logout'}
  |{type:'manage';requestId:string;newAccountId:string;change:GuardAccountChange;people:Person[]}
export function authReducer(state:AuthState,action:AuthAction):AuthState{
  if(action.type==='logout')return {...state,sessionId:null,result:null}
  const errors:Record<string,string>={}
  const fail=()=>({...state,result:{requestId:action.requestId,ok:false,errors}})
  if(action.type==='login'){
    if(!action.username.trim())errors.username='Enter your username.'
    if(!action.password)errors.password='Enter your password.'
    const account=state.accounts.find(a=>a.username.toLowerCase()===action.username.trim().toLowerCase()&&a.password===action.password)
    if(!Object.keys(errors).length&&!resolveSession(state.accounts,account?.id||null,action.people))errors.form='The username or password is incorrect, or this account is unavailable. Contact the Security Head.'
    if(Object.keys(errors).length||!account)return fail()
    return {...state,sessionId:account.id,result:{requestId:action.requestId,ok:true,errors:{}}}
  }
  const actor=resolveSession(state.accounts,state.sessionId,action.people)
  if(actor?.role!=='Security Head'){errors.form='Only the Security Head can manage guard accounts.';return fail()}
  const change=action.change
  if(change.kind==='create'||change.kind==='access'){
    if(!change.gates.length||change.gates.some(g=>!securityGates.includes(g)))errors.gates='Select at least one valid authorized gate.'
  }
  if(change.kind==='create'||change.kind==='password'){
    if(change.password.length<8)errors.password='Use at least 8 characters for the demo password.'
  }
  if(change.kind==='create'){
    const username=change.username.trim().toLowerCase()
    if(!/^[a-z0-9._-]{3,40}$/.test(username))errors.username='Use 3–40 letters, numbers, dots, underscores, or hyphens.'
    if(state.accounts.some(a=>a.username.toLowerCase()===username))errors.username='This username is already in use.'
    if(!action.people.some(p=>p.id===change.personId&&p.status==='Active'))errors.personId='Choose an active personnel profile.'
    if(state.accounts.some(a=>a.personId===change.personId))errors.personId='This person already has an account. Manage the existing account instead.'
    if(!action.newAccountId||state.accounts.some(a=>a.id===action.newAccountId))errors.form='The account reference is already in use. Try again.'
    if(Object.keys(errors).length)return fail()
    const account:MockAccount={id:action.newAccountId,username,password:change.password,personId:change.personId,role:'Security Guard',enabled:true,gates:[...new Set(change.gates)]}
    return {...state,accounts:[...state.accounts,account],result:{requestId:action.requestId,ok:true,message:'Security Guard account created.',errors:{}}}
  }
  const account=state.accounts.find(a=>a.id===change.accountId)
  if(!account||account.role!=='Security Guard'){errors.form='Select an existing Security Guard account.';return fail()}
  if(change.kind==='enabled'&&change.enabled&&!action.people.some(p=>p.id===account.personId&&p.status==='Active'))errors.form='Activate the personnel profile before enabling this account.'
  if(Object.keys(errors).length)return fail()
  const updated={...account,...(change.kind==='access'?{gates:[...new Set(change.gates)]}:change.kind==='enabled'?{enabled:change.enabled}:{password:change.password})}
  return {...state,accounts:state.accounts.map(a=>a.id===account.id?updated:a),result:{requestId:action.requestId,ok:true,message:change.kind==='password'?'Demo password reset.':change.kind==='access'?'Authorized gates updated.':change.enabled?'Guard account enabled.':'Guard account disabled.',errors:{}}}
}
