import { assignments as fixtureAssignments } from '../src/data/data.ts'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const baseUrl=process.argv[2]||'http://127.0.0.1:4173'

// Uses the installed Edge and Node's WebSocket; no browser package download needed.
await mkdir('.verification', { recursive: true })
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--remote-debugging-port=9225', `--user-data-dir=${resolve('.verification/auth-browser')}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
let socket
const pending = new Map()
const exceptions = []
const failedScripts = []
let sequence = 0
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
  let pages
  for (let i=0;i<50;i++) {
    try { pages=await (await fetch('http://127.0.0.1:9225/json/list')).json(); break } catch { await pause(200) }
  }
  assert.ok(pages, 'Edge debugging endpoint started')
  socket = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject})
  socket.onmessage = event => {
    const data=JSON.parse(event.data)
    if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params)
    if(data.method==='Network.responseReceived'&&data.params.type==='Script'&&data.params.response.status>=400)failedScripts.push(data.params.response.url)
    if (pending.has(data.id)) { const {resolve,reject}=pending.get(data.id);pending.delete(data.id);if(data.error){reject(new Error(data.error.message))}else{resolve(data.result)} }
  }
  const command = (method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
  const evaluate = async expression => {
    const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
    if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails))
    if(/\.click\(|requestSubmit\(/.test(expression)){
      await command('Runtime.evaluate',{expression:'Promise.all(Array.from(document.querySelectorAll("dialog,.dashboard-missing-record"),dialog=>dialog.getAnimations()).flat().map(animation=>animation.finished.catch(()=>{})))',awaitPromise:true})
      await pause(30)
    }
    return r.result.value
  }
  const setControl = async (selector,value) => {
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const prototype=input instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await pause(100)
  }
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Network.enable')
  const spa=async path=>{await evaluate(`(()=>{history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'))})()`);await pause(150)}
  const signIn=async role=>{
    if(role==='Security Head')await evaluate(`document.querySelector('[data-demo-role="Security Head"]').click()`)
    else await evaluate(`(()=>{
      // shortcut: seed Guard sessions through the React provider until a dedicated browser fixture exists.
      const button=document.querySelector('[data-demo-role="Security Head"]')
      const fiberKey=Object.keys(button).find(key=>key.startsWith('__reactFiber$'))
      for(let fiber=button[fiberKey];fiber;fiber=fiber.return){
        const store=fiber.memoizedProps?.value
        if(typeof store?.enterDemo==='function')return store.enterDemo('Security Guard')
      }
      throw new Error('Could not find the demo provider for the Guard browser fixture')
    })()`)
    await pause(100)
  }
  const logout=async()=>{await evaluate('document.querySelector(".sidebar-footer button").click()');assert.equal(await evaluate('location.pathname'),'/login')}
  const accountAction=(username,value)=>setControl('select[aria-label="Actions for '+username+'"]',value)
  const field=(name,value)=>setControl('dialog [name="'+name+'"]',value)
  const press=async(key,code)=>{
    for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{
      type,key,code:key,windowsVirtualKeyCode:code,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{}),
    })
  }
  await command('Page.navigate',{url:new URL('/accounts',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".login-panel")'))break;await pause(100)}
  assert.equal(await evaluate('location.pathname'),'/login')
  assert.equal(await evaluate('document.querySelector(".login-panel h1").textContent'),'Welcome back')
  assert.ok(await evaluate('["CampusGuard","University of Nueva Caceres","Security Office","Security Operations Demo","No account or password is required."].every(text=>document.querySelector(".login-panel").textContent.includes(text))'))
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".login-panel button")].map(button=>button.textContent)'),['Continue as Security Head'])
  assert.ok(await evaluate('!document.querySelector(".login-panel input")'))
  assert.equal(await evaluate('!!document.querySelector(".sidebar")'),false)
  await press('Tab',9)
  assert.equal(await evaluate('document.activeElement.dataset.demoRole'),'Security Head')
  await press('Enter',13)
  await pause(100)
  assert.equal(await evaluate('document.querySelector(".identity strong").textContent'),'Rosario Bautista')
  assert.equal(await evaluate('document.querySelector(".identity small").textContent'),'Security Head')
  assert.equal(await evaluate('location.pathname'),'/dashboard')
  await spa('/accounts')
  assert.equal(await evaluate('document.querySelectorAll(".account-list>li").length'),1)
  assert.equal(await evaluate('document.querySelector(".account-list").textContent.includes("CampusGuard123!")'),false)
  await evaluate('document.querySelector(".page-heading button").click()')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelectorAll("dialog [aria-invalid=true]").length>=4'))
  await field('personId','SEC-002');await field('username','HEAD');await field('password','TempGuard123!')
  await evaluate('document.querySelector("input[name=gates]").click();document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("username is already in use")'))
  await field('username','guard.new')
  await evaluate('document.querySelector("dialog form").requestSubmit();document.querySelector("dialog form").requestSubmit()')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  assert.equal(await evaluate('document.querySelectorAll(".account-list>li").length'),2)
  await accountAction('guard.new','disable')
  assert.equal(await evaluate('document.querySelector("dialog h2").textContent'),'Disable Guard Account')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelector(".visitor-success").textContent.includes("disabled")'))
  await accountAction('guard.new','enable')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false,'Enable must not reopen a stale account form')
  await accountAction('guard.new','password')
  await field('password','ResetGuard123!')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelector(".visitor-success").textContent.includes("password reset")'))
  await logout();await signIn('Security Guard')
  assert.equal(await evaluate('document.querySelector(".identity strong").textContent'),'Carlos Ignacio Santos')
  assert.equal(await evaluate('document.querySelector("h1").textContent'),'My Security Dashboard')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".sidebar nav button"),n=>n.textContent)'),['Dashboard','Gate & Visitor','Help & Guide'])
  await setControl('select[aria-label="Duty dates"]','All Dates')
  const ownDuties=await evaluate('document.querySelectorAll(".guard-duty-list>li").length')
  assert.equal(ownDuties,fixtureAssignments.filter(a=>a.personId==='SEC-001').length)
  await evaluate('Array.from(document.querySelectorAll("a")).find(a=>a.getAttribute("href")===("/dashboard#my-duties")||a.getAttribute("href")===("#my-duties")).click()')
  assert.equal(await evaluate('document.activeElement.id'),'my-duties')
  assert.equal(await evaluate('document.querySelectorAll(".my-duties button").length'),0)
  for(const path of ['/accounts','/analytics','/reports','/incidents','/lost-found','/personnel','/personnel/duty-schedule','/personnel/duty-schedule/new','/personnel/duty-schedule/selected-shift','/personnel/campus-posts','/personnel/activity-history']){
    await spa(path)
    assert.equal(await evaluate('location.pathname'),'/dashboard',path)
    assert.equal(await evaluate('document.querySelector("h1").textContent'),'My Security Dashboard')
    assert.ok(await evaluate('document.querySelector(".route-notice").textContent.includes("Security Head")'))
  }
  await spa('/help')
  assert.equal(await evaluate('document.querySelectorAll(".help-task").length'),4)
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".help-links a")).some(a=>/personnel|reports|analytics|incidents|lost-found|accounts/.test(a.pathname))'),false)
  await spa('/visitors?period=All&gate=Gate+2&record=VIS-0001')
  assert.ok(await evaluate('!!document.querySelector(".dashboard-missing-record")'))
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".desktop-records tbody tr")).every(n=>!n.textContent.includes("Gate 2"))'))
  assert.equal(await evaluate('Array.from(document.querySelectorAll("select[aria-label=Gate] option")).some(n=>n.value==="Gate 2")'),false)
  await evaluate('document.querySelector(".visitor-heading-actions button").click()')
  await evaluate('document.querySelector("[data-visitor-mode=new]").click()')
  assert.equal(await evaluate('document.querySelector("input[name=guardId],select[name=guardId]")'),null)
  assert.equal(await evaluate('document.querySelector("select[name=gate]").value'),'Gate 1 (Main)')
  assert.ok(await evaluate('document.querySelector(".visitor-kiosk-context").textContent.includes("Carlos Ignacio Santos")'))
  for(const [name,value] of Object.entries({firstName:'Elena',lastName:'AccessTest',idType:'National ID',purpose:'Gate permissions test'}))await field(name,value)
  await evaluate('document.querySelector("input[name=idDeposited][value=Yes]").click();document.querySelector("input[name=identityVerified]").click()')
  await evaluate('(()=>{const select=document.querySelector("select[name=gate]"),option=document.createElement("option");option.value="Gate 2 (Side)";option.textContent="Gate 2 (Side)";select.append(option)})()')
  await field('gate','Gate 2 (Side)')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("authorized for your account")'))
  await field('gate','Gate 1 (Main)')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  const visitId=await evaluate('document.querySelector(".desktop-records tbody tr").dataset.recordId')
  await evaluate('document.querySelector(".desktop-records tbody button").click()')
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Responsible personnel: Carlos Ignacio Santos")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await logout();await signIn('Security Head');await spa('/accounts')
  await accountAction('guard.main','access')
  await evaluate('document.querySelectorAll("input[name=gates]")[0].click();document.querySelectorAll("input[name=gates]")[1].click();document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('document.querySelector(".visitor-success").textContent.includes("Authorized gates updated")'))
  await logout();await signIn('Security Guard')
  await spa('/visitors?period=All&record='+visitId)
  assert.ok(await evaluate('!!document.querySelector(".dashboard-missing-record")'))
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  await logout();await signIn('Security Head')
  await spa('/visitors?period=All&record='+visitId)
  assert.ok(await evaluate('!!document.querySelector("dialog")'))
  await evaluate('Array.from(document.querySelectorAll("dialog button")).find(b=>b.textContent==="Check Out").click()')
  assert.equal(await evaluate('document.querySelector("select[name=exitGate]").value'),'')
  await field('exitGate','Gate 1 (Main)')
  assert.equal(await evaluate('!!document.querySelector("[name=checkoutGuard]")'),false)
  assert.ok(await evaluate('document.querySelector(".visitor-account-identity").textContent.includes("Rosario Bautista")'))
  await evaluate('document.querySelector("input[name=departed]").click();document.querySelector("dialog form").requestSubmit()')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  assert.ok(await evaluate('document.querySelector(".visitor-success").textContent.includes("ID return remains unresolved")'))
  await spa('/visitors?period=All&record='+visitId)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Responsible personnel: Carlos Ignacio Santos")'))
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Responsible checkout personnel: Rosario Bautista")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  // Full refresh resets all mock state and requires login; no session is stored in the browser.
  await command('Page.reload')
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".login-panel")'))break;await pause(100)}
  assert.equal(await evaluate('location.pathname'),'/login')
  assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0)
  assert.equal(await evaluate('document.querySelectorAll("[data-demo-role]").length'),1,'Refresh shows only Security Head entry')
  for(const width of [320,375,390,430,768,1024,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Login fits: '+width)
    assert.ok(await evaluate('Array.from(document.querySelectorAll(".login-panel input,.login-panel button")).every(n=>n.getBoundingClientRect().height>=44)'))
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".login-campus-photo")).display!=="none"'),width>=840)
    if(width>=840){
      for(let attempt=0;attempt<30;attempt++){
        if(await evaluate('document.querySelector(".login-campus-photo").naturalWidth===720'))break
        await pause(50)
      }
      assert.equal(await evaluate('document.querySelector(".login-campus-photo").naturalWidth'),720)
    }
    await writeFile('.verification/login-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:360,deviceScaleFactor:1,mobile:true})
  assert.ok(await evaluate('(()=>{const button=document.querySelector("[data-demo-role]");button.scrollIntoView({block:"end"});return button.getBoundingClientRect().bottom<=innerHeight})()'),'Sign in remains reachable at reduced height')
  await signIn('Security Guard')
  for(const width of [320,375,390,430,768,1024,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Guard dashboard fits: '+width)
    assert.ok(await evaluate('document.querySelector(".identity").getBoundingClientRect().height>0'),'Name and role visible: '+width)
    if(width<768){
      assert.ok(await evaluate('document.querySelector(".app-header").getBoundingClientRect().height<=80'),'Compact header at '+width)
      assert.ok(await evaluate('(()=>{const brand=document.querySelector(".brand strong").getBoundingClientRect(),account=document.querySelector(".account").getBoundingClientRect();return brand.right<=account.left&&Math.abs((brand.top+brand.bottom)-(account.top+account.bottom))<4})()'),'Brand and account share one row without overlap')
      assert.ok(await evaluate('document.querySelector(".menu-button").getBoundingClientRect().width>=44'))
      await evaluate('document.querySelector(".menu-button").click()')
      assert.ok(await evaluate('document.querySelector(".sidebar").classList.contains("open")'))
      await evaluate('document.querySelector(".scrim").click()')
      assert.ok(await evaluate('document.querySelector(".scrim").getAttribute("aria-hidden")=="true"&&!document.querySelector(".scrim").classList.contains("visible")'))
      await writeFile('.verification/mobile-header-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
    }
  }
  await writeFile('.verification/guard-dashboard-1440.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
  await spa('/visitors?action=new')
  assert.ok(await evaluate('!!document.querySelector("dialog")'))
  await evaluate('document.querySelector("[data-visitor-mode=new]").click()')
  assert.equal(await evaluate('document.querySelector("select[name=gate]").value'),'Gate 1 (Main)')
  await evaluate('document.querySelector("dialog footer button").click()')
  await logout();await signIn('Security Head');await spa('/accounts')
  for(const width of [320,375,390,430,768,1024,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Account list fits: '+width)
    await evaluate('document.querySelector(".page-heading button").click()')
    assert.ok(await evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'))
    await evaluate('document.querySelector("dialog footer button").click()')
  }
  const personnelStatus=async (action,confirmation)=>{
    await spa('/personnel?search=SEC-001')
    await evaluate('document.querySelector(".directory-table .directory-name").click()')
    await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent===${JSON.stringify(action)}).click()`)
    await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent===${JSON.stringify(confirmation)}).click()`)
  }
  await personnelStatus('Deactivate Personnel','Confirm Deactivation')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-facts").textContent.includes("Enabled")&&document.querySelector(".personnel-profile-facts").textContent.includes("Unavailable · inactive personnel")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await logout()
  await signIn('Security Guard')
  assert.equal(await evaluate('location.pathname'),'/login','Enabled Guard account cannot sign in with inactive personnel')
  await signIn('Security Head')
  await personnelStatus('Reactivate Personnel','Confirm Reactivation')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-facts").textContent.includes("Eligible to sign in")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await logout()
  await signIn('Security Guard')
  assert.equal(await evaluate('location.pathname'),'/dashboard')
  await logout()
  await signIn('Security Head');await spa('/accounts')
  await accountAction('guard.main','disable')
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  await personnelStatus('Deactivate Personnel','Confirm Deactivation')
  await evaluate('document.querySelector("dialog footer button").click()')
  await personnelStatus('Reactivate Personnel','Confirm Reactivation')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-facts").textContent.includes("Guard · Disabled")&&document.querySelector(".personnel-profile-facts").textContent.includes("Unavailable · account disabled")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await logout()
  await signIn('Security Guard')
  assert.equal(await evaluate('location.pathname'),'/login','Reactivation never enables a separately disabled account')
  console.log('PASS: linked-account enabled and effective access, personnel deactivation, and reactivation with both enabled and disabled Guard accounts.')
  assert.equal(exceptions.length,0)
  assert.deepEqual(failedScripts,[])
  console.log('PASS: login/logout, account create/reset/disable/enable/access updates, protected URLs, gate scoping, automatic identity and separate checkout actor, read-only own duties, role-aware help, in-memory refresh, and responsive layouts.')

}finally{socket?.close();browser.kill()}
