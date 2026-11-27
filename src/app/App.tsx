import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, Outlet, useNavigate, useLocation } from 'react-router'
import { Menu, LogOut, PanelLeftClose, PanelLeftOpen, ShieldCheck, X } from 'lucide-react'
import '../styles/App.css'
import '../styles/modules.css'
import '../styles/refinements.css'
import Dashboard from '../features/dashboard/Dashboard'
import Help from '../features/help/Help'
import Visitors from '../features/visitors/Visitors'
import LostFound from '../features/lost-found/LostFound'
import Personnel from '../features/personnel/Personnel'
import Incidents from '../features/incidents/Incidents'
import { lazy, Suspense } from 'react'
const Analytics=lazy(()=>import('../features/reporting/Analytics'))
const Reports=lazy(()=>import('../features/reporting/Reports'))
import { DemoProvider } from './DemoProvider'
import { useDemo } from './store'
import { canAccessPath } from '../features/auth/auth-data'
import { appNavigation } from './navigation'
import Login from '../features/auth/Login'
import GuardAccounts from '../features/auth/GuardAccounts'
import GuardDashboard from '../features/dashboard/GuardDashboard'
import '../styles/interactions.css'
import '../styles/modal-density.css'
import '../styles/modal-typography.css'
import '../styles/page-hierarchy.css'

function ProtectedShell(){
  const {currentUser}=useDemo(),location=useLocation()
  if(!currentUser)return <Navigate to="/login" replace/>
  if(!canAccessPath(currentUser,location.pathname))return <Navigate to="/dashboard" replace state={{accessDenied:true}}/>
  return <Shell/>
}
function RoleDashboard(){const {currentUser}=useDemo();return currentUser?.role==='Security Head'?<Dashboard/>:<GuardDashboard/>}
function Shell(){
  const navigate=useNavigate(), location=useLocation()
  const db=useDemo(),user=db.currentUser!
  const navigation=appNavigation.map(group=>({...group,links:group.links.filter(link=>canAccessPath(user,link.to))})).filter(group=>group.links.length)
  const initials=user.name.split(' ').filter(Boolean).map(part=>part[0]).filter((_,index,parts)=>index===0||index===parts.length-1).join('')
  const [drawer,setDrawer]=useState(false),[collapsed,setCollapsed]=useState(false)
  const [mobile,setMobile]=useState(()=>matchMedia('(max-width:1023px)').matches)
  const sidebar=useRef<HTMLElement>(null),menu=useRef<HTMLButtonElement>(null),main=useRef<HTMLElement>(null)
  useEffect(()=>{const media=matchMedia('(max-width:1023px)');const change=()=>{setMobile(media.matches);if(!media.matches)setDrawer(false)};media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
  useEffect(()=>{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return
    const animation=main.current?.animate([{opacity:.65},{opacity:1}],{duration:200,easing:'ease-out'})
    return()=>animation?.cancel()
  },[location.pathname])
  useEffect(()=>{const title=location.pathname.startsWith('/personnel')?'Security Personnel':({'/dashboard':'Security Dashboard','/visitors':'Gate & Visitor Management','/incidents':'Incidents','/lost-found':'Lost & Found','/analytics':'Security Analytics','/reports':'Security Reports','/help':'Help & Guide','/accounts':'Guard Accounts'} as Record<string,string>)[location.pathname]||'Dashboard';document.title=`CampusGuard | ${title}`},[location.pathname])
  useEffect(()=>{
    if(!drawer||!mobile)return
    const overflow=document.body.style.overflow,opener=menu.current
    document.body.style.overflow='hidden'
    sidebar.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setDrawer(false)}
      if(event.key==='Tab'){
        const buttons=sidebar.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
        if(!buttons?.length)return
        const first=buttons[0],last=buttons[buttons.length-1]
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
      }
    }
    window.addEventListener('keydown',onKey)
    return()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',onKey);opener?.focus()}
  },[drawer,mobile])
  return <div className={'application'+(collapsed?' sidebar-collapsed':'')}>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <button className={'scrim'+(drawer?' visible':'')} tabIndex={-1} aria-label="Close navigation" aria-hidden={!drawer} onClick={()=>setDrawer(false)}/>
    <aside id="main-navigation" ref={sidebar} className={drawer?'sidebar open':'sidebar'} inert={mobile&&!drawer} role={mobile&&drawer?'dialog':undefined} aria-modal={mobile&&drawer?true:undefined} aria-label="University Security Office navigation">
      <div className="university"><span className="university-mark"><ShieldCheck size={28} aria-hidden="true"/></span><div className="university-copy"><strong>University Security Office</strong><small>University of Nueva Caceres</small></div><button type="button" className="drawer-close" aria-label="Close navigation" onClick={()=>setDrawer(false)}><X size={20}/></button></div>
      <nav aria-label="Main navigation">{navigation.map(group=><section key={group.title}><h2>{group.title}</h2>{group.links.map(link=><button key={link.to} aria-label={link.label} aria-current={(location.pathname===link.to||(link.to==='/analytics'&&location.pathname==='/reports')||(link.to==='/personnel'&&location.pathname.startsWith('/personnel/')))?'page':undefined} onClick={()=>{navigate(link.to);setDrawer(false)}}><link.icon className="sidebar-icon" aria-hidden="true"/><span className="nav-label">{link.label}</span></button>)}</section>)}</nav>
      <div className="sidebar-footer"><button aria-label="Secure Logout" onClick={()=>{db.logout();navigate('/login',{replace:true})}}><LogOut className="sidebar-icon" aria-hidden="true"/><span className="nav-label">Secure Logout</span></button></div>
    </aside>
    <div className="workspace" inert={mobile&&drawer}><header className="app-header"><button ref={menu} className="menu-button" aria-label="Open navigation" aria-expanded={drawer} aria-controls="main-navigation" onClick={()=>setDrawer(true)}><Menu size={20}/></button><button className="sidebar-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="main-navigation" onClick={()=>setCollapsed(value=>!value)}>{collapsed?<PanelLeftOpen size={20}/>:<PanelLeftClose size={20}/>}</button><div className="brand"><div><strong>CampusGuard</strong><small>University Security Office MIS</small></div></div><div className="account"><div className="avatar" aria-hidden="true">{initials}</div><div className="identity"><strong title={user.name}>{user.name}</strong><small>{user.role}</small></div></div></header>
    <main id="main-content" ref={main} tabIndex={-1}>{location.state?.accessDenied&&<p className="route-notice" role="status">This page is available to the Security Head. Your authorized dashboard is shown below.</p>}<Outlet/></main></div></div>
}
export default function App(){return <DemoProvider><BrowserRouter><Suspense fallback={<p className="empty">Loading CampusGuard…</p>}><Routes><Route path="/login" element={<Login/>}/><Route element={<ProtectedShell/>}><Route path="/dashboard" element={<RoleDashboard/>}/><Route path="/visitors" element={<Visitors/>}/><Route path="/lost-found" element={<LostFound/>}/><Route path="/personnel/*" element={<Personnel/>}/><Route path="/incidents" element={<Incidents/>}/><Route path="/analytics" element={<Analytics/>}/><Route path="/reports" element={<Reports/>}/><Route path="/help" element={<Help/>}/><Route path="/accounts" element={<GuardAccounts/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Route></Routes></Suspense></BrowserRouter></DemoProvider>}

