import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useDemo } from '../../app/store'
import campusEntrance from '../../assets/unc-campus-entrance.png'
import './accounts.css'

export default function Login(){
  const db=useDemo()
  useEffect(()=>{document.title='CampusGuard | Sign in'},[])
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[request,setRequest]=useState('')
  const result=db.authResult?.requestId===request?db.authResult:null
  const busy=!!request&&!result
  const pending=useRef(false)
  const usernameField=useRef<HTMLInputElement>(null)
  const passwordField=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    if(!result)return
    pending.current=false
    if(result.errors.username)usernameField.current?.focus()
    else if(result.errors.password)passwordField.current?.focus()
  },[result])
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
          <p className="login-eyebrow">Security Personnel Portal</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="login-intro">Sign in to your CampusGuard account.</p>
        </header>
        <form noValidate aria-busy={busy} onSubmit={event=>{
          event.preventDefault()
          if(pending.current)return
          pending.current=true
          setRequest(db.login(username,password))
        }}>
          <div className="field login-field">
            <label htmlFor="login-username">Username</label>
            <input ref={usernameField} id="login-username" name="username" autoComplete="username" autoCapitalize="none"
              autoCorrect="off" spellCheck={false} enterKeyHint="next" required readOnly={busy} value={username}
              onChange={event=>{if(!pending.current){setUsername(event.target.value);setRequest('')}}}
              aria-invalid={!!result?.errors.username} aria-describedby={result?.errors.username?'login-username-error':undefined}/>
            {result?.errors.username&&<small className="error-text" id="login-username-error">{result.errors.username}</small>}
          </div>
          <div className="field login-field">
            <label htmlFor="login-password">Password</label>
            <div className="password-control">
              <input ref={passwordField} id="login-password" name="password" autoComplete="current-password" enterKeyHint="go"
                required readOnly={busy} type={show?'text':'password'} value={password}
                onChange={event=>{if(!pending.current){setPassword(event.target.value);setRequest('')}}}
                aria-invalid={!!result?.errors.password} aria-describedby={result?.errors.password?'login-password-error':undefined}/>
              <button className="password-toggle" type="button" aria-label={show?'Hide password':'Show password'} aria-controls="login-password"
                onClick={()=>setShow(value=>!value)}>{show?<EyeOff size={19} aria-hidden="true"/>:<Eye size={19} aria-hidden="true"/>}</button>
            </div>
            {result?.errors.password&&<small className="error-text" id="login-password-error">{result.errors.password}</small>}
          </div>
          {result?.errors.form&&<p className="error-text login-form-error" role="alert">{result.errors.form}</p>}
          <button type="submit" className="primary login-submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
        </form>
        <footer className="login-access">
          <p><LockKeyhole size={15} aria-hidden="true"/>Authorized personnel only.</p>
          <p className="login-account-help">Need an account? Please contact the Security Head.</p>
        </footer>
      </div>
    </section>
  </main>
}
