import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { incidents as fixtureIncidents, visits as fixtureVisits } from '../src/data/data.ts'
import { campusDateTime } from '../src/features/visitors/visitor-data.ts'
import { upcomingDutyPeriod, weeklyDuties } from '../src/features/personnel/weekly-duty-template.ts'
import { dutyResponsibility, weeklyDutyGroups } from '../src/features/personnel/weekly-duty-groups.ts'
import { formatReportDate, shiftReportDate } from '../src/features/reporting/reporting.ts'
const currentVisitorDate=campusDateTime().date
const currentVisits=fixtureVisits.filter(v=>v.date===currentVisitorDate)
const todayEntries=currentVisits.filter(v=>v.outcome==='Entered').length
const visitorCardValues=['2',String(todayEntries),String(currentVisits.filter(v=>v.vehicle!=='No'&&v.outcome==='Entered').length),String(currentVisits.filter(v=>v.outcome==='Denied').length)]
const baseUrl=process.argv[2]||'http://127.0.0.1:4173'

// Uses the installed Edge and Node's WebSocket; no browser package download needed.
await mkdir('.verification', { recursive: true })
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--remote-debugging-port=9223', `--user-data-dir=${resolve('.verification/browser')}`, 'about:blank',
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
    try { pages=await (await fetch('http://127.0.0.1:9223/json/list')).json(); break } catch { await pause(200) }
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
  const assertRecordCount=async(count,message)=>{
    const size=await evaluate("Number(document.querySelector('select[aria-label=\"Records per page\"]').value)")
    assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),Math.min(size,count),message)
    const text=await evaluate('document.querySelector(".record-pagination,.item-pagination").textContent')
    assert.ok(text.includes(count?'of '+count+' records':'Showing 0 records'),message||'Pagination total matches filtered records')
  }
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Network.enable')
  const ensureHead=async target=>{
    for(let i=0;i<60;i++){if(await evaluate('!!document.querySelector(".login-panel")'))break;await pause(100)}
    assert.ok(await evaluate('!!document.querySelector(".login-panel")'),'A full reload requires sign-in')
    await setControl('.login-panel input[name=username]','head')
    await setControl('.login-panel input[name=password]','CampusHead123!')
    await evaluate('document.querySelector(".login-panel form").requestSubmit()')
    for(let i=0;i<60;i++){if(await evaluate('!!document.querySelector(".application")'))break;await pause(100)}
    assert.equal(await evaluate('document.querySelector(".identity small").textContent'),'Security Head')
    const path=new URL(target,baseUrl)
    await evaluate(`(()=>{history.replaceState({},'',${JSON.stringify(path.pathname+path.search+path.hash)});dispatchEvent(new PopStateEvent('popstate'))})()`)
    await pause(100)
  }
  const openPage=async params=>{await command('Page.navigate',params);await pause(100);await ensureHead(params.url)}
  const reloadAsHead=async()=>{const target=await evaluate('location.href');await command('Page.reload');await pause(100);await ensureHead(target)}
  const assertCampusOccurrence=async startedAt=>{
    const endedAt=await evaluate('new Date().toISOString()')
    const expected=[startedAt,endedAt].map(instant=>{
      const {date,time}=campusDateTime(new Date(instant))
      return date+'T'+time
    })
    const actual=await evaluate('document.querySelector("dialog [name=datetime]").value')
    assert.ok(expected.includes(actual),'Incident occurrence uses the current Asia/Manila minute: '+actual)
    assert.equal(await evaluate('document.querySelector("dialog [name=type]").value'),'')
    assert.equal(await evaluate('document.querySelector("dialog [name=personnel]").value'),'')
    assert.equal(await evaluate('document.querySelector("dialog [name=reporter]").value'),'')
  }


  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await openPage({url:new URL('/lost-found',baseUrl).href})
  const waitForLost=async expression=>{for(let attempt=0;attempt<50;attempt++){if(await evaluate(expression))return;await pause(50)}assert.fail('Timed out waiting for: '+expression)}
  const chooseItemPhoto=async (name,contents,type)=>evaluate(`(()=>{
    const input=document.querySelector('dialog input[type=file]:not([capture])'),files=new DataTransfer()
    files.items.add(new File([${JSON.stringify(contents)}],${JSON.stringify(name)},{type:${JSON.stringify(type)}}))
    input.files=files.files
    input.dispatchEvent(new Event('change',{bubbles:true}))
  })()`)
  const campusToday=campusDateTime().date
  const historicalDate=shiftReportDate(campusToday,-30)
  const tomorrow=shiftReportDate(campusToday,1)
  for(const [type,date,width] of [['Found',campusToday,375],['Lost',historicalDate,768]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
    const itemName='Intake regression '+type
    await evaluate(`history.replaceState({},'',${JSON.stringify('/lost-found?period=All&search='+encodeURIComponent(itemName))});dispatchEvent(new PopStateEvent('popstate'))`)
    await waitForLost(`document.querySelector('.record-toolbar-search input')?.value===${JSON.stringify(itemName)}`)
    const recordCount=()=>evaluate('document.querySelectorAll(".desktop-records tr[data-record-id]").length')
    assert.equal(await recordCount(),0)
    await evaluate('document.querySelector(".page-heading button").click()')
    assert.deepEqual(await evaluate('(()=>{const date=document.querySelector("dialog [name=date]");return [date.value,date.max]})()'),[campusToday,campusToday])
    await evaluate(`(()=>{
      const form=document.querySelector('dialog form')
      window.intakeEvents={invalid:0,submit:0}
      form.addEventListener('invalid',()=>window.intakeEvents.invalid++,true)
      form.addEventListener('submit',()=>window.intakeEvents.submit++)
    })()`)
    const toggleType=async (value,keyboard=false)=>{
      const selector=JSON.stringify('dialog [data-option="'+value+'"]')
      if(keyboard){
        await evaluate(`document.querySelector(${selector}).focus()`)
        assert.equal(await evaluate(`document.activeElement===document.querySelector(${selector})`),true)
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
        await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
      }else await evaluate(`document.querySelector(${selector}).click()`)
      await waitForLost(`document.querySelector(${selector})?.getAttribute('aria-pressed')==='true'`)
      assert.deepEqual(await evaluate('window.intakeEvents'),{invalid:0,submit:0},'Type switching neither validates nor submits the form')
      assert.equal(await recordCount(),0)
    }
    const otherType=type==='Found'?'Lost':'Found'
    await toggleType(otherType)
    await toggleType(type,true)
    const sharedFields={name:itemName,category:'Personal Items',date,time:'10:30',description:'Fictional intake regression record',reporterType:'Guard',reporter:'Test Reporter',contact:'09170000000'}
    await evaluate(`(()=>{
      const form=document.querySelector('dialog form')
      for(const [name,value] of Object.entries(${JSON.stringify(sharedFields)}))form.elements.namedItem(name).value=value
      form.elements.namedItem('location').value='Initial location'
    })()`)
    await chooseItemPhoto('intake.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>','image/svg+xml')
    await waitForLost('!!document.querySelector("dialog .upload-preview")')
    const preview=await evaluate('document.querySelector("dialog .upload-preview").src')
    for(const [nextType,keyboard] of [[otherType,false],[type,true]]){
      await toggleType(nextType,keyboard)
      const draft=await evaluate(`(()=>{
        const form=document.querySelector('dialog form'),location=form.elements.namedItem('location')
        return {fields:Object.fromEntries(new FormData(form)),label:location.labels[0].textContent,photo:form.querySelector('.upload-preview').src}
      })()`)
      assert.deepEqual(draft.fields,{...sharedFields,location:''},'Shared fields survive while the previous type’s location is cleared')
      assert.equal(draft.label,nextType==='Found'?'Found at *':'Last seen at *')
      assert.equal(draft.photo,preview)
      await setControl('dialog [name=location]','Confirmed location')
    }
    if(type==='Found'){
      await setControl('dialog [name=date]',tomorrow)
      await evaluate('document.querySelector("dialog button[type=submit]").click()')
      assert.equal(await evaluate('document.querySelector("dialog [name=date]").validity.rangeOverflow'),true)
      assert.deepEqual(await evaluate('window.intakeEvents'),{invalid:1,submit:0},'Tomorrow is blocked by native validation')
      assert.equal(await recordCount(),0)
      await setControl('dialog [name=date]',date)
    }
    for(const checkWidth of [width,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width:checkWidth,height:900,deviceScaleFactor:1,mobile:checkWidth<768})
      assert.ok(await evaluate(`(()=>{
        const dialog=document.querySelector('dialog'),save=dialog.querySelector('button[type=submit]')
        save.scrollIntoView({block:'center'})
        const bounds=dialog.getBoundingClientRect(),target=save.getBoundingClientRect()
        return bounds.left>=0&&bounds.right<=innerWidth+1&&dialog.scrollWidth<=dialog.clientWidth&&document.elementFromPoint(target.x+target.width/2,target.y+target.height/2)===save
      })()`),'Record Item fits and Save Record is reachable at '+checkWidth+'px')
    }
    await evaluate('document.querySelector("dialog button[type=submit]").click()')
    assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false)
    assert.equal(await evaluate('window.intakeEvents.submit'),1)
    assert.equal(await recordCount(),1)
    const cells=await evaluate('Array.from(document.querySelector(".desktop-records tr[data-record-id]").cells,cell=>cell.textContent)')
    assert.deepEqual(cells.slice(0,4),[itemName,sharedFields.category,'Confirmed location',formatReportDate(date)+' · '+sharedFields.time])
    assert.equal(cells[4],type+'By Guard')
    assert.equal(cells[5],type==='Found'?'Unclaimed':'Reported Lost')
  }
  console.log('PASS: Lost & Found campus-date validation, both type switches, draft and photo retention, explicit saves, and responsive intake.')
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await openPage({url:new URL('/lost-found',baseUrl).href})
  const lostRecord=async(id,grid=false)=>{
    await evaluate(`history.replaceState({},'',${JSON.stringify('/lost-found?search='+id+(grid?'&display=Grid':''))});dispatchEvent(new PopStateEvent('popstate'))`)
    await waitForLost('document.querySelector(".record-toolbar-search input")?.value==='+JSON.stringify(id)+'&&'+(grid?'!!document.querySelector(".lost-found-grid .item-card")':'document.querySelector(".desktop-records tr[data-record-id]")?.dataset.recordId==='+JSON.stringify(id)))
    const trigger=JSON.stringify(grid?'.lost-found-grid .item-card button':'.desktop-records tbody button')
    await evaluate(`(()=>{const button=document.querySelector(${trigger});button.focus();button.click()})()`)
  }
  await lostRecord('LF-009')
  assert.ok(await evaluate('document.querySelector(".lost-item-photo-empty").textContent.includes("No photo provided")'))
  assert.ok(await evaluate('document.querySelector(".lost-item-match-summary").textContent.includes("Flagged for review. No linked report recorded.")'))
  assert.equal(await evaluate('!!document.querySelector(".lost-item-photo-trigger")'),false)
  await evaluate('document.querySelector(".lost-item-history summary").click()')
  assert.ok(await evaluate('document.querySelector(".lost-item-history").textContent.includes("No verified activity log")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  const lostPhotoIds=[]
  for(const [name,imageWidth,imageHeight] of [['Tall',400,1800],['Wide',1800,400],['Square',600,600],['Broken',0,0]]){
    await evaluate('document.querySelector(".page-heading button").click()')
    const fields={name:'Lost photo '+name,category:'Personal Items',location:'Library',time:'10:30',description:name==='Tall'?'Fictional description with identifying details. '.repeat(45):'Fictional item for photo regression checks.',reporter:'Test Reporter'}
    await evaluate(`(()=>{const form=document.querySelector('dialog form');for(const [name,value] of Object.entries(${JSON.stringify(fields)}))form.elements.namedItem(name).value=value})()`)
    const svg=imageWidth?`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}"><rect width="100%" height="100%" fill="#243f61"/></svg>`:'Invalid image bytes'
    await chooseItemPhoto(name+(imageWidth?'.svg':'.png'),svg,imageWidth?'image/svg+xml':'image/png')
    await waitForLost('!!document.querySelector("dialog .upload-preview")')
    await evaluate('document.querySelector("dialog form").requestSubmit()')
    await evaluate('history.replaceState({},"",'+JSON.stringify('/lost-found?search='+encodeURIComponent(fields.name))+');dispatchEvent(new PopStateEvent("popstate"))')
    await waitForLost('document.querySelector(".desktop-records tr[data-record-id]")?.textContent.includes('+JSON.stringify(fields.name)+')')
    const id=await evaluate('document.querySelector(".desktop-records tr[data-record-id]").dataset.recordId')
    lostPhotoIds.push(id)
    await lostRecord(id,true)
    const query=await evaluate('location.search')
    assert.equal(await evaluate('document.querySelectorAll("dialog").length'),1)
    assert.ok(await evaluate('document.querySelector(".lost-item-facts").textContent.includes("Test Reporter")'))
    if(!imageWidth){
      await waitForLost('document.querySelector(".lost-item-photo-empty")?.textContent.includes("Photo unavailable")')
      assert.equal(await evaluate('!!document.querySelector(".lost-item-photo-trigger")'),false)
    }else{
      for(const width of [320,375,768,1440]){
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
        await pause(70)
        assert.ok(await evaluate('(()=>{const d=document.querySelector("dialog"),r=d.getBoundingClientRect(),f=d.querySelector("footer").getBoundingClientRect();return d.scrollWidth<=d.clientWidth&&r.left>=0&&r.right<=innerWidth+1&&f.bottom<=innerHeight+1})()'),'Lost details fit '+width)
        const savedScroll=await evaluate('(()=>{const body=document.querySelector(".lost-item-body");body.scrollTop=40;return body.scrollTop})()')
        await evaluate('window.lostDialog=document.querySelector("dialog");document.querySelector(".lost-item-photo-trigger").click()')
        assert.equal(await evaluate('document.querySelector("dialog")===window.lostDialog'),true,'Photo enlargement retains the same dialog')
        assert.ok(await evaluate('document.activeElement.classList.contains("lost-item-photo-title")'))
        assert.equal(await evaluate('getComputedStyle(document.querySelector(".lost-item-photo-full img")).objectFit'),'contain')
        assert.ok(await evaluate('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth'))
        await evaluate('document.querySelector(".lost-item-photo-back").click()')
        assert.ok(await evaluate('document.activeElement.classList.contains("lost-item-photo-trigger")'))
        assert.equal(await evaluate('document.querySelector(".lost-item-body").scrollTop'),savedScroll)
        if(name==='Square'&&(width===375||width===1440)){
          await evaluate('document.querySelector(".lost-item-body").scrollTop=0;document.querySelector("dialog .dialog-heading button").focus({preventScroll:true})')
          await writeFile('.verification/lost-item-details-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
        }
      }
    }
    if(name==='Wide'){
      await evaluate('document.querySelector(".lost-item-photo-trigger").click()')
      await evaluate('document.querySelector(".lost-item-photo-full img").dispatchEvent(new Event("error"))')
      await waitForLost('!!document.querySelector(".lost-item-photo-full .lost-item-photo-empty")')
      await evaluate('document.querySelector(".lost-item-photo-back").click()')
      assert.ok(await evaluate('document.activeElement===document.querySelector(".lost-item-heading h3")'),'An image failure restores focus to the item heading')
    }
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await waitForLost('!document.querySelector("dialog")')
    assert.equal(await evaluate('location.search'),query)
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  }
  await lostRecord(lostPhotoIds[0])
  await evaluate('document.querySelector(".lost-item-content footer .primary").click()')
  await evaluate('document.querySelector("[data-match-id=LF-002]").click()')
  await evaluate('Array.from(document.querySelectorAll("dialog button")).find(b=>b.textContent==="Link reports").click()')
  await evaluate('document.querySelector("dialog footer button").click()')
  await lostRecord(lostPhotoIds[0])
  assert.ok(await evaluate('document.querySelector(".lost-item-match-summary").textContent.includes("Gray Foldable Umbrella")'))
  assert.equal(await evaluate('document.querySelector(".lost-item-content footer .primary").textContent'),'View Linked Reports')
  await command('Emulation.setTimezoneOverride',{timezoneId:'UTC'})
  const verifiedAt='2026-11-25T15:59:30.000Z',releasedAt='2026-11-25T16:01:45.000Z'
  const headName=await evaluate('document.querySelector(".identity strong").textContent')
  await evaluate(`(()=>{
    window.handoverRealDate=Date
    window.handoverTime=${JSON.stringify(verifiedAt)}
    window.Date=new Proxy(Date,{construct:(target,args)=>new target(...(args.length?args:[window.handoverTime]))})
  })()`)
  const actionTimes=()=>evaluate('Array.from(document.querySelectorAll("dialog time")).filter(time=>!time.closest("details")).map(time=>[time.dateTime,time.textContent])')
  const verificationTime=[verifiedAt,'Nov 25, 2026 · 23:59:30 (Asia/Manila)']
  const releaseTime=[releasedAt,'Nov 26, 2026 · 00:01:45 (Asia/Manila)']
  const confirmButton=label=>evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`)
  const closeItem=()=>evaluate('document.querySelector("dialog footer button").click()')
  const checkActions=async released=>{
    await evaluate('document.querySelector(".lost-item-history summary").click()')
    const history=await evaluate('Array.from(document.querySelectorAll(".lost-item-history p"),entry=>entry.textContent)')
    assert.deepEqual(history.filter(entry=>entry.startsWith('Ownership verified')),['Ownership verified · '+headName+' · '+verificationTime[1]])
    assert.deepEqual(history.filter(entry=>entry.startsWith('Physical handover confirmed')),released?['Physical handover confirmed · '+headName+' · '+releaseTime[1]]:[])
    assert.ok(await evaluate('!document.querySelector("dialog").textContent.includes("Review the linked reports before confirming ownership.")'))
  }
  await evaluate('document.querySelector(".lost-item-content footer .primary").click()')
  await confirmButton('Verify Ownership')
  await evaluate(`(()=>{
    const form=document.querySelector('dialog form')
    form.elements.namedItem('claimant').value='Test Claimant'
    form.elements.namedItem('evidence').value='Fictional identifying details'
    form.elements.namedItem('idType').value='Student ID'
    form.elements.namedItem('ownershipChecked').checked=true
    form.requestSubmit()
    form.elements.namedItem('claimant').value='Duplicate claimant'
    form.requestSubmit()
  })()`)
  assert.equal(await evaluate('document.querySelector("dialog .callout strong")?.textContent||document.querySelector("dialog .callout").textContent'),'Ownership Verified — Item Still Held')
  assert.deepEqual(await actionTimes(),[verificationTime])
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Test Claimant")&&document.querySelector("dialog").textContent.includes("Student ID")'))
  await closeItem()
  await lostRecord(lostPhotoIds[0])
  assert.equal(await evaluate('document.querySelector(".lost-item-heading>.status-badge").textContent'),'Possible Match')
  assert.deepEqual(await actionTimes(),[verificationTime])
  await checkActions(false)
  await confirmButton('Record Physical Release')
  await confirmButton('Record Physical Release')
  const releaseDraft=(recipient,location)=>evaluate(`(()=>{
    const form=document.querySelector('dialog form')
    form.elements.namedItem('recipient').value=${JSON.stringify(recipient)}
    form.elements.namedItem('location').value=${JSON.stringify(location)}
    form.elements.namedItem('handoverConfirmed').checked=true
  })()`)
  await releaseDraft('Unconfirmed recipient',' ')
  await confirmButton('Confirm Release')
  assert.ok(await evaluate('document.querySelector("dialog [role=alert]").textContent.includes("release location")'))
  await releaseDraft('Cancelled recipient','Cancelled location')
  await closeItem()
  await lostRecord('LF-002')
  assert.equal(await evaluate('document.querySelector(".lost-item-heading>.status-badge").textContent'),'Possible Match')
  assert.ok(await evaluate('!document.querySelector(".lost-item-content").textContent.includes("Cancelled recipient")'))
  await checkActions(false)
  await confirmButton('Record Physical Release')
  await confirmButton('Record Physical Release')
  await evaluate(`window.handoverTime=${JSON.stringify(releasedAt)}`)
  await releaseDraft('Actual Recipient','Security Office')
  await evaluate(`(()=>{
    const form=document.querySelector('dialog form')
    form.requestSubmit()
    form.elements.namedItem('recipient').value='Duplicate recipient'
    form.elements.namedItem('location').value='Duplicate location'
    form.requestSubmit()
  })()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Returned — Process Complete")'))
  assert.deepEqual(await actionTimes(),[releaseTime])
  await closeItem()
  await evaluate('window.Date=window.handoverRealDate;delete window.handoverRealDate;delete window.handoverTime')
  await command('Emulation.setTimezoneOverride',{timezoneId:''})
  for(const id of [lostPhotoIds[0],'LF-002']){
    await lostRecord(id)
    assert.equal(await evaluate('document.querySelector(".lost-item-heading>.status-badge").textContent'),'Returned')
    assert.equal(await evaluate('!!document.querySelector(".lost-item-content footer .primary")'),false)
    assert.deepEqual(await actionTimes(),[verificationTime,releaseTime])
    const detail=await evaluate('document.querySelector(".lost-item-content").textContent')
    for(const fact of ['Test Claimant','Student ID','Actual Recipient','Security Office',id==='LF-002'?lostPhotoIds[0]:'LF-002'])assert.ok(detail.includes(fact),fact)
    assert.ok(!detail.includes('Duplicate')&&!detail.includes('Sample Security Head'))
    await checkActions(true)
    for(const width of [375,768,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768})
      assert.ok(await evaluate(`(()=>{
        const d=document.querySelector('dialog'),bounds=d.getBoundingClientRect(),foot=d.querySelector('footer').getBoundingClientRect()
        const body=d.querySelector('.lost-item-body'),history=d.querySelector('.lost-item-history')
        history.scrollIntoView({block:'end'})
        return d.scrollWidth<=d.clientWidth&&body.scrollWidth<=body.clientWidth&&bounds.left>=0&&bounds.right<=innerWidth+1&&foot.bottom<=innerHeight+1
      })()`),'Returned details fit at '+width+'px')
    }
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
    await waitForLost('!document.querySelector("dialog")')
    assert.equal(await evaluate('document.activeElement.closest(".desktop-records [data-record-id]")?.dataset.recordId'),id,'Closing returned details restores focus')
  }
  await lostRecord('LF-003')
  assert.ok(await evaluate('document.querySelector(".lost-item-content").textContent.includes("Handover details not recorded.")'))
  assert.deepEqual(await actionTimes(),[])
  assert.equal(await evaluate('!!document.querySelector(".lost-item-match-summary,.lost-item-content footer .primary")'),false)
  await closeItem()
  console.log('PASS: separate ownership and release, authenticated Manila timestamps, reciprocal linked details, failed and cancelled release, duplicate protection, legacy records, and responsive modal focus.')
  await lostRecord('LF-001')
  assert.ok(await evaluate('!!document.querySelector(".lost-item-content")'),'Found and lost reports use the same details component')
  assert.ok(await evaluate('document.querySelector(".lost-item-heading").textContent.includes("Found report")'))
  assert.ok(await evaluate('document.querySelector(".lost-item-facts").textContent.includes("Found At")'))
  const foundTableContent=await evaluate('document.querySelector(".lost-item-content").textContent')
  await evaluate('document.querySelector("dialog footer button").click()')
  await lostRecord('LF-001',true)
  assert.equal(await evaluate('document.querySelector(".lost-item-content").textContent'),foundTableContent,'Table and Grid show identical details for the same found record')
  await evaluate('document.querySelector("dialog footer button").click()')
  await lostRecord('LF-009')
  const lostTableContent=await evaluate('document.querySelector(".lost-item-content").textContent')
  await evaluate('document.querySelector("dialog footer button").click()')
  await lostRecord('LF-009',true)
  assert.equal(await evaluate('document.querySelector(".lost-item-content").textContent'),lostTableContent,'Table and Grid show identical details for the same lost record')
  await evaluate('document.querySelector("dialog footer button").click()')
  console.log('PASS: lost details photos and unavailable states, same-dialog enlargement, Back/focus/scroll, responsive footer, Escape, preserved URL state, linked and returned records, and identical Table/Grid details for both Lost and Found records.')

  await openPage({url:new URL('/lost-found?display=Grid',baseUrl).href})
  for(const [imageWidth,imageHeight] of [[400,2400],[2400,400],[600,600]]){
    const fixturePhoto='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+imageWidth+'" height="'+imageHeight+'"><rect width="100%" height="100%" fill="#243f61"/></svg>')
    await evaluate('(()=>{const img=document.createElement("img");img.dataset.testPhoto="true";img.alt="Photo overflow regression fixture";img.src='+JSON.stringify(fixturePhoto)+';document.querySelector(".lost-found-grid .item-photo").append(img);return img.decode()})()')
    for(const width of [320,375,768,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
      await pause(80)
      await evaluate('document.querySelector(".lost-found-grid .item-card").scrollIntoView({block:"center"})')
      assert.ok(await evaluate('(()=>{const img=document.querySelector("[data-test-photo]"),frame=img.parentElement.getBoundingClientRect(),photo=img.getBoundingClientRect(),info=img.closest(".item-card").querySelector(".item-info").getBoundingClientRect();return photo.left>=frame.left&&photo.right<=frame.right+1&&photo.top>=frame.top&&photo.bottom<=frame.bottom+1&&info.top>=frame.bottom-1&&getComputedStyle(img).objectFit==="contain"})()'),'Photo remains inside its frame: '+imageWidth+'x'+imageHeight+' at '+width)
      assert.ok(await evaluate('(()=>{const button=document.querySelector(".lost-found-grid .item-info button"),r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===button})()'),'View action is not covered by the image')
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
      if(imageHeight===2400&&(width===375||width===1440))await writeFile('.verification/lost-found-photo-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
    }
    await evaluate('document.querySelector("[data-test-photo]").remove()')
  }
  console.log('PASS: tall, wide, and square Lost & Found photos remain inside their frame; details and View actions remain accessible at phone, tablet, and desktop widths.')

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await openPage({url:new URL('/reports',baseUrl).href})
  await waitForLost('!!document.querySelector(".report-period [data-option=Daily]")')
  const reportPeriod=async value=>evaluate('Array.from(document.querySelectorAll(".report-period button")).find(b=>b.textContent==='+JSON.stringify(value)+').click()')
  for(const [value,range] of [['Daily','Oct 19, 2026'],['Weekly','Oct 13, 2026 to Oct 19, 2026'],['Monthly','Oct 1, 2026 to Oct 31, 2026'],['Yearly','Jan 1, 2026 to Dec 31, 2026']]){
    await reportPeriod(value)
    const tops=await evaluate('Array.from(document.querySelector(".report-config").children,n=>n.getBoundingClientRect().top)')
    assert.ok(tops.every(top=>Math.abs(top-tops[0])<2),'Preset controls align at the top for '+value)
    assert.equal(await evaluate('document.querySelector(".report-settings>.muted").textContent'),'Covered dates: '+range)
  }
  await reportPeriod('Custom')
  await setControl('input[aria-label="Report start date"]','2026-10-01')
  for(const width of [320,375,430,768,1024,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
    await pause(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Custom report fits '+width)
    assert.equal(await evaluate('document.querySelectorAll(".report-config>.field").length'),3)
    assert.ok(await evaluate('(()=>{const period=document.querySelector(".report-period").getBoundingClientRect(),date=document.querySelector(".report-config>.field").getBoundingClientRect();return period.bottom<=date.top})()'),'Period controls precede Custom fields')
    if(width>=1280)assert.ok(await evaluate('(()=>{const tops=Array.from(document.querySelectorAll(".report-config>.field"),n=>n.getBoundingClientRect().top);return tops.every(t=>Math.abs(t-tops[0])<2)})()'),'Custom dates and source align')
    assert.equal(await evaluate('document.querySelector(".report-config input").value'),'2026-10-01')
    await evaluate('document.querySelector(".report-config").scrollIntoView({block:"center"})')
    await writeFile('.verification/report-custom-'+width+'.png',Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
  }
  await setControl('input[aria-label="Report date"]','')
  assert.ok(await evaluate('!!document.querySelector(".report-settings .error-text")'))
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".report-settings button")).find(b=>b.textContent==="Preview Report").disabled'))
  await setControl('input[aria-label="Report date"]','2026-10-19')
  await setControl('input[aria-label="Report start date"]','2026-10-20')
  assert.ok(await evaluate('!!document.querySelector(".report-settings .error-text")'))
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".report-settings button")).find(b=>b.textContent==="Preview Report").disabled'))
  const reportButton=(scope,label)=>`Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(button=>button.textContent===${JSON.stringify(label)})`
  const reportAction=(scope,label,repeat=false)=>evaluate(`(()=>{const button=${reportButton(scope,label)};button.focus();button.click();${repeat?'button.click();':''}})()`)
  const reportPreview=reportButton('.report-settings','Preview Report')
  const settingsOpener=reportButton('.report-settings','PDF export settings')
  const openSettings=()=>reportAction('.report-settings','PDF export settings')
  const closeReport=()=>evaluate('document.querySelector("dialog footer button").click()')
  const closeRestores=button=>waitForLost(`!document.querySelector('dialog')&&document.activeElement===${button}`)
  const fieldValue=(scope,label)=>evaluate(`document.querySelector(${JSON.stringify(scope+' [aria-label="'+label+'"]')}).value`)
  const checkedSources=()=>evaluate('Array.from(document.querySelectorAll("dialog .checks input:checked"),input=>input.parentElement.textContent)')
  const allSources=['Gate & Access','Security Incidents','Lost & Found','Security Personnel']
  const selectSources=values=>evaluate(`(()=>{
    const wanted=${JSON.stringify(values)}
    for(const input of document.querySelectorAll('dialog .checks input')){
      if(input.checked!==wanted.includes(input.parentElement.textContent))input.click()
    }
  })()`)
  const reportOutputsDisabled=()=>evaluate('Array.from(document.querySelectorAll("dialog footer button")).slice(1).every(button=>button.disabled)')
  const pressReportKey=async (key,windowsVirtualKeyCode)=>{
    for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})})
  }
  await openSettings()
  assert.equal(await fieldValue('dialog','Report start date'),'2026-10-20')
  assert.equal(await reportOutputsDisabled(),true)
  await setControl('dialog [aria-label="Report date"]','')
  assert.equal(await reportOutputsDisabled(),true)
  assert.ok(await evaluate('document.querySelector("dialog [role=alert]").textContent.includes("Choose valid dates")'))
  await closeReport()
  await closeRestores(settingsOpener)
  assert.equal(await fieldValue('.report-settings','Report date'),'2026-10-19')
  assert.equal(await fieldValue('.report-settings','Report start date'),'2026-10-20')
  await setControl('.report-settings [aria-label="Report start date"]','2026-10-01')

  const cancelReportDraft=[
    closeReport,
    closeReport,
    ()=>pressReportKey('Escape',27),
    async()=>{for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:1,y:1,button:'left',clickCount:1})},
    ()=>evaluate('document.querySelector("dialog .dialog-heading button").click()'),
  ]
  for(const [attempt,width] of [375,375,768,1440,1440].entries()){
    await command('Emulation.setDeviceMetricsOverride',{width,height:width===375?720:1000,deviceScaleFactor:1,mobile:width<640})
    if(attempt===0){
      await evaluate(`${settingsOpener}.focus()`)
      await pressReportKey('Enter',13)
      await waitForLost('!!document.querySelector("dialog[open]")')
      await pressReportKey('Tab',9)
      assert.ok(await evaluate('!!document.activeElement.closest("dialog[open]")'),'Keyboard focus stays in settings')
    }else await openSettings()
    assert.deepEqual(await checkedSources(),allSources)
    assert.equal(await fieldValue('dialog','Report start date'),'2026-10-01')
    assert.equal(await fieldValue('dialog','Report date'),'2026-10-19')
    assert.equal(await fieldValue('dialog','Report source module'),'All Modules')
    assert.equal(await evaluate('document.querySelectorAll("dialog .report-config>.field").length'),3)
    await selectSources(attempt===0?['Security Incidents']:[])
    assert.equal(await reportOutputsDisabled(),attempt!==0)
    await setControl('dialog [aria-label="Report start date"]','2026-10-10')
    await setControl('dialog [aria-label="Report date"]','2026-10-23')
    await setControl('dialog [aria-label="Report source module"]','Security Incidents')
    await evaluate('document.querySelector("dialog .report-period [data-option=Weekly]").click()')
    assert.equal(await evaluate('document.querySelectorAll("dialog .report-config>.field").length'),2)
    assert.ok(await evaluate(`(()=>{
      const dialog=document.querySelector('dialog'),footer=dialog.querySelector('footer')
      footer.scrollIntoView({block:'nearest'})
      const bounds=dialog.getBoundingClientRect()
      return dialog.scrollWidth<=dialog.clientWidth&&bounds.left>=0&&bounds.right<=innerWidth+1&&footer.getBoundingClientRect().bottom<=innerHeight+1
    })()`),'Settings and footer fit at '+width+'px')
    await cancelReportDraft[attempt]()
    await closeRestores(settingsOpener)
    assert.equal(await evaluate('document.querySelector(".report-period [aria-pressed=true]").textContent'),'Custom')
    assert.equal(await fieldValue('.report-settings','Report start date'),'2026-10-01')
    assert.equal(await fieldValue('.report-settings','Report date'),'2026-10-19')
    assert.equal(await fieldValue('.report-settings','Report source module'),'All Modules')
    assert.equal(await evaluate(`${reportPreview}.disabled`),false)
  }
  await openSettings()
  assert.deepEqual(await checkedSources(),allSources)
  await selectSources([])
  assert.ok(await evaluate('document.querySelector("#report-source-error").textContent.includes("Select at least one")&&document.querySelector(".checks").getAttribute("aria-describedby")==="report-source-error"'))
  assert.equal(await reportOutputsDisabled(),true)
  await reportAction('dialog','Preview Report')
  await reportAction('dialog','PDF Export (Demo)')
  assert.equal(await evaluate('document.querySelector("dialog h2").textContent'),'PDF Export Settings')
  await selectSources(['Security Incidents'])
  await setControl('dialog [aria-label="Report start date"]','2026-10-15')
  await reportAction('dialog','Preview Report',true)
  assert.equal(await evaluate('document.querySelectorAll("dialog[open]").length'),1)
  assert.equal(await evaluate('document.querySelector("dialog>.muted").textContent'),'Custom · Oct 15, 2026 to Oct 19, 2026')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("dialog .report-preview-section strong"),node=>node.textContent)'),['Security Incidents'])
  await closeReport()
  await closeRestores(settingsOpener)
  assert.equal(await fieldValue('.report-settings','Report start date'),'2026-10-15')
  await setControl('.report-settings [aria-label="Report source module"]','Lost & Found')
  assert.equal(await evaluate(`${reportPreview}.disabled`),true)
  assert.ok(await evaluate('document.querySelector(".report-settings [role=alert]").textContent.includes("open PDF export settings")'))
  await setControl('.report-settings [aria-label="Report source module"]','All Modules')
  assert.equal(await evaluate(`${reportPreview}.disabled`),false)
  assert.equal(await evaluate('document.querySelector(".report-settings > p.muted:last-of-type").textContent'),'Included: Security Incidents')
  await setControl('.report-settings [aria-label="Report source module"]','Lost & Found')
  await openSettings()
  assert.deepEqual(await checkedSources(),['Security Incidents'])
  assert.equal(await reportOutputsDisabled(),true)
  assert.ok(await evaluate('document.querySelector("#report-source-error").textContent.includes("Lost & Found")'))
  await selectSources(['Security Incidents','Lost & Found'])
  await setControl('dialog [aria-label="Report date"]','2026-10-18')
  await reportAction('dialog','PDF Export (Demo)',true)
  assert.equal(await evaluate('document.querySelectorAll("dialog[open]").length'),1)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("No PDF was generated or modified.")'))
  for(const detail of ['Custom · Oct 15, 2026 to Oct 18, 2026','Included: Lost & Found'])assert.ok(await evaluate(`document.querySelector('dialog').textContent.includes(${JSON.stringify(detail)})`))
  await closeReport()
  await closeRestores(settingsOpener)
  await reportAction('.report-settings','Preview Report')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("dialog .report-preview-section strong"),node=>node.textContent)'),['Lost & Found'])
  await reportAction('dialog','PDF Export (Demo)',true)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Custom · Oct 15, 2026 to Oct 18, 2026")'))
  await closeReport()
  await closeRestores(reportPreview)

  await setControl('.report-archive [aria-label="Archive period"]','Weekly')
  await setControl('.report-archive [aria-label="Search reports..."]','Daily')
  assert.ok(await evaluate('document.querySelector(".report-archive tbody").textContent.includes("No matching records")'))
  await setControl('.report-archive [aria-label="Search reports..."]','Weekly')
  await reportAction('.report-archive','Preview')
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Weekly · Oct 13, 2026 to Oct 19, 2026")'))
  assert.equal(await evaluate('document.querySelectorAll("dialog .report-preview-section strong").length'),4)
  await closeReport()
  await reportAction('.report-archive','Details')
  await reportAction('dialog','Request Regeneration')
  await evaluate(`(()=>{
    const form=document.querySelector('dialog form')
    form.querySelector('textarea').value='Correct sample records'
    form.requestSubmit()
    form.requestSubmit()
  })()`)
  assert.equal(await evaluate('document.querySelectorAll("dialog[open]").length'),1)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("No PDF was generated or modified.")'))
  await closeReport()
  await closeRestores(reportButton('.report-archive','Details'))
  assert.equal(await fieldValue('.report-settings','Report start date'),'2026-10-15')
  assert.equal(await fieldValue('.report-settings','Report date'),'2026-10-18')
  assert.equal(await fieldValue('.report-settings','Report source module'),'Lost & Found')
  assert.equal(await fieldValue('.report-archive','Archive period'),'Weekly')
  await setControl('.report-archive [aria-label="Search reports..."]','')
  await setControl('.report-archive [aria-label="Archive period"]','All Periods')
  assert.equal(await evaluate('document.querySelectorAll(".report-archive tbody tr").length'),4)
  console.log('PASS: report dates, independent settings, all cancellation paths, invalid configuration recovery, exact preview/export, archive isolation, and responsive keyboard focus.')

  // Mobile record layouts use exactly the table's current page of records.
  for(const path of ['lost-found','visitors','incidents','personnel']){
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
    const query=path==='personnel'?'?sort=Name+Z-A':path==='visitors'?'?period=All&page=2':'?page=2'
    await openPage({url:new URL('/'+path+query,baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".desktop-records")'))break;await pause(100)}
    const ids=await evaluate('Array.from(document.querySelectorAll(".desktop-records tbody tr[data-record-id]"),n=>n.dataset.recordId)')
    const state=await evaluate('location.search')
    assert.ok(ids.length>0,path+': '+await evaluate('JSON.stringify({url:location.href,text:document.body.innerText.slice(0,900)})'))
    for(const width of [320,390,639,640,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
      await pause(60)
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".mobile-records")).display!=="none"'),width<640)
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".desktop-records")).display!=="none"'),width>=640)
      assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".mobile-record-list>li"),n=>n.dataset.recordId)'),ids)
      assert.equal(await evaluate('location.search'),state)
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Mobile record overflow: '+path+' '+width)
      assert.ok(await evaluate('Array.from(document.querySelectorAll(".mobile-record-actions button")).every(n=>getComputedStyle(document.querySelector(".mobile-records")).display==="none"||n.getBoundingClientRect().height>=44)'))
      // display:none removes the inactive layout and its controls from keyboard navigation.
      assert.equal(await evaluate('Array.from(document.querySelectorAll("'+(width<640?'.desktop-records':'.mobile-records')+' button")).filter(n=>n.getClientRects().length).length'),0)
    }
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false})
    if(path==='lost-found'||path==='personnel'){
      assert.equal(await evaluate('document.querySelector("[data-option=Table] .mobile-table-label").textContent'),'List')
      await evaluate('document.querySelector("[data-option=Grid]").click()')
      assert.equal(await evaluate('!!document.querySelector(".mobile-records")'),false)
      await evaluate('document.querySelector("[data-option=Table]").click()')
      assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".mobile-record-list>li"),n=>n.dataset.recordId)'),ids)
    }
    const currentState=await evaluate('location.search')
    const title=await evaluate('document.querySelector(".mobile-record h3").textContent')
    await evaluate('document.querySelector(".mobile-record-actions button").focus()')
    assert.equal(await evaluate('document.activeElement.closest(".mobile-record-actions")!==null'),true)
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'})
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
    await pause(100)
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'),'Mobile View keyboard action: '+path)
    const detailText=await evaluate('document.querySelector("dialog").textContent')
    assert.ok(detailText.includes(path==='incidents'?ids[0]:title),'Correct mobile record opened: '+path)
    await evaluate('document.querySelector("dialog footer button").click()')
    assert.equal(await evaluate('location.search'),currentState)
    assert.equal(await evaluate('document.activeElement.closest(".mobile-record-actions")!==null'),true)
    if(path==='incidents'){
      await evaluate('document.querySelectorAll(".mobile-record-actions button")[1].click()')
      assert.equal(await evaluate('document.querySelector("dialog h2").textContent'),'Update Incident')
      await evaluate('document.querySelector("dialog form").requestSubmit()')
      assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
      assert.equal(await evaluate('location.search'),currentState)
    }
    const searchSelector=path==='lost-found'?'input[placeholder="Search lost and found items..."]':path==='visitors'?'input[placeholder="Search visitors..."]':path==='incidents'?'input[placeholder="Search incidents..."]':'input[placeholder="Search ID, name or position..."]'
    await setControl(searchSelector,'impossible-record-search')
    assert.ok(await evaluate('document.querySelector(".mobile-records").textContent.includes("match your search or filters")'))
    await evaluate('document.querySelector(".mobile-records .empty button").click()')
    if(path==='visitors')await setControl('select[aria-label="Time period"]','All')
    assert.ok(await evaluate('document.querySelectorAll(".mobile-record-list>li").length>0'))
    // Stress wrapping without changing the store or fixture data.
    await evaluate('document.querySelector(".mobile-record h3").textContent="LongName".repeat(20);document.querySelector(".mobile-record dd").textContent="LongLocation".repeat(20)')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
    await reloadAsHead()
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".mobile-records")'))break;await pause(100)}
    await evaluate('document.querySelector(".mobile-records").scrollIntoView({block:"start"})')
    const capture=await command('Page.captureScreenshot',{format:'png'})
    await writeFile('.verification/'+path+'-mobile-records.png',Buffer.from(capture.data,'base64'))
  }
  // Complete the existing ownership and release workflow from a mobile list.
  await openPage({url:new URL('/lost-found?search=Gray+Foldable+Umbrella',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".mobile-record-actions")'))break;await pause(100)}
  await evaluate('document.querySelector(".mobile-record-actions button").click()')
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Review Matches').click()`)
  await evaluate('document.querySelector("dialog .match-review-button").click()')
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Link reports').click()`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Verify Ownership').click()`)
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.elements.namedItem('claimant').value='Fictional Claimant';f.elements.namedItem('evidence').value='Identifying details and sample ID checked';f.querySelector('select').selectedIndex=1;f.querySelector('input[type=checkbox]').click();f.requestSubmit()})()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Ownership Verified")'))
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Record Physical Release').click()`)
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.elements.namedItem('location').value='Security Office';f.querySelector('input[type=checkbox]').click();f.requestSubmit()})()`)
  assert.ok(await evaluate('/Returned.*Process Complete/.test(document.querySelector("dialog").textContent)'))
  await evaluate('document.querySelector("dialog footer button").click()')

  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false})
  for(const [path,expected] of [['visitors',visitorCardValues],['incidents',['2','2','13','17']],['lost-found',['5','2','4','15']],['personnel',['6','6','4']]]){
    await openPage({url:new URL('/'+path+'?search=unlikely&from=dashboard',baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".operational-cards")'))break;await pause(100)}
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".operational-cards strong"),n=>n.textContent)'),expected)
    const destinations=await evaluate('Array.from(document.querySelectorAll(".operational-cards a"),a=>a.href)')
    for(let index=0;index<destinations.length;index++){
      await evaluate('document.querySelectorAll(".operational-cards a")['+index+'].click()')
      assert.ok(await evaluate('new URLSearchParams(location.search).get("from")==="dashboard"'))
      assert.ok(await evaluate('!new URLSearchParams(location.search).has("search")'))
      if(path!=='personnel')assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),Math.min(10,Number(expected[index])))
      else if(index===1)assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),Number(expected[index]))
      await openPage({url:new URL('/'+path+'?search=unlikely&from=dashboard',baseUrl).href})
      for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".operational-cards")'))break;await pause(100)}
    }
    for(const width of [320,390,768,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Operational summary overflow: '+path+' '+width)
    }
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false})

  await openPage({url:new URL('/lost-found',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".item-pagination")'))break;await pause(100)}
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),10)
  await evaluate('Array.from(document.querySelectorAll(".item-pagination button")).find(b=>b.textContent==="Next").click()')
  assert.ok(await evaluate('location.search.includes("page=2")'))
  const savedState=await evaluate('location.search')
  await evaluate('document.querySelector("tbody button").click()')
  await evaluate('document.querySelector("dialog footer button").click()')
  assert.equal(await evaluate('location.search'),savedState)
  await reloadAsHead()
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".item-pagination")'))break;await pause(100)}
  assert.equal(await evaluate('location.search'),savedState)
  await evaluate('document.querySelector(".item-sort-button").click()')
  assert.ok(await evaluate('!new URLSearchParams(location.search).has("page")'))
  assert.equal(await evaluate('document.querySelector("th").getAttribute("aria-sort")'),'ascending')
  let names=await evaluate('Array.from(document.querySelectorAll("tbody tr[data-record-id]"),r=>r.cells[0].textContent)')
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base',numeric:true})))
  await evaluate('document.querySelector(".item-sort-button").click()')
  assert.equal(await evaluate('document.querySelector("th").getAttribute("aria-sort")'),'descending')
  await setControl('select[aria-label="Records per page"]','25')
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),25)
  await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Grid").click()')
  assert.equal(await evaluate('document.querySelectorAll(".item-card").length'),25)
  await setControl('input[placeholder="Search lost and found items..."]','no-such-item-123')
  assert.ok(await evaluate('document.querySelector(".item-empty").textContent.includes("No items match")'))
  await evaluate('document.querySelector(".item-empty button").click()')
  assert.equal(await evaluate('document.querySelectorAll(".item-card").length'),25)
  assert.equal(await evaluate('new URLSearchParams(location.search).get("display")'),'Grid')
  await openPage({url:new URL('/lost-found?page=999&display=Table',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".item-pagination")'))break;await pause(100)}
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),4)
  for(const width of [320,390,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false})

  for(const [path,searchSelector,sortSelector,headerIndex] of [
    ['visitors','input[placeholder="Search visitors..."]','select[aria-label="Sort visitors"]',0],
    ['incidents','input[placeholder="Search incidents..."]','select[aria-label="Incident sort order"]',0],
    ['personnel','input[placeholder="Search ID, name or position..."]','select[aria-label="Sort personnel"]',0]
  ]){
    await openPage({url:new URL('/'+path+(path==='visitors'?'?period=All':''),baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".record-pagination")'))break;await pause(100)}
    if(path!=='personnel'){
      await evaluate('Array.from(document.querySelectorAll(".record-pagination button")).find(b=>b.textContent==="Next").click()')
      assert.ok(await evaluate('location.search.includes("page=2")'))
    }
    const state=await evaluate('location.search')
    await evaluate(path==='incidents'?'(()=>{const el=document.querySelector("tbody select");el.value="View Incident";el.dispatchEvent(new Event("change",{bubbles:true}))})()':'document.querySelector("tbody button").click()')
    assert.ok(await evaluate('!!document.querySelector("dialog")'))
    await evaluate('document.querySelector("dialog footer button").click()')
    assert.equal(await evaluate('location.search'),state)
    await reloadAsHead()
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".record-pagination")'))break;await pause(100)}
    assert.equal(await evaluate('location.search'),state)
    await evaluate('document.querySelectorAll(".record-sort-button")['+headerIndex+'].click()')
    assert.ok(await evaluate('!new URLSearchParams(location.search).has("page")'))
    const direction=await evaluate('document.querySelector("thead th").getAttribute("aria-sort")')
    assert.ok(['ascending','descending'].includes(direction))
    await setControl(sortSelector,path==='personnel'?'Position A-Z':path==='visitors'?'Gate A-Z':'Location A-Z')
    assert.equal(await evaluate('new URLSearchParams(location.search).get("sort")'),path==='personnel'?'Position A-Z':path==='visitors'?'Gate A-Z':'Location A-Z')
    await setControl('select[aria-label="Records per page"]','25')
    if(path==='personnel'){
      await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Grid").click()')
      assert.equal(await evaluate('document.querySelectorAll(".personnel-card").length'),8)
    }
    await setControl(searchSelector,'nothing-matches-test')
    assert.ok(await evaluate('document.querySelector(".record-empty").textContent.includes("match your search")'))
    await evaluate('document.querySelector(".record-empty button").click()')
    assert.equal(await evaluate('document.querySelector(".record-pagination select").value'),'25')
    assert.ok(await evaluate('!new URLSearchParams(location.search).has("search")'))
    for(const width of [320,390,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'List overflow: '+path+' '+width)
    }
    await openPage({url:new URL('/'+path+'?page=invalid&pageSize=bad',baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".record-pagination")'))break;await pause(100)}
    assert.equal(await evaluate('document.querySelector(".record-pagination select").value'),'10')
    assert.ok(await evaluate('document.querySelector(".record-pagination").textContent.includes("Page 1 of")'))
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false})
  await openPage({url:new URL('/',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector("h1")'))break;await pause(100)}
  assert.equal(await evaluate('location.pathname'),'/dashboard')
  assert.equal(await evaluate('document.querySelector("h1")?.textContent'),'Security Dashboard')
  assert.equal(await evaluate('document.querySelectorAll(".summary").length'),4)
  assert.equal(await evaluate('document.querySelectorAll(".module").length'),0,'Repeated module panels are removed')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".dashboard-kpi>strong"),node=>node.textContent)'),[String(todayEntries),'4','5','6'])
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".dashboard-task-count"),node=>node.textContent)'),['2','2','4','2'])
  assert.equal(await evaluate('document.querySelectorAll(".dashboard-logbook-entries li").length'),5)
  assert.equal(await evaluate('document.querySelectorAll(".dashboard-page .recharts-wrapper").length'),0)
  await evaluate('document.querySelector(".dashboard-kpi").focus()')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13})
  await pause(100)
  assert.equal(await evaluate('document.querySelector("h1").textContent'),'Gate & Visitor Management','Summary cards support keyboard activation')
  await evaluate('document.querySelector(".dashboard-back-link").click()')
  const dashboardReturn = async () => {
    await evaluate('document.querySelector(".dashboard-back-link").click()')
    assert.equal(await evaluate('document.querySelector("h1").textContent'),'Security Dashboard')
  }
  for(const [metric,title,count] of [['visitors','Gate & Visitor Management',todayEntries],['incidents','Incidents',4],['items','Lost & Found',5],['guards','Security Personnel',6]]){
    await evaluate(`document.querySelector('[data-metric="${metric}"]').click()`)
    assert.equal(await evaluate('document.querySelector("h1").textContent'),title)
    if(metric==='visitors'){
      await assertRecordCount(count)
      assert.ok(await evaluate('document.querySelector(".record-filter-chips").textContent.includes("Entered")'))
    }else if(metric==='incidents'){
      await assertRecordCount(count)
      assert.ok(await evaluate('document.querySelector(".record-filter-chips").textContent.includes("Unresolved")'))
    }else if(metric==='items'){
      await assertRecordCount(count)
      assert.ok(await evaluate('document.querySelector(".record-filter-chips").textContent.includes("Awaiting Return")'))
      assert.ok(await evaluate('Array.from(document.querySelectorAll("tbody tr[data-record-id]")).every(node=>!node.textContent.includes("Returned"))'))
    }else{
      assert.equal(await evaluate('document.querySelectorAll(".summary strong")[0].textContent'),String(count))
      assert.ok(await evaluate('document.querySelector(".assignment-controls").textContent.includes("06:00–14:00")'))
    }
    await dashboardReturn()
  }
  for(const [key,title,count] of [['open','Incidents',2],['overdue','Lost & Found',2],['matches','Lost & Found',4],['monitoring','Incidents',2]]){
    await evaluate(`document.querySelector('[data-attention="${key}"]').click()`)
    assert.equal(await evaluate('document.querySelector("h1").textContent'),title)
    assert.equal(await evaluate(title==='Incidents'?'document.querySelectorAll("tbody tr[data-record-id]").length':'document.querySelectorAll("tbody tr[data-record-id]").length'),count)
    await dashboardReturn()
  }
  await evaluate('document.querySelector("[data-metric=incidents]").click()')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Resolved').click()`)
  await assertRecordCount(13)
  assert.ok(await evaluate('location.search.includes("status=Resolved")'))
  await evaluate('history.back()')
  await pause(100)
  assert.equal(await evaluate('document.querySelector("h1").textContent'),'Security Dashboard')
  await evaluate('history.forward()')
  await pause(100)
  await assertRecordCount(13,'Back/Forward preserves changed filters')
  await evaluate('document.querySelector(".record-filter-clear").click()')
  await assertRecordCount(17)
  await dashboardReturn()
  for(const [label,title,total] of [['Incidents','Incidents',17],['Visitors','Gate & Visitor Management',265],['Lost & Found','Lost & Found',34]]){
    await evaluate(`Array.from(document.querySelectorAll('.dashboard-logbook-controls button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`)
    assert.equal(await evaluate('document.querySelectorAll(".dashboard-logbook-entries li").length'),5)
    await evaluate('document.querySelector(".dashboard-record-link").click()')
    assert.equal(await evaluate('document.querySelector("h1").textContent'),title)
    assert.ok(await evaluate('!!document.querySelector("dialog[open]")'),'A recent entry opens its actual record')
    assert.equal(await evaluate('new URLSearchParams(location.search).has("record")'),false,'One-time detail request is consumed')
    await evaluate('document.querySelector("dialog .dialog-heading button").click()')
    await pause(100)
    assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
    await dashboardReturn()
    await evaluate(`Array.from(document.querySelectorAll('.dashboard-logbook-controls button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`)
    await evaluate('document.querySelector(".dashboard-view-all").click()')
    assert.ok(await evaluate(`document.querySelector('.record-filter-results').textContent.includes('${total} of ${total}')`),'View all includes older logbook records')
    await dashboardReturn()
  }
  for(const label of ['Record an incident','Record a lost or found item','View duty schedule','Prepare daily report']){
    const startedAt=await evaluate('new Date().toISOString()')
    await evaluate(`Array.from(document.querySelectorAll('.dashboard-quick-actions a')).find(link=>link.querySelector('strong').textContent===${JSON.stringify(label)}).click()`)
    if(label.startsWith('Record')){
      assert.ok(await evaluate('!!document.querySelector("dialog[open] form")'))
      assert.equal(await evaluate('new URLSearchParams(location.search).has("action")'),false)
      if(label==='Record an incident')await assertCampusOccurrence(startedAt)
      await evaluate('document.querySelector("dialog .dialog-heading button").click()')
      await pause(100)
      assert.equal(await evaluate('!!document.querySelector("dialog")'),false,'Closing the quick-action form does not reopen it')
    }else if(label==='Prepare daily report'){
      for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Security Reports"'))break;await pause(100)}
      assert.equal(await evaluate('document.querySelector(".report-config input[type=date]").value'),'2026-10-19')
      assert.equal(await evaluate('!!document.querySelector("dialog")'),false,'Preparing a report does not automatically generate/export it')
    }else assert.equal(await evaluate('document.querySelector("h1").textContent'),'Security Personnel')
    await dashboardReturn()
  }
  for(const [path,title] of [['incidents','Incidents'],['visitors','Gate & Visitor Management'],['lost-found','Lost & Found']]){
    await openPage({url:new URL(`/${path}?from=dashboard&view=all&record=missing-record`,baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate('!!document.querySelector(".dashboard-missing-record")'))break;await pause(100)}
    assert.equal(await evaluate('document.querySelector("h1").textContent'),title)
    assert.ok(await evaluate('document.querySelector(".dashboard-missing-record").textContent.includes("no longer available")'))
    assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
    await evaluate('document.querySelector(".dashboard-missing-record button").click()')
    assert.equal(await evaluate('!!document.querySelector(".dashboard-missing-record")'),false)
    await dashboardReturn()
  }
  await openPage({url:new URL('/visitors?period=All',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Gate & Visitor Management"'))break;await pause(100)}
  await assertRecordCount(265)
  await evaluate('document.querySelector(".search-box input").focus()')
  await command('Input.insertText',{text:'Bianca'})
  await pause(100)
  await assertRecordCount(fixtureVisits.filter(v=>v.name.includes('Bianca')).length)
  await setControl('input[placeholder="Search visitors..."]','VIS-0002')
  await assertRecordCount(1)
  await evaluate('document.querySelector(".record-more-filters").click()')
  await setControl('select[aria-label="Gate"]','Gate 2')
  assert.ok(await evaluate('document.querySelector("tbody").textContent.includes("match your search or filters")'))
  await setControl('select[aria-label="Gate"]','Gate 1')
  assert.ok(await evaluate('document.querySelector("tbody").textContent.includes("Bianca Restrepo")'))
  await evaluate('document.querySelector("tbody button").focus();document.querySelector("tbody button").click()')
  assert.equal(await evaluate('document.querySelector("dialog")?.open'),true)
  await evaluate('document.querySelector("dialog footer button").click()')
  await openPage({url:new URL('/lost-found',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Lost & Found"'))break;await pause(100)}
  await evaluate(`document.querySelector('[data-option=Table]').click()`)
  await setControl('select[aria-label="Records per page"]','50')
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),34)
  await evaluate('document.querySelector(".page-heading button").click()')
  await evaluate(`(()=>{const f=document.querySelector('dialog form');for(const [name,value] of Object.entries({name:'Smoke Test Umbrella',category:'Personal Items',location:'Library',time:'10:30',description:'Fictional smoke test record',reporter:'Test Visitor'})){f.elements.namedItem(name).value=value}f.requestSubmit()})()`)
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),35)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Grid').click()`)
  assert.equal(await evaluate('document.querySelectorAll(".item-card").length'),35)
  await evaluate(`Array.from(document.querySelectorAll('.item-card')).find(c=>c.textContent.includes('Gray Foldable Umbrella')).querySelector('button').click()`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Review Matches').click()`)
  await evaluate('document.querySelector("dialog .match-review-button").click()')
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Link reports').click()`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Verify Ownership').click()`)
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.elements.namedItem('claimant').value='Fictional Claimant';f.elements.namedItem('evidence').value='Identifying details and sample ID checked';f.querySelector('select').selectedIndex=1;f.querySelector('input[type=checkbox]').click();f.requestSubmit()})()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Ownership Verified")'))
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Record Physical Release').click()`)
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.elements.namedItem('location').value='Security Office';f.querySelector('input[type=checkbox]').click();f.requestSubmit()})()`)
  assert.ok(await evaluate('/Returned.*Process Complete/.test(document.querySelector("dialog").textContent)'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await evaluate(`Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Dashboard').click()`)
  assert.equal(await evaluate('document.querySelectorAll(".summary strong")[2].textContent'),'4')
  await openPage({url:new URL('/personnel',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Security Personnel"'))break;await pause(100)}
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),8)
  const personnelPhotoButton=label=>evaluate(`Array.from(document.querySelectorAll('dialog button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`)
  const portrait='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="400"><rect width="240" height="400" fill="#243f61"/></svg>'
  async function personnelPhoto(inputSelector, contents, mime='image/svg+xml'){
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(inputSelector)}),transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(contents)}], "portrait", {type:${JSON.stringify(mime)}}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  }
  await evaluate('document.querySelector(".page-heading button").click()')
  assert.equal(await evaluate('document.querySelector("dialog input[name=status]:checked").value'),'Active')
  await evaluate('window.personnelPicker="";for(const input of document.querySelectorAll("dialog input[type=file]"))input.addEventListener("click",e=>{e.preventDefault();window.personnelPicker=input.getAttribute("capture")||"picker"})')
  await personnelPhotoButton('Take Photo')
  assert.equal(await evaluate('window.personnelPicker'),'environment')
  await personnelPhotoButton('Choose Photo')
  assert.equal(await evaluate('window.personnelPicker'),'picker')
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.elements.namedItem('name').value='Sample Guard';f.elements.namedItem('contact').value='0917 555 0123';f.requestSubmit()})()`)
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),9)
  await evaluate('document.querySelector("button[aria-label=\'View profile for Sample Guard\']").click()')
  assert.equal(await evaluate('document.querySelector(".personnel-profile-contact dd").textContent'),'0917 555 0123')
  await personnelPhotoButton('Assignments')
  assert.ok(await evaluate('document.querySelector(".personnel-profile").textContent.includes("Not scheduled for this shift")'))
  await evaluate('document.querySelector("#personnel-tab-Assignments").focus()')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  assert.equal(await evaluate('document.activeElement.id'),'personnel-tab-Activity')
  assert.ok(await evaluate('!document.querySelector("#personnel-panel-Activity").hidden&&document.querySelector("#personnel-panel-Activity").textContent.includes("No linked activity")'))
  await evaluate('document.querySelector("dialog footer .outline").click()')
  await evaluate('document.querySelector(".page-heading button").click()')
  await personnelPhoto('dialog input[capture]',portrait)
  await waitForLost('!!document.querySelector(".personnel-photo-preview")')
  await evaluate('document.querySelector("dialog input[name=name]").value="Photo Test Guard";document.querySelector("dialog form").requestSubmit()')
  await evaluate('document.querySelector("button[aria-label=\'View profile for Photo Test Guard\']").click()')
  assert.ok(await evaluate('!!document.querySelector(".personnel-profile-identity img")'))
  for(const width of [320,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false})
    await personnelPhotoButton('View full photo')
    assert.ok(await evaluate('(()=>{const d=document.querySelector("dialog"),img=d.querySelector(".personnel-full-photo img");return !!img&&getComputedStyle(img).objectFit==="contain"&&d.scrollWidth<=d.clientWidth&&d.getBoundingClientRect().bottom<=innerHeight})()'))
    await personnelPhotoButton('Back to profile')
    assert.equal(await evaluate('document.activeElement.textContent'),'View full photo')
  }
  await personnelPhotoButton('Update Photo')
  const originalPortrait=await evaluate('document.querySelector(".personnel-photo-preview").src')
  await personnelPhoto('dialog input[type=file]:not([capture])','invalid','image/png')
  await waitForLost('document.querySelector("dialog [role=alert]")?.textContent.includes("could not be opened")')
  await evaluate('(()=>{const input=document.querySelector("dialog input[type=file]:not([capture])"),dt=new DataTransfer();dt.items.add(new File([new Uint8Array(5000001)],"large.png",{type:"image/png"}));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}))})()')
  assert.ok(await evaluate('document.querySelector("dialog [role=alert]").textContent.includes("5 MB")'))
  assert.equal(await evaluate('document.querySelector(".personnel-photo-preview").src'),originalPortrait)
  await personnelPhotoButton('Remove Photo')
  await personnelPhotoButton('Cancel')
  assert.equal(await evaluate('document.querySelector(".personnel-profile-identity img").src'),originalPortrait)
  await personnelPhotoButton('Update Photo')
  await personnelPhoto('dialog input[type=file]:not([capture])',portrait.replace('240','320'))
  await waitForLost('document.querySelector(".personnel-photo-preview")?.naturalWidth===320')
  await personnelPhotoButton('Save Photo')
  assert.notEqual(await evaluate('document.querySelector(".personnel-profile-identity img").src'),originalPortrait)
  await personnelPhotoButton('Update Photo')
  await personnelPhotoButton('Remove Photo')
  await personnelPhotoButton('Save Photo')
  assert.equal(await evaluate('!!document.querySelector(".personnel-profile-identity img")'),false)
  await personnelPhotoButton('Close')
  await evaluate('document.querySelector("button[aria-label=\'View profile for Carlos Ignacio Santos\']").click()')
  await personnelPhotoButton('Activity')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-timeline").textContent.includes("Assigned to Incident")'))
  await personnelPhotoButton('Close')
  await evaluate('document.querySelector("button[aria-label=\'View profile for Benedicto Cruz Navarro\']").click()')
  assert.equal(await evaluate('document.querySelector("[role=tab][aria-selected=true]").textContent'),'Profile')
  await personnelPhotoButton('Assignments')
  assert.ok(await evaluate('document.querySelector(".personnel-assignment-line").textContent.includes("UNC Sports Palace")'))
  await evaluate('document.querySelector("dialog footer .primary").click()')
  assert.equal(await evaluate('location.pathname'),'/personnel/duty-schedule/selected-shift')
  assert.equal(await evaluate('new URLSearchParams(location.search).get("date")'),'2026-10-19')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Edit Group').click()`)
  assert.equal(await evaluate('document.querySelectorAll("dialog input[type=checkbox]:disabled").length'),2,'Inactive personnel cannot be assigned')
  await evaluate('document.querySelector("dialog input[type=checkbox]:checked").click()')
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Save Group Draft').click()`)
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Check Schedule').click()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("No overlapping assignments")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Publish Schedule').click()`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Publish Roster').click()`)
  assert.ok(await evaluate('document.querySelector(".assignment-controls").textContent.includes("Published")'))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Copy Another Schedule').click()`)
  await evaluate('document.querySelector("dialog form").requestSubmit()')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false)
  assert.ok(await evaluate('document.querySelector(".assignment-controls").textContent.includes("Oct 26")'))
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Publish Schedule').disabled`))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Apply Template').click()`)
  await evaluate('document.querySelector("dialog input[name=replace]").click();document.querySelector("dialog form").requestSubmit()')
  assert.equal(await evaluate('document.querySelectorAll(".summary strong")[0].textContent'),'6')
  await evaluate(`document.querySelector('a[href="/personnel/activity-history"]').click()`)
  assert.ok(await evaluate('document.querySelector("tbody").textContent.includes("Roster copied")'))
  assert.ok(await evaluate('document.querySelector("tbody").textContent.includes("Template applied")'))
  const activitySearch='input[aria-label^="Search personnel or activity"]'
  await evaluate('Array.from(document.querySelectorAll(".record-pagination button")).find(b=>b.textContent==="Next").click()')
  assert.ok(await evaluate('document.querySelector(".record-pagination").textContent.includes("Page 2")'))
  await setControl('select[aria-label="Activity category"]','Personnel changes')
  assert.ok(await evaluate('document.querySelector(".record-pagination").textContent.includes("Page 1")'))
  await setControl('select[aria-label="Activity personnel"]','ACCOUNT-HEAD')
  await setControl('select[aria-label="Activity date"]',currentVisitorDate)
  await setControl(activitySearch,'TEMPLATE')
  assert.equal(await evaluate('document.querySelectorAll(".activity-history-table tbody tr[data-record-id]").length'),1)
  assert.ok(await evaluate('document.querySelector(".activity-history-table tbody").textContent.includes("Rosario Bautista")'))
  await evaluate('document.querySelector(".activity-history-table tbody button").click()')
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("Template applied")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await setControl(activitySearch,'no matching activity')
  assert.ok(await evaluate('document.querySelector(".activity-history-table").textContent.includes("No activity records match")'))
  await evaluate('Array.from(document.querySelectorAll(".activity-history-filter-options button")).find(b=>b.textContent==="Reset filters").click()')
  assert.equal(await evaluate('document.querySelectorAll(".activity-history-table tbody tr[data-record-id]").length'),10)
  await command('Emulation.setDeviceMetricsOverride',{width:375,height:850,deviceScaleFactor:1,mobile:false})
  await pause(100)
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'))
  await evaluate('document.querySelector(".mobile-record-actions button").click()')
  assert.ok(await evaluate('!!document.querySelector("dialog[open]")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  await openPage({url:new URL('/incidents',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Incidents"'))break;await pause(100)}
  await assertRecordCount(17)
  {
    const opener='.page-heading button'
    const openIncident=()=>evaluate(`document.querySelector('${opener}').focus();document.querySelector('${opener}').click()`)
    const submitIncident=()=>evaluate('document.querySelector("dialog form button[type=submit]").click()')
    const lastDialog='Array.from(document.querySelectorAll("dialog[open]")).at(-1)'
    const incidentForm='document.querySelector("dialog form")'
    const draft=()=>evaluate(`Object.fromEntries(new FormData(${incidentForm}))`)
    const fill=fields=>evaluate(`(()=>{
      const form=${incidentForm}
      for(const [name,value] of Object.entries(${JSON.stringify(fields)}))form.elements.namedItem(name).value=value
    })()`)
    const press=async(key,keyCode,modifiers=0)=>{
      for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:keyCode,modifiers,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})})
    }
    const backdrop=async()=>{
      for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:1,y:1,button:'left',clickCount:1})
    }
    const dismissals=[
      ()=>press('Escape',27),backdrop,
      ()=>evaluate(`${lastDialog}.querySelector('.dialog-heading button').click()`),
      ()=>evaluate(`${lastDialog}.querySelector('footer button').click()`),
    ]
    const waitForDialogCount=count=>waitForLost(`document.querySelectorAll('dialog[open]').length===${count}`)
    const checkConfirmation=async context=>{
      try{await waitForDialogCount(2)}catch(error){
        const state=await evaluate('Array.from(document.querySelectorAll("dialog"),dialog=>[dialog.querySelector("h2").textContent,dialog.open,dialog.dataset.closing])')
        assert.fail(context+': expected discard confirmation, open dialogs '+JSON.stringify(state)+'; '+error.message)
      }
      assert.ok(await evaluate(`(()=>{
        const dialog=${lastDialog},active=document.activeElement
        return document.getElementById(dialog.getAttribute('aria-labelledby')).textContent==='Discard incident changes?'
          && active.textContent==='Keep editing' && dialog.contains(active)
      })()`),'Discard confirmation has an accessible title and focuses its safe action')
      assert.equal(await evaluate('new Set(Array.from(document.querySelectorAll("dialog"),d=>d.getAttribute("aria-labelledby"))).size'),2)
    }
    await command('Emulation.setTimezoneOverride',{timezoneId:'UTC'})
    const startedAt=await evaluate('new Date().toISOString()')
    await openIncident()
    await assertCampusOccurrence(startedAt)
    await fill({location:'Test Library',description:'Valid incident narrative'})
    await submitIncident()
    assert.equal(await evaluate('document.querySelector("dialog [name=type]").validity.valueMissing'),true)
    await assertRecordCount(17)
    await fill({type:'Disturbance',location:' '})
    await submitIncident()
    assert.ok(await evaluate('document.querySelector("dialog [role=alert]").textContent.includes("Complete the location")'))
    const fixture=fixtureIncidents[0]
    const rowAction='select[aria-label="Actions for '+fixture.id+'"]'
    const savedFields={
      type:fixture.type,status:fixture.status,datetime:fixture.date+'T'+fixture.time,location:fixture.location,people:fixture.people,
      personnel:fixture.personnel,reporter:fixture.reporter,description:fixture.description,observations:fixture.observations,
      actions:fixture.actions,evidence:fixture.evidence,
    }
    for(const mode of ['create','edit']){
      if(mode==='edit'){
        await setControl(rowAction,'Update Incident')
        assert.deepEqual(await draft(),savedFields,'Update opens with the complete saved incident')
      }else await fill({location:'Test Library'})
      const initial=await draft()
      const changedFields={
        type:initial.type==='Bullying'?'Disturbance':'Bullying',status:'Being Monitored',datetime:'2026-10-18T08:00',
        location:'Test hallway',people:'Test witness',personnel:'SEC-002',reporter:'Test reporter',
        description:'Test narrative',observations:'Test observations',actions:'Test actions',evidence:'Test evidence',
      }
      for(const [i,width] of [375,768,1440,375].entries()){
        await command('Emulation.setDeviceMetricsOverride',{width,height:i===3?520:900,deviceScaleFactor:1,mobile:width<768})
        await fill(changedFields)
        await evaluate('document.querySelector("dialog [name=evidence]").focus()')
        const scrollTop=await evaluate('document.querySelector("dialog").scrollTop')
        await dismissals[i]()
        await checkConfirmation(mode+' dismissal '+i)
        assert.ok(await evaluate(`(()=>{
          const dialog=${lastDialog},bounds=dialog.getBoundingClientRect()
          return bounds.left>=0&&bounds.right<=innerWidth+1&&bounds.bottom<=innerHeight+1
            && dialog.scrollWidth<=dialog.clientWidth
            && Array.from(dialog.querySelectorAll('footer button')).every(button=>{
              const b=button.getBoundingClientRect()
              return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button
            })
        })()`),'Confirmation actions fit at '+width+'px')
        if(i===0){
          for(let tab=0;tab<4;tab++){
            await press('Tab',9)
            const focus=await evaluate(`document.activeElement===document.body||${lastDialog}.contains(document.activeElement)`)
            assert.equal(focus,true,'Focus does not enter the underlying form')
          }
          await press('Escape',27)
        }else if(i===3){
          await press('Enter',13)
        }else{
          await dismissals[i]()
        }
        await waitForDialogCount(1)
        assert.deepEqual(await draft(),changedFields)
        await waitForLost(`document.querySelector('dialog').scrollTop===${scrollTop}`+(i===0?"&&document.activeElement.name==='evidence'":''))
        if(mode==='create')assert.ok(await evaluate('!!document.querySelector("dialog [role=alert]")'))
      }
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
      await dismissals[3]()
      await checkConfirmation(mode+' confirmed discard')
      await evaluate(`${lastDialog}.querySelector('footer .danger').click()`)
      await waitForDialogCount(0)
      await assertRecordCount(17)
      assert.equal(await evaluate('document.activeElement.matches('+JSON.stringify(mode==='create'?opener:rowAction)+')'),true)
      if(mode==='create')await evaluate(`document.querySelector(${JSON.stringify(rowAction)}).focus()`)
      else{
        await setControl(rowAction,'Update Incident')
        assert.deepEqual(await draft(),savedFields)
        for(const [name,value] of Object.entries(changedFields)){
          await fill({[name]:value})
          await dismissals[2]()
          await checkConfirmation('edit field '+name)
          await evaluate(`${lastDialog}.querySelector('footer .outline').click()`)
          await waitForDialogCount(1)
          await fill({[name]:savedFields[name]})
        }
        await dismissals[3]()
        await waitForDialogCount(0)
        await setControl(rowAction,'Update Incident')
        await evaluate(`(()=>{
          const form=${incidentForm}
          form.elements.namedItem('description').value='First saved update'
          form.requestSubmit()
          form.elements.namedItem('description').value='Duplicate update'
          form.requestSubmit()
        })()`)
        await waitForDialogCount(0)
        await assertRecordCount(17)
        await setControl(rowAction,'View Incident')
        assert.equal(await evaluate('document.querySelector("dialog [name=description]").value'),'First saved update')
        assert.equal(await evaluate('document.querySelector("dialog [name=personnel]").value'),fixture.personnel)
        assert.ok(await evaluate('document.querySelector("dialog").textContent.includes('+JSON.stringify(fixture.reportStatus)+')'))
        await dismissals[3]()
        await waitForDialogCount(0)
      }
    }
    await openIncident()
    await dismissals[3]()
    await waitForDialogCount(0)
    await command('Emulation.setTimezoneOverride',{timezoneId:''})
  }
  await evaluate('document.querySelector(".page-heading button").click()')
  await evaluate(`(()=>{
    const form=document.querySelector('dialog form')
    for(const [name,value] of Object.entries({type:'Disturbance',datetime:'2026-10-19T11:00',location:'Test Library',description:'Fictional test incident',reporter:'Test reporter'}))form.elements.namedItem(name).value=value
    form.requestSubmit()
    form.requestSubmit()
  })()`)
  assert.equal(await evaluate('document.querySelectorAll("dialog").length'),0)
  await assertRecordCount(18)
  const created=await evaluate('Array.from(Array.from(document.querySelectorAll("tbody tr[data-record-id]")).find(row=>row.cells[3].textContent==="Test Library").cells,cell=>cell.textContent)')
  assert.deepEqual(created.slice(1,6),['Disturbance','Oct 19, 2026 – 11:00','Test Library','Unassigned','Test reporter'])
  console.log('PASS: incident campus occurrence, category and responder defaults, historical save, draft dismissal and focus, and duplicate create/update protection.')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Open').click()`)
  assert.equal(await evaluate('document.querySelectorAll("tbody tr[data-record-id]").length'),3)
  await evaluate(`Array.from(document.querySelectorAll('.sidebar button')).find(b=>b.textContent==='Dashboard').click()`)
  assert.equal(await evaluate('document.querySelectorAll(".summary strong")[1].textContent'),'5')
  assert.equal(await evaluate('document.querySelector("[data-attention=open] .dashboard-task-count").textContent'),'3','Attention counts reflect newly recorded incidents')
  await evaluate(`document.querySelector('a[href="/analytics"]').click()`)
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Security Analytics"'))break;await pause(100)}
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".summary strong"),node=>node.textContent)'),['245','12','24','15'])
  assert.ok(await evaluate('document.querySelector(".analytics-active-range").textContent.includes("Sep 1, 2026 – Sep 30, 2026")'))
  await evaluate('document.querySelector(".analytics-data summary").click()')
  assert.equal(await evaluate('document.querySelectorAll(".analytics-data table").length'),3)
  assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),30)
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".analytics-data table tfoot td"),node=>node.textContent)'),['245','11','13','12','100%','15','100%'])
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".analytics-data table")[1].querySelectorAll("tbody tr"),row=>Array.from(row.querySelectorAll("td"),cell=>cell.textContent))'),[['5','41.7%'],['3','25.0%'],['3','25.0%'],['1','8.3%']])
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".analytics-data table")[2].querySelectorAll("tbody tr"),row=>row.querySelector("td").textContent)'),['5','4','3','3'])
  assert.deepEqual(await evaluate('Array.from(document.querySelector(".analytics-data table").querySelectorAll("tbody tr")).reduce((totals,row)=>totals.map((total,i)=>total+Number(row.querySelectorAll("td")[i].textContent)),[0,0,0])'),[245,11,13])
  await evaluate('document.querySelector(".analytics-card .recharts-surface").focus()')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await pause(120)
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".analytics-card .recharts-tooltip-wrapper")).some(node=>getComputedStyle(node).visibility!=="hidden"&&node.textContent.includes("2026"))'),'Chart tooltip can be opened with the keyboard')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Selected Day').click()`)
  assert.ok(Number(await evaluate('document.querySelector(".summary strong").textContent'))<245)
  assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),24)
  for(const [preset,rows] of [['Last 7 Days',7],['Last 30 Days',30],['Calendar Month',30],['Calendar Year',12]]){
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(preset)}).click()`)
    assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),rows,`${preset} uses the expected intervals`)
  }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Reset Filters').click()`)
  for(const module of ['Gate & Access','Security Incidents','Lost & Found','Security Personnel']){
    await setControl('[aria-label="Analytics source module"]',module)
    assert.equal(await evaluate('document.querySelectorAll(".summary").length'),1,'Excluded modules are hidden, not displayed as zero')
    assert.equal(await evaluate('document.querySelectorAll(".analytics-card").length'),1)
    assert.equal(await evaluate('document.querySelectorAll(".analytics-data table").length'),1)
  }
  await setControl('[aria-label="Analytics source module"]','All Modules')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Custom').click()`)
  await setControl('[aria-label="Analytics end date"]','2026-10-05')
  assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),5,'Medium custom ranges use weekly intervals')
  assert.ok(await evaluate('document.querySelector(".analytics-data table tbody tr:last-child").textContent.includes("Oct 5, 2026")'))
  await setControl('[aria-label="Analytics start date"]','2026-09-15')
  await setControl('[aria-label="Analytics end date"]','2027-04-03')
  assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),8)
  assert.ok(await evaluate('document.querySelector(".analytics-data table tbody tr").textContent.includes("partial month")'))
  await setControl('[aria-label="Analytics start date"]','2025-01-01')
  await setControl('[aria-label="Analytics end date"]','2025-01-31')
  assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".summary strong"),node=>node.textContent)'),['0','0','0','0'])
  assert.equal(await evaluate('document.querySelectorAll(".analytics-empty").length'),4)
  assert.equal(await evaluate('document.querySelector(".analytics-data table").querySelectorAll("tbody tr").length'),31)
  await setControl('[aria-label="Analytics start date"]','2025-02-01')
  assert.ok(await evaluate('!!document.querySelector(".analytics-range-error[role=alert]")'))
  assert.equal(await evaluate('document.querySelectorAll(".summary").length'),0,'Invalid ranges do not masquerade as zero activity')
  await setControl('[aria-label="Analytics end date"]','')
  assert.ok(await evaluate('!!document.querySelector(".analytics-range-error")'))
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Reset Filters').click()`)
  assert.equal(await evaluate('document.querySelector(".summary strong").textContent'),'245')
  await evaluate('document.querySelector(".analytics-data summary").click()')
  await evaluate(`document.querySelector('a[href="/reports"]').click()`)
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Security Reports"'))break;await pause(100)}
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Preview Report').click()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("19 admitted visitor entries")'))
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("6 unique incidents")'))
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='PDF Export (Demo)').click()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("No PDF was generated")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Details').click()`)
  await evaluate(`Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='Request Regeneration').click()`)
  await evaluate(`(()=>{const f=document.querySelector('dialog form');f.querySelector('textarea').value='Correct fictional source data';f.requestSubmit()})()`)
  assert.ok(await evaluate('document.querySelector("dialog").textContent.includes("No PDF was generated")'))
  await evaluate('document.querySelector("dialog footer button").click()')
  await openPage({url:new URL('/dashboard',baseUrl).href})
  for(let i=0;i<50;i++){if(await evaluate('document.querySelector("h1")?.textContent === "Security Dashboard"'))break;await pause(100)}
  await evaluate('document.querySelector(".sidebar-footer button").click()')
  assert.equal(await evaluate('location.pathname'),'/login')
  assert.equal(await evaluate('!!document.querySelector(".sidebar")'),false)
  await ensureHead('/dashboard')
  const spa=async path=>{
    await evaluate(`history.pushState({},'',${JSON.stringify(path)});dispatchEvent(new PopStateEvent('popstate'))`)
    await pause(100)
  }
  const waitFor=async(expression,message)=>{
    for(let i=0;i<60;i++){if(await evaluate(expression))return;await pause(25)}
    assert.fail(message)
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false})
  await evaluate('document.querySelector(".sidebar-toggle").click()')
  await waitFor('Math.round(document.querySelector(".sidebar").getBoundingClientRect().width)===72','Desktop sidebar collapses to an icon rail')
  assert.equal(await evaluate('document.querySelector(".sidebar-toggle").getAttribute("aria-expanded")'),'false')
  assert.ok(await evaluate('Array.from(document.querySelectorAll(".sidebar nav button")).every(button=>button.getAttribute("aria-label"))'))
  await evaluate('document.querySelector(".sidebar-toggle").click()')
  await waitFor('Math.round(document.querySelector(".sidebar").getBoundingClientRect().width)===256','Desktop sidebar expands')
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await waitFor('document.querySelector(".sidebar").inert','Mobile navigation becomes available')
  await evaluate('document.querySelector(".menu-button").click()')
  assert.equal(await evaluate('document.querySelector(".sidebar").getAttribute("aria-modal")'),'true')
  assert.ok(await evaluate('document.querySelector(".workspace").inert&&document.body.style.overflow==="hidden"'))
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  assert.ok(await evaluate('document.activeElement===document.querySelector(".sidebar-footer button")'),'Shift+Tab wraps inside the drawer')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await waitFor('!document.querySelector(".sidebar").classList.contains("open")','Escape dismisses navigation')
  assert.ok(await evaluate('document.activeElement===document.querySelector(".menu-button")&&!document.querySelector(".workspace").inert'))
  assert.equal(await evaluate('document.body.style.overflow'),'')
  await spa('/incidents')
  await evaluate('document.querySelector(".page-heading button").focus();document.querySelector(".page-heading button").click()')
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await waitFor('!document.querySelector("dialog")','Animated Escape dismissal completes')
  assert.ok(await evaluate('document.activeElement===document.querySelector(".page-heading button")'),'Dialog restores its opener focus')
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await evaluate('document.querySelector(".page-heading button").click()')
  assert.equal(await evaluate('getComputedStyle(document.querySelector("dialog")).animationDuration'),'0s')
  await evaluate('document.querySelector("dialog footer button").click()')
  assert.equal(await evaluate('!!document.querySelector("dialog")'),false,'Reduced motion dismissal has no animation delay')
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  await spa('/analytics')
  await waitFor('!!document.querySelector(".analytics-chart")','Analytics charts load')
  await evaluate('window.motionChart=document.querySelector(".analytics-chart");Promise.all(window.motionChart.getAnimations().map(a=>a.finished))')
  assert.equal(await evaluate('getComputedStyle(window.motionChart).animationDuration'),'0.25s')
  await setControl('[aria-label="Analytics source module"]','Gate & Access')
  assert.ok(await evaluate('window.motionChart===document.querySelector(".analytics-chart")&&window.motionChart.getAnimations().every(a=>a.playState==="finished")'),'Changing filters does not replay chart reveal')
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  assert.equal(await evaluate('getComputedStyle(window.motionChart).animationDuration'),'0s')
  await spa('/dashboard')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".dashboard-kpi")).animationDuration'),'0s')
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  await evaluate('window.motionCard=document.querySelector(".dashboard-kpi");Promise.all(window.motionCard.getAnimations().map(a=>a.finished))')
  assert.equal(await evaluate('getComputedStyle(window.motionCard).animationDuration'),'0.25s')
  await evaluate('document.querySelector(".dashboard-logbook-controls button:last-child").click()')
  assert.ok(await evaluate('window.motionCard===document.querySelector(".dashboard-kpi")&&window.motionCard.getAnimations().every(a=>a.playState==="finished")'),'Dashboard updates do not replay card entrances')
  for(const width of [1920,1440,1280,1100,1024,768,390,320]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false})
    await pause(100)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`No overflow at ${width}`)
    assert.ok(await evaluate('Array.from(document.querySelectorAll(".dashboard-page a,.dashboard-page button")).every(node=>node.getBoundingClientRect().height>=44)'),`Dashboard touch targets at ${width}`)
    if(width===390){
      await evaluate('document.querySelector(".menu-button").click()')
      assert.ok(await evaluate('document.querySelector(".sidebar").classList.contains("open")'))
      await evaluate('document.querySelector(".scrim").click()')
      assert.equal(await evaluate('document.querySelector(".sidebar").classList.contains("open")'),false)
    }
    const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    await writeFile(`.verification/dashboard-${width}.png`,Buffer.from(screenshot.data,'base64'))
    if(width===1920||width===390||width===320){
      await evaluate('document.querySelector(".dashboard-logbook").scrollIntoView({block:"start"})')
      const recentCapture=await command('Page.captureScreenshot',{format:'png'})
      await writeFile(`.verification/dashboard-logbook-${width}.png`,Buffer.from(recentCapture.data,'base64'))
      await evaluate('scrollTo(0,0)')
    }
  }
  assert.equal(exceptions.length,0,'No browser runtime exceptions')
  for(const [path,title] of [['visitors','Gate & Visitor Management'],['lost-found','Lost & Found'],['personnel','Security Personnel'],['personnel/duty-schedule/selected-shift','Security Personnel'],['personnel/campus-posts','Security Personnel'],['personnel/activity-history','Security Personnel'],['incidents','Incidents'],['analytics','Security Analytics'],['reports','Security Reports'],['accounts','Guard Accounts'],['help','Help & Guide']]){
    await openPage({url:new URL(`/${path}`,baseUrl).href})
    for(let i=0;i<50;i++){if(await evaluate(`document.querySelector('h1')?.textContent === ${JSON.stringify(title)}`))break;await pause(100)}
    if(path==='analytics')await evaluate('document.querySelector(".analytics-data summary").click()')
    for(const width of path==='analytics'?[1920,1440,1280,1024,768,390,320]:[1920,1440,1280,1024,768,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1080,deviceScaleFactor:1,mobile:false})
      await pause(120)
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),`No overflow: ${path} at ${width}`)
      assert.equal(await evaluate('(()=>{const selected=document.querySelector(".tabs>a.primary,.segments button.primary,.record-quick-filters button[aria-pressed=true],.help-task[aria-current=true]");return selected?getComputedStyle(selected).backgroundColor:null})()'),path==='accounts'?null:'rgb(234, 242, 251)','Shared selected-control color on '+path)

      if(path==='personnel/duty-schedule/selected-shift')assert.ok(await evaluate('(()=>{const table=document.querySelector(".duty-roster .table-scroll");return table.scrollWidth<=table.clientWidth})()'),'Duty roster fits its panel at '+width)
      if(width===1920||width===1440||width===390){const capture=await command('Page.captureScreenshot',{format:'png'});await writeFile(`.verification/${path.replaceAll('/','-')}-${width}.png`,Buffer.from(capture.data,'base64'))}
      if(path==='analytics'&&(width===1920||width===390)){
        for(const [selector,name] of [['.analytics-grid','charts'],['.analytics-card:nth-child(3)','secondary-charts'],['.analytics-data','tables']]){
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`)
          const capture=await command('Page.captureScreenshot',{format:'png'})
          await writeFile(`.verification/analytics-${name}-${width}.png`,Buffer.from(capture.data,'base64'))
        }
        await evaluate('scrollTo(0,0)')
      }
    }
  }
  await openPage({url:new URL('/personnel/duty-schedule?date=2026-09-02',baseUrl).href})
  await waitForLost('location.pathname==="/personnel/duty-schedule/selected-shift"')
  assert.equal(await evaluate('location.search'),'?date=2026-09-02')
  const personnelAction=(label,scope='main')=>evaluate(`(()=>{
    const button=Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(b=>b.textContent===${JSON.stringify(label)})
    button.focus();button.click()
  })()`)
  const topPersonnelDialog='dialog[open]:last-of-type'
  const personnelClose=()=>evaluate(`document.querySelector('${topPersonnelDialog} footer button').click()`)
  const personnelRow=id=>evaluate(`(()=>{const button=document.querySelector(${JSON.stringify('.directory-table [data-record-id="'+id+'"] .directory-name')});button.focus();button.click()})()`)
  const scheduleSlot=date=>spa('/personnel/duty-schedule/selected-shift?date='+date)
  const publishPersonnelSlot=async()=>{
    await personnelAction('Check Schedule')
    await personnelClose()
    await personnelAction('Publish Schedule')
    await personnelAction('Publish Roster',topPersonnelDialog)
    assert.ok(await evaluate('document.querySelector(".schedule-selection").textContent.includes("Published")'))
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false})
  await publishPersonnelSlot()
  await spa('/personnel')
  await evaluate('document.querySelector(".page-heading button").click()')
  await setControl('dialog [name=name]','  CARLOS  Ignacio Santos ')
  assert.ok(await evaluate('document.querySelector("#personnel-name-warning").textContent.includes("SEC-001")'))
  await setControl('dialog [name=designation]','LSPO')
  await setControl('dialog [name=organizationalResponsibility]','Agency Area Supervisor')
  await personnelAction('Save Personnel',topPersonnelDialog)
  assert.ok(await evaluate('document.querySelector("[data-record-id=SEC-009]").textContent.includes("LSPO")'))
  await setControl('select[aria-label="Personnel designation"]','LSPO')
  assert.equal(await evaluate('new URLSearchParams(location.search).get("designation")'),'LSPO')
  assert.equal(await evaluate('document.querySelectorAll(".directory-table tbody [data-record-id]").length'),1)
  await personnelAction('Clear filters')
  await setControl('input[aria-label="Search ID, name or position..."]','agency area supervisor')
  assert.equal(await evaluate('document.querySelector(".directory-table tbody [data-record-id]").dataset.recordId'),'SEC-009')
  await setControl('input[aria-label="Search ID, name or position..."]','LSPO')
  assert.equal(await evaluate('document.querySelector(".directory-table tbody [data-record-id]").dataset.recordId'),'SEC-009')
  await personnelAction('Clear filters')
  await personnelRow('SEC-001')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-facts").textContent.includes("Not specified")'))
  await personnelAction('Edit Profile',topPersonnelDialog)
  assert.equal(await evaluate('!!document.querySelector("dialog input[readonly][value=SEC-001]")'),true)
  await setControl('dialog [name=name]',' RAMON Dante  Mendoza ')
  assert.ok(await evaluate('document.querySelector("#personnel-name-warning").textContent.includes("SEC-002")'))
  await setControl('dialog [name=name]','Carlos Ignacio Santos')
  assert.ok(await evaluate('!document.querySelector("#personnel-name-warning").textContent.includes("SEC-001")'))
  await setControl('dialog [name=name]','Discarded personnel draft')
  const escapePersonnel=async()=>{for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27})}
  const backdropPersonnel=async()=>{for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:1,y:1,button:'left',clickCount:1})}
  for(const dismiss of [personnelClose,escapePersonnel,backdropPersonnel,()=>evaluate('document.querySelector("dialog .dialog-heading button").click()')]){
    await dismiss()
    await waitForLost('document.querySelectorAll("dialog[open]").length===2')
    assert.equal(await evaluate('document.activeElement.textContent'),'Keep editing')
    await personnelAction('Keep editing',topPersonnelDialog)
    assert.equal(await evaluate('document.querySelector("dialog [name=name]").value'),'Discarded personnel draft')
  }
  await personnelClose()
  await personnelAction('Discard changes',topPersonnelDialog)
  await waitForLost('document.activeElement.textContent==="Edit Profile"')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-identity").textContent.includes("Carlos Ignacio Santos")'))
  await personnelAction('Edit Profile',topPersonnelDialog)
  await personnelClose()
  assert.equal(await evaluate('document.querySelector("dialog h2").textContent'),'Personnel Profile')
  await personnelAction('Edit Profile',topPersonnelDialog)
  await personnelAction('Save Changes',topPersonnelDialog)
  for(const [field,value] of [['name','Carlos Santos'],['contact','0917 555 4567'],['position','Security Guard'],['designation','SPO'],['organizationalResponsibility','Detachment Commander']]){
    assert.ok(await evaluate('!!document.querySelector("dialog")'))
    if(field==='name')await personnelAction('Edit Profile',topPersonnelDialog)
    await setControl('dialog [name='+field+']',value)
  }
  for(const width of [375,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:760,deviceScaleFactor:1,mobile:width<640})
    assert.ok(await evaluate('(()=>{const d=document.querySelector("dialog"),b=d.querySelector("button[type=submit]");b.scrollIntoView({block:"nearest"});return document.documentElement.scrollWidth<=innerWidth&&d.scrollWidth<=d.clientWidth&&b.getBoundingClientRect().bottom<=innerHeight})()'),'Profile editor fits '+width)
    assert.ok(await evaluate('(()=>{const table=document.querySelector(".personnel-directory .table-scroll");return table.scrollWidth<=table.clientWidth})()'),'Directory has no horizontal scrolling at '+width)
  }
  await evaluate('document.querySelector("dialog form").requestSubmit();document.querySelector("dialog form").requestSubmit()')
  assert.ok(await evaluate('["Carlos Santos","0917 555 4567","Security Guard","SPO","Detachment Commander","SEC-001"].every(value=>document.querySelector(".personnel-profile-facts").textContent.includes(value))'))
  assert.ok(await evaluate('document.querySelector("[data-record-id=SEC-001]").textContent.includes("Carlos Santos")'))
  await personnelClose()
  await scheduleSlot('2026-09-02')
  await personnelAction('Check Schedule')
  await personnelClose()
  assert.ok(await evaluate('document.querySelector(".schedule-selection").textContent.includes("Published")'),'Registration and metadata edit preserve unrelated publication')
  await scheduleSlot('2026-10-19')
  await publishPersonnelSlot()
  await spa('/personnel?date=2026-10-19&search=SEC-001')
  await personnelRow('SEC-001')
  await evaluate(`(()=>{
    window.personnelRealDate=Date
    window.Date=new Proxy(Date,{construct:(target,args)=>new target(...(args.length?args:['2026-10-18T23:00:00Z']))})
  })()`)
  await personnelAction('Deactivate Personnel',topPersonnelDialog)
  assert.ok(await evaluate(`document.querySelector('${topPersonnelDialog}').textContent.includes('UNC Arch / Entrance')`))
  await personnelClose()
  assert.ok(await evaluate('document.querySelector(".personnel-profile-identity").textContent.includes("Active")'))
  await personnelAction('Deactivate Personnel',topPersonnelDialog)
  await personnelAction('Confirm Deactivation',topPersonnelDialog)
  await evaluate('window.Date=window.personnelRealDate;delete window.personnelRealDate')
  assert.ok(await evaluate('document.querySelector(".personnel-profile-facts").textContent.includes("Enabled")&&document.querySelector(".personnel-profile-facts").textContent.includes("Unavailable · inactive personnel")'))
  await personnelAction('Assignments',topPersonnelDialog)
  assert.ok(await evaluate('document.querySelector(".personnel-assignment-line").textContent.includes("UNC Arch / Entrance")'))
  await personnelClose()
  await scheduleSlot('2026-10-19')
  await personnelAction('Check Schedule')
  await personnelClose()
  assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Publish Schedule").disabled'),true)
  await personnelAction('Edit Group','.duty-roster')
  await evaluate('document.querySelector("dialog input[type=checkbox]:checked").click()')
  assert.ok(await evaluate('document.querySelector("dialog .checks label:first-child input").disabled'),'Removed inactive member cannot be reselected')
  await personnelClose()
  await spa('/personnel?date=2026-10-19&search=SEC-001')
  await personnelRow('SEC-001')
  await personnelAction('Reactivate Personnel',topPersonnelDialog)
  await personnelAction('Confirm Reactivation',topPersonnelDialog)
  await personnelClose()
  await scheduleSlot('2026-10-19')
  assert.equal(await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Publish Schedule").disabled'),true,'Reactivation does not restore an old check')
  await personnelAction('Check Schedule')
  await personnelClose()
  assert.ok(await evaluate('document.querySelector(".schedule-selection").textContent.includes("Checked")&&!document.querySelector(".schedule-selection").textContent.includes("Published")'))
  await spa('/personnel/activity-history')
  await setControl('select[aria-label="Activity category"]','Personnel changes')
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".activity-history-table tbody tr")).filter(row=>row.textContent.includes("Personnel profile updated")).length'),1)
  assert.ok(await evaluate('["Personnel registered","Personnel deactivated","Personnel reactivated"].every(event=>document.querySelector(".activity-history-table").textContent.includes(event))'))
  console.log('PASS: personnel registration and editing, duplicate warnings, directory search and filters, draft and status confirmation, roster checks, history, and responsive focus.')
  await spa('/personnel/duty-schedule')
  assert.ok(await evaluate('document.querySelector(".weekly-records").textContent.includes("No weekly schedules yet")'))
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".personnel-tabs a")].map(link=>link.textContent)'),['Personnel','Duty Schedule','Campus Posts','Activity History'])
  assert.ok(await evaluate('!document.querySelector(".map-slot, .duty-roster, .summaries")'))
  const weeklyLink=label=>evaluate(`[...document.querySelectorAll(".weekly-duty a")].find(link=>link.textContent===${JSON.stringify(label)}).click()`)
  const weeklyCapture=async name=>writeFile(`.verification/weekly-${name}.png`,Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'))
  for(const width of [375,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<640})
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Weekly records fit '+width)
    await weeklyCapture('records-'+width)
  }
  await weeklyLink('Daily Assignments')
  await waitForLost('!!document.querySelector(".duty-roster")')
  assert.equal(await evaluate('location.pathname'),'/personnel/duty-schedule/selected-shift')
  await spa('/personnel/duty-schedule')
  await weeklyLink('Create Schedule')
  await waitForLost('!!document.querySelector(".weekly-workspace")')
  assert.equal(await evaluate('document.activeElement.tagName'),'H1')
  assert.equal(await evaluate('document.querySelector(".personnel-tabs [aria-current=page]").textContent'),'Duty Schedule')
  const period=upcomingDutyPeriod(campusDateTime().date)
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".weekly-coverage input")].map(input=>input.value)'),[period.start,period.end])
  const duties=await evaluate('[...document.querySelectorAll(".weekly-duty-table tbody tr")].map(row=>[Number(row.dataset.dutyNumber),row.querySelector("th span").textContent,row.closest(".weekly-shift").querySelector("h4").textContent,row.closest("[data-duty-group]").dataset.dutyGroup])')
  assert.deepEqual(duties,weeklyDutyGroups.flatMap(group=>group.slots.map(number=>{
    const duty=weeklyDuties[number-1]
    return [number,dutyResponsibility(duty),duty.shift+' Shift',group.id]
  })))
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-repeat=true]")].map(row=>Number(row.dataset.dutyNumber))'),[4,7,16])
  assert.equal(await evaluate('document.querySelectorAll(".weekly-duty-hours small").length'),4)
  assert.ok(await evaluate(`document.querySelector('[data-duty-number="10"] th small').textContent.includes('SIC · Ground')`))
  assert.ok(await evaluate('!["Check Schedule","Copy Previous Schedule","Clear Assignments"].some(label=>[...document.querySelectorAll(".weekly-duty button")].some(button=>button.textContent===label))'))
  await setControl('.weekly-coverage .field:first-child input','2026-08-12')
  await setControl('.weekly-coverage .field:last-child input','2026-08-16')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".weekly-coverage input")].map(input=>input.value)'),['2026-08-12','2026-08-16'])
  const weeklyKey=async (key,code)=>{
    for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{
      type,key,code:key,windowsVirtualKeyCode:code,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{}),
    })
  }
  const searchPersonnel='input[aria-label="Search personnel"]'
  const assignButton=number=>`document.querySelector('.weekly-assign-button[data-duty="${number}"]')`
  const personButton=id=>`document.querySelector('.weekly-personnel-list button[data-person-id="${id}"]')`
  const focusAssignment=number=>waitForLost(`document.activeElement===${assignButton(number)}`)
  const rosterFilter='select[aria-label="Filter duty assignments"]'
  const panelShown='!!document.querySelector("#weekly-personnel")'
  const drawerShown='!!document.querySelector("dialog.weekly-personnel-dialog[open]")'
  const countAssigned=()=>evaluate('document.querySelector(".weekly-progress progress").value')
  const weeklyToolbarAction=label=>personnelAction(label,'.weekly-toolbar')
  const groupsAction=label=>personnelAction(label,'.weekly-group-actions')
  await groupsAction('Collapse All')
  assert.equal(await evaluate('document.querySelectorAll("[data-duty-number]").length'),0)
  assert.equal(await evaluate('document.querySelectorAll(".weekly-group-heading button[aria-expanded=false]").length'),7)
  await groupsAction('Expand All')
  await waitForLost(panelShown)
  await setControl(searchPersonnel,'SEC-008')
  assert.ok(await evaluate('!document.querySelector(".weekly-personnel-list button")'),'Inactive personnel are excluded')
  await setControl(searchPersonnel,'SEC-001 SPO')
  assert.ok(await evaluate(personButton('SEC-001')+'.textContent.includes("SEC-001 · SPO")'))
  await evaluate(personButton('SEC-001')+'.focus()')
  await weeklyKey('Enter',13)
  await focusAssignment(1)
  assert.equal(await evaluate('document.querySelectorAll("[data-available=true]").length'),25)
  await personnelAction('Cancel assignment','.weekly-choice')
  await waitForLost('document.activeElement==='+personButton('SEC-001'))
  assert.equal(await countAssigned(),0)
  await weeklyKey('Enter',13)
  await focusAssignment(1)
  await weeklyKey('Enter',13)
  await focusAssignment(22)
  assert.equal(await countAssigned(),1)
  await evaluate(assignButton(2)+'.focus()')
  await weeklyKey('Enter',13)
  await waitForLost('document.activeElement.getAttribute("aria-label")==="Search personnel"')
  assert.equal(await evaluate('document.querySelector("[data-target=true]").dataset.dutyNumber'),'2')
  await personnelAction('Cancel assignment','[data-target=true]')
  await focusAssignment(2)
  assert.equal(await countAssigned(),1)
  await weeklyKey('Enter',13)
  await waitForLost('document.activeElement.getAttribute("aria-label")==="Search personnel"')
  await evaluate(personButton('SEC-001')+'.click()')
  await focusAssignment(3)
  assert.equal(await countAssigned(),2)
  assert.equal(await evaluate('document.querySelectorAll(".weekly-assigned-name").length'),2)
  assert.equal(await evaluate(personButton('SEC-001')+'.querySelectorAll(".weekly-person-duty").length'),2,'Both duties are retained')
  await evaluate(`document.querySelector('.weekly-remove-button[data-duty="1"]').click()`)
  await focusAssignment(1)
  assert.equal(await countAssigned(),1)
  assert.ok(await evaluate(`document.querySelector('[data-duty-number="2"] .weekly-assigned-name')!==null`),'Removal preserves the other duty')
  await weeklyToolbarAction('Undo')
  await waitForLost(`document.activeElement===document.querySelector('.weekly-remove-button[data-duty="1"]')`)
  assert.equal(await countAssigned(),2)
  await weeklyToolbarAction('Undo')
  await focusAssignment(2)
  assert.equal(await countAssigned(),1)
  assert.ok(await evaluate(`document.querySelector('[data-duty-number="1"] .weekly-assigned-name')!==null`))
  await evaluate('document.querySelector("#weekly-group-cctv").click()')
  await evaluate(assignButton(3)+'.click()')
  assert.ok(await evaluate('["Gate 1 Operations","RFID Entrance","6 AM–2 PM"].every(text=>document.querySelector(".weekly-target-note").textContent.includes(text))'))
  await evaluate(personButton('SEC-001')+'.click()')
  await focusAssignment(4)
  await evaluate(assignButton(4)+'.click()')
  await setControl(searchPersonnel,'SEC-002')
  assert.ok(await evaluate('document.querySelector(".weekly-target-note").textContent.includes("2 PM–10 PM")'))
  await evaluate(personButton('SEC-002')+'.click()')
  assert.deepEqual(await evaluate(`[3,4].map(number=>document.querySelector('[data-duty-number="'+number+'"] .weekly-assigned-name').textContent.split(' ')[0])`),['Carlos','Ramon'])
  await weeklyToolbarAction('Undo')
  await weeklyToolbarAction('Undo')
  await setControl(searchPersonnel,'SEC-001 SPO')
  await setControl(rosterFilter,'Unassigned duties')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-duty-table tbody tr").length'),22)
  await setControl(rosterFilter,'Night shift')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-duty-table tbody tr").length'),4)
  assert.equal(await evaluate('document.querySelectorAll(".weekly-operational-group").length'),4)
  await setControl(rosterFilter,'Day shift')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-duty-table tbody tr").length'),19)
  assert.equal(await evaluate('document.querySelector("#weekly-group-cctv").getAttribute("aria-expanded")'),'false')
  await setControl(rosterFilter,'All duties')
  await groupsAction('Expand All')
  await weeklyToolbarAction('Hide Personnel')
  assert.ok(await evaluate('!document.querySelector("#weekly-personnel")'))
  await weeklyToolbarAction('Show Personnel')
  await waitForLost(panelShown)
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(searchPersonnel)}).value`),'SEC-001 SPO')
  await setControl(searchPersonnel,'')
  await personnelAction('Assigned','.weekly-personnel-tools')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-personnel-list button").length'),1)
  await personnelAction('Unassigned','.weekly-personnel-tools')
  assert.ok(await evaluate('!'+personButton('SEC-001')))
  await personnelAction('All','.weekly-personnel-tools')
  assert.ok(await evaluate('document.querySelector(".weekly-personnel-list button").dataset.personId!=="SEC-001"'),'Unassigned personnel sort first')
  assert.ok(await evaluate(`(()=>{
    const list=document.querySelector(".weekly-personnel-list"),panel=document.querySelector("#weekly-personnel");
    list.scrollTop=list.scrollHeight;
    return list.scrollTop===0&&list.scrollHeight<=list.clientHeight+1&&getComputedStyle(panel).maxHeight==="none"
  })()`),'Personnel list on Create Schedule uses page scrolling')
  for(const width of [375,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:width<640})
    await waitForLost(width===1440?panelShown:'!'+panelShown)
    await evaluate('document.activeElement.blur();scrollTo(0,0)')
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll(".weekly-duty-table")].every(table=>table.scrollWidth<=table.clientWidth)'),'Weekly workspace fits '+width)
    await weeklyCapture('workspace-'+width)
    assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-repeat=true] .weekly-responsibility-label")).position==="absolute"'),width>375,'Repeated responsibilities adapt to the viewport')
    await evaluate('document.querySelector("#weekly-group-gate-1").scrollIntoView({block:"center"})')
    assert.ok(await evaluate('(()=>{const heading=document.querySelector("#weekly-group-gate-1").getBoundingClientRect();return scrollY>0&&heading.top>=0&&heading.bottom<=innerHeight})()'),'The page scrolls to the group heading')
    await weeklyCapture('gate-1-group-'+width)
    const assignedName=await evaluate('document.querySelector(".weekly-assigned-name").textContent')
    await setControl(rosterFilter,'Night shift')
    await personnelAction('Preview Schedule','.weekly-footer')
    await waitForLost('!!document.querySelector("dialog.weekly-preview[open]")')
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-preview-duty]")].map(row=>row.querySelector("th").textContent)'),weeklyDuties.map(row=>row.description))
    assert.equal(await evaluate(`document.querySelector('[data-preview-duty="1"] td:last-child').textContent`),assignedName)
    assert.equal(await evaluate(`document.querySelector('[data-preview-duty="2"] td:last-child').textContent`),'')
    assert.ok(await evaluate('["DRAFT","Weekly Duty Details","UNC-FM-SO-09","Aug 16"].every(text=>document.querySelector(".weekly-preview-sheet").textContent.includes(text))'))
    assert.ok(await evaluate('(()=>{const d=document.querySelector("dialog.weekly-preview");return d.scrollWidth<=d.clientWidth&&d.getBoundingClientRect().width<=innerWidth})()'),'Preview fits '+width)
    await weeklyCapture('schedule-preview-'+width)
    await personnelAction('Close','dialog.weekly-preview footer')
    await waitForLost('!document.querySelector("dialog.weekly-preview")')
    await waitForLost('document.activeElement.textContent==="Preview Schedule"')
    await setControl(rosterFilter,'All duties')
    assert.ok(await evaluate('(()=>{const list=document.querySelector(".weekly-duty-list");list.scrollTop=list.scrollHeight;return list.scrollTop===0&&list.scrollHeight<=list.clientHeight+1})()'),'Create roster uses page scrolling at '+width)
    if(width===375){
      await weeklyToolbarAction('Show Personnel')
      await waitForLost(drawerShown)
      await setControl(searchPersonnel,'SEC-002')
      await evaluate(personButton('SEC-002')+'.click()')
      await waitForLost('!'+drawerShown)
      await focusAssignment(22)
      assert.ok(await evaluate('!!document.querySelector("[data-available=true]")'))
      await weeklyCapture('assign-targets-'+width)
      await weeklyKey('Enter',13)
      await focusAssignment(2)
      assert.equal(await countAssigned(),2)
      await weeklyToolbarAction('Undo')
      await focusAssignment(22)
    }
    await evaluate(assignButton(25)+'.scrollIntoView({block:"center"})')
    assert.ok(await evaluate('[...document.querySelectorAll(".weekly-footer-actions :is(a,button)")].every(control=>control.getBoundingClientRect().bottom<=innerHeight)'),'Footer actions are accessible at '+width)
    assert.ok(await evaluate('[...document.querySelectorAll(".weekly-duty-table tbody th")].every(cell=>getComputedStyle(cell).position==="static")'),'Duty descriptions scroll with their rows at '+width)
    await evaluate(assignButton(25)+'.focus();'+assignButton(25)+'.click()')
    await waitForLost('document.activeElement.getAttribute("aria-label")==="Search personnel"')
    assert.ok(await evaluate('["Gate 2 Operations","Pedestrian Entrance","6 PM–6 AM","Ends next day"].every(text=>document.querySelector(".weekly-target-note").textContent.includes(text))'))
    if(width===1440){
      assert.ok(await evaluate(panelShown))
    }else{
      assert.ok(await evaluate(drawerShown))
      await weeklyCapture('personnel-drawer-'+width)
      await personnelAction('Cancel assignment','dialog.weekly-personnel-dialog')
      await waitForLost('!'+drawerShown)
      await focusAssignment(25)
      await weeklyKey('Enter',13)
      await waitForLost(drawerShown)
      await weeklyKey('Escape',27)
      await waitForLost('!'+drawerShown)
      await focusAssignment(25)
      await weeklyKey('Enter',13)
      await waitForLost(drawerShown)
    }
    await evaluate(personButton('SEC-002')+'.click()')
    if(width!==1440)await waitForLost('!'+drawerShown)
    await focusAssignment(12)
    assert.equal(await countAssigned(),2)
    assert.ok(await evaluate(`document.querySelector('[data-duty-number="25"] .weekly-assigned-name').textContent.includes('Mendoza')`))
    await weeklyToolbarAction('Undo')
    await focusAssignment(25)
    assert.equal(await countAssigned(),1)
  }
  await weeklyToolbarAction('Undo')
  await focusAssignment(1)
  assert.equal(await countAssigned(),0)
  assert.ok(await evaluate('document.querySelector(".weekly-toolbar button").disabled'))
  await weeklyLink('Cancel')
  await waitForLost('!!document.querySelector(".weekly-records")')
  assert.ok(await evaluate('document.querySelector(".weekly-records").textContent.includes("0 records")'))
  await weeklyLink('Create Schedule')
  await setControl('.weekly-coverage .field:last-child input','')
  await personnelAction('Preview Schedule','.weekly-footer')
  assert.ok(await evaluate('document.querySelector(".weekly-preview-coverage").textContent.includes("Coverage dates are incomplete")'))
  await personnelAction('Close','dialog.weekly-preview footer')
  const saveWeekly=()=>personnelAction('Save Draft','.weekly-footer')
  await saveWeekly()
  assert.ok(await evaluate('document.querySelector(".weekly-save-feedback[role=alert]").textContent.includes("Enter valid coverage dates")'))
  await setControl('.weekly-coverage .field:first-child input','2026-10-19')
  await setControl('.weekly-coverage .field:last-child input','2026-10-24')
  await evaluate(assignButton(1)+'.click()')
  await waitForLost('document.activeElement.getAttribute("aria-label")==="Search personnel"')
  await evaluate(personButton('SEC-002')+'.click()')
  await focusAssignment(22)
  await evaluate('(()=>{const save=document.querySelector(".weekly-save-button");save.click();save.click()})()')
  await waitForLost('!!document.querySelector(".weekly-record-row")')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-record-row").length'),1,'Repeated Save creates one draft')
  await weeklyLink('Open Draft')
  assert.equal(await countAssigned(),1)
  assert.ok(await evaluate('(()=>{const list=document.querySelector(".weekly-duty-list");return getComputedStyle(list).overflowY==="auto"&&list.scrollHeight>list.clientHeight})()'),'Reopened drafts retain the bounded roster')
  assert.ok(await evaluate('document.querySelector(".weekly-assigned-name").textContent.includes("Mendoza")'))
  await evaluate(`document.querySelector('.weekly-remove-button[data-duty="1"]').click()`)
  await focusAssignment(1)
  await evaluate(assignButton(2)+'.click()')
  await waitForLost('document.activeElement.getAttribute("aria-label")==="Search personnel"')
  await evaluate(personButton('SEC-002')+'.click()')
  await setControl('.weekly-coverage .field:last-child input','2026-10-25')
  await saveWeekly()
  assert.equal(await evaluate('document.querySelectorAll(".weekly-record-row").length'),1,'Editing updates the same draft')
  assert.ok(await evaluate('document.querySelector(".weekly-record-row").textContent.includes("Oct 25")'))
  await weeklyLink('Create Schedule')
  await setControl('.weekly-coverage .field:first-child input','2026-10-19')
  await setControl('.weekly-coverage .field:last-child input','2026-10-25')
  await saveWeekly()
  assert.ok(await evaluate('document.querySelector(".weekly-save-feedback a").textContent.includes("Open existing draft")'))
  await weeklyLink('Open existing draft')
  assert.equal(await countAssigned(),1)
  assert.ok(await evaluate(`!document.querySelector('[data-duty-number="1"] .weekly-assigned-name')&&document.querySelector('[data-duty-number="2"] .weekly-assigned-name').textContent.includes("Mendoza")`))
  const editUrl=await evaluate('location.href')
  await weeklyLink('Back to Duty Schedule')
  await weeklyLink('Create Schedule')
  await setControl('.weekly-coverage .field:first-child input','2026-10-25')
  await setControl('.weekly-coverage .field:last-child input','2026-10-31')
  assert.ok(await evaluate('document.querySelector(".weekly-save-feedback").textContent.includes("You can still save it")'))
  await saveWeekly()
  assert.equal(await evaluate('document.querySelectorAll(".weekly-record-row").length'),2)
  await weeklyLink('Daily Assignments')
  await waitForLost('!!document.querySelector(".duty-roster")')
  assert.ok(await evaluate('document.querySelector(".duty-roster").textContent.includes("6 guards")'),'Weekly drafts do not change daily guard groups')
  await openPage({url:editUrl})
  await waitForLost('!!document.querySelector(".weekly-records")')
  assert.equal(await evaluate('document.querySelectorAll(".weekly-record-row").length'),0)
  assert.ok(await evaluate('document.querySelector(".weekly-duty [role=status]").textContent.includes("draft is unavailable")'))
  console.log('PASS: deployment planner, fixed duties, flexible coverage, both assignment orders, Undo, personnel filtering and scrolling, keyboard focus, and phone/tablet/desktop layouts.')
  assert.equal(exceptions.length,0,'No runtime exceptions across modules')
  assert.deepEqual(failedScripts,[],'No failed JavaScript module requests')
  console.log('PASS: dashboard cards/alerts, source presets, URL filters and Back/Forward, recent logbooks and record dialogs, quick actions and missing records; synchronized operational totals; analytics and report workflows; sidebar collapse/expansion, drawer focus containment and Escape, animated modal dismissal and focus restoration, reduced motion, keyboard navigation and 44px dashboard targets; responsive layouts from 320px to 1920px.')
} finally {
  socket?.close()
  browser.kill()
}
