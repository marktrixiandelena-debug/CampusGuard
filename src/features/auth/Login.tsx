import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { useDemo } from '../../app/store'
import campusEntrance from '../../assets/unc-campus-entrance.png'
import './accounts.css'

export default function Login(){
  const db=useDemo()
  useEffect(()=>{document.title='CampusGuard | Sign in'},[])
  const [request,setRequest]=useState('')
  const result=db.authResult?.requestId===request?db.authResult:null
  const busy=!!request&&!result
  if(db.currentUser)return <Navigate to="/dashboard" replace/>
  return <main className="login-page">
    <section className="panel login-panel" aria-labelledby="login-title">
      <div className="login-identity">
        <div className="login-brand"><ShieldCheck size={28} aria-hidden="true"/><strong>CampusGuard</strong></div>
        <img className="login-campus-photo" src={campusEntrance} width={720} height={445}
          alt="University of Nueva Caceres campus entrance arch" loading="lazy"/>
        <div className="login-statement">
          <p>Protecting our campus.</p>
          <span>University Security Operations Management System</span>
        </div>
        <div className="login-affiliation">
          <span className="login-affiliation-mark" aria-hidden="true">UNC</span>
          <div><strong>University of Nueva Caceres</strong><span>Security Office</span></div>
        </div>
      </div>
      <div className="login-form-panel">
        <header className="login-form-heading">
          <p className="login-eyebrow">Security Operations Demo</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-intro">No account or password is required.</p>
        </header>
        <div className="login-demo-actions" aria-busy={busy}>
          <button type="button" className="primary" data-demo-role="Security Head" disabled={busy}
            onClick={()=>setRequest(db.enterDemo('Security Head'))}>Continue as Security Head</button>
          {result?.errors.form&&<p className="error-text login-form-error" role="alert">{result.errors.form}</p>}
        </div>
        <footer className="login-access"><p>Demo data resets when you refresh.</p></footer>
      </div>
    </section>
  </main>
}
