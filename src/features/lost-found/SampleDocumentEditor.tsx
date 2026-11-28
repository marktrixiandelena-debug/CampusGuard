import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Field, Modal, Segments } from '../../shared/ui/ui'
import { itemCategories, itemReporterTypes } from './item-intake'
import { ReportedFoundForm, ReportedLostForm, TurnoverForm } from './LostFoundDocumentTemplates'
import type { ReportedFoundFields, ReportedLostFields, TurnoverFields } from './LostFoundDocumentTemplates'
import './lost-found-document-editor.css'

type TemplateFields = { lost: ReportedLostFields; found: ReportedFoundFields; turnover: TurnoverFields }
export type SampleTemplate = keyof TemplateFields
type TemplateInput = {
  [K in SampleTemplate]: { template: K; initialValues?: Partial<TemplateFields[K]> }
}[SampleTemplate]
type InputField<Key extends string> = readonly [name: Key, label: string, input?: 'datetime-local' | 'tel' | 'multiline']
type FieldGroup<Key extends string> = readonly [legend: string, fields: readonly InputField<Key>[]]

const reportFields = [
  ['Report information', [['referenceNumber','Reference number'],['reportedAt','Date and time reported','datetime-local']]],
] satisfies readonly FieldGroup<keyof ReportedLostFields>[]
const remarks = ['Notes', [['remarks','Additional remarks','multiline']]] as const

const sampleTemplates = {
  lost: {title:'Reported Lost Form', Sheet:ReportedLostForm, groups:[
    ...reportFields,
    ['Item information', [
      ['itemName','Item name'],['itemDescription','Item description','multiline'],
      ['lostAt','Date and time lost','datetime-local'],['lastKnownLocation','Last known location'],
    ]],
    ['People', [['reporterName','Reporter’s name'],['contact','Contact information','tel'],['receivingPersonnel','Receiving security personnel']]],
    remarks,
  ]},
  found: {title:'Reported Found Form', Sheet:ReportedFoundForm, groups:[
    ...reportFields,
    ['Item information', [
      ['itemName','Item name'],['itemDescription','Item description','multiline'],
      ['foundAt','Date and time found','datetime-local'],['foundLocation','Location found'],['itemCondition','Item condition'],
    ]],
    ['People', [['finderName','Finder’s name'],['contact','Contact information','tel'],['receivingPersonnel','Receiving security personnel']]],
    remarks,
  ]},
  turnover: {title:'Turn-over Form', Sheet:TurnoverForm, groups:[
    ['Document information', [['referenceNumber','Reference number'],['itemReference','Associated item reference']]],
    ['Item information', [['itemName','Item name'],['itemDescription','Item description','multiline']]],
    ['Handover information', [
      ['recipientName','Recipient’s name'],['recipientVerification','Recipient verification details','multiline'],
      ['turnoverAt','Date and time of turn-over','datetime-local'],['releasingPersonnel','Releasing security personnel'],
    ]],
    remarks,
  ]},
} satisfies {
  [K in SampleTemplate]: {
    title: string
    Sheet: (props: { fields?: Partial<TemplateFields[K]> }) => React.JSX.Element
    groups: readonly FieldGroup<keyof TemplateFields[K] & string>[]
  }
}

type Zoom = 'page' | 'width' | number
type Confirmation = {title:string; confirmLabel:string; apply:()=>void}
const pageHeight = 297 * 96 / 25.4

// Values for date/time controls are Manila wall-clock strings in datetime-local format.
export function SampleDocumentEditor({template,initialValues,close,lockedFields=[],readOnly=false,onSave,intake,previewOnly=false,autoPrint=false}:TemplateInput&{
  close:()=>void
  lockedFields?:readonly string[]
  readOnly?:boolean
  onSave?:(values:Record<string,string>,intakeValues:Record<string,string>)=>boolean
  intake?:{campusToday:string; photo:ReactNode; photoLoading:boolean; hasPhoto:boolean; clearPhoto:()=>void}
  previewOnly?:boolean
  autoPrint?:boolean
}){
  const spec=sampleTemplates[template]
  const groups:readonly FieldGroup<string>[]=spec.groups
  const Sheet=spec.Sheet
  const formId=useId()
  const [baseline]=useState<Record<string,string>>(()=>({...initialValues}))
  const [values,setValues]=useState(baseline)
  const [intakeValues,setIntakeValues]=useState<Record<string,string>>({})
  const [invalidFields,setInvalidFields]=useState<string[]>([])
  const [view,setView]=useState(readOnly?'Preview':'Editor')
  const [expanded,setExpanded]=useState(false)
  const [zoom,setZoom]=useState<Zoom>('page')
  const [fit,setFit]=useState({page:1,width:1})
  const [confirmation,setConfirmation]=useState<Confirmation>()
  const [saveError,setSaveError]=useState(false)
  const saving=useRef(false)
  const form=useRef<HTMLFormElement>(null)
  const viewport=useRef<HTMLDivElement>(null)
  const paper=useRef<HTMLDivElement>(null)
  const expandButton=useRef<HTMLButtonElement>(null)
  const printed=useRef(false)
  const changed=groups.some(([,fields])=>fields.some(([name])=>(values[name]??'')!==(baseline[name]??'')))||
    invalidFields.length>0||Object.values(intakeValues).some(Boolean)||!!intake?.hasPhoto||!!intake?.photoLoading
  const factor=typeof zoom==='number'?zoom:fit[zoom]
  const requiredFields=intake?['itemName','itemDescription','reportedAt',...(template==='found'?['foundLocation']:['lastKnownLocation','reporterName'])]:[]

  useEffect(()=>{
    if(!autoPrint)return
    const frame=requestAnimationFrame(()=>{
      if(!printed.current){printed.current=true;window.print()}
    })
    return()=>cancelAnimationFrame(frame)
  },[autoPrint])

  useEffect(()=>{
    if(!changed)return
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
    window.addEventListener('beforeunload',warn)
    return()=>window.removeEventListener('beforeunload',warn)
  },[changed])

  useEffect(()=>{
    const container=viewport.current
    const sheet=paper.current
    if(!container||!sheet)return
    const observer=new ResizeObserver(()=>{
      if(!container.clientWidth||!sheet.offsetWidth)return
      const width=Math.min(2,container.clientWidth/sheet.offsetWidth)
      const page=Math.min(width,container.clientHeight/Math.min(pageHeight,sheet.offsetHeight))
      setFit(previous=>Math.abs(previous.width-width)<.001&&Math.abs(previous.page-page)<.001?previous:{width,page})
    })
    observer.observe(container)
    observer.observe(sheet)
    return()=>observer.disconnect()
  },[])

  function change(name:string,value:string,badInput:boolean){
    if(readOnly||lockedFields.includes(name))return
    setValues(previous=>({...previous,[name]:value}))
    setInvalidFields(previous=>badInput?[...new Set([...previous,name])]:previous.filter(field=>field!==name))
  }
  function discard(finish:()=>void){
    if(changed)setConfirmation({title:'Discard document changes?',confirmLabel:'Discard changes', apply:finish})
    else finish()
  }
  function reset(){
    setConfirmation({title:'Reset document fields?',confirmLabel:'Reset fields',apply:()=>{
      setValues(baseline)
      setIntakeValues({})
      intake?.clearPhoto()
      setInvalidFields([])
      form.current?.reset()
      requestAnimationFrame(()=>{
        const first=form.current?.querySelector('input')
        if(first?.getClientRects().length)first.focus()
        else viewport.current?.focus()
      })
    }})
  }
  function leaveExpanded(){
    setExpanded(false)
    requestAnimationFrame(()=>expandButton.current?.focus())
  }
  function focusInvalidField(){
    const field=invalidFields[0]
    if(!field)return false
    setView('Editor')
    setExpanded(false)
    requestAnimationFrame(()=>{
      const input=form.current?.elements.namedItem(field)
      if(input instanceof HTMLInputElement)input.focus()
    })
    return true
  }
  function save(){
    if(!onSave||saving.current||focusInvalidField())return
    if(intake&&!form.current?.checkValidity()){
      setExpanded(false)
      setView('Editor')
      requestAnimationFrame(()=>form.current?.reportValidity())
      return
    }
    saving.current=true
    if(onSave({...values},{...intakeValues}))close()
    else{
      setSaveError(true)
      saving.current=false
    }
  }

  const sheetValues=Object.fromEntries(groups.flatMap(([,fields])=>fields.map(([name,,type])=>[
    name,type==='datetime-local'?values[name]?.replace('T',' '):values[name],
  ])))
  return <>
    <Modal title={spec.title} subtitle={readOnly?'Saved sample document':'Prepare a sample document'} className="lf-document-editor"
      close={close} onDismissRequest={finish=>expanded?leaveExpanded():discard(finish)}>
      {dismiss=><>
        {template==='turnover'&&<p className="lf-editor-notice callout info">This sample is for document preparation. Use the item’s protected release workflow to record a handover.</p>}
        {!expanded&&<div className="lf-editor-view-switch">
          <Segments label="Document workspace view" options={['Editor','Preview']} value={view} change={setView}/>
        </div>}
        <div className="lf-editor-layout" data-view={view} data-expanded={expanded}>
          <form className="lf-editor-fields" ref={form} aria-labelledby={formId+'-information'} onSubmit={event=>event.preventDefault()}>
            <h3 id={formId+'-information'}>Document Information</h3>
            <p className="muted">{intake?'Fields marked * are required. Enter dates and times in Asia/Manila.':readOnly?'This snapshot shows the values saved with the document.':onSave?
              'Recorded item facts are read-only. Optional dates and times use Asia/Manila.':
              'All sample fields are optional. Enter dates and times in Asia/Manila.'}</p>
            {groups.map(([legend,fields])=><fieldset key={legend}>
              <legend>{legend}</legend>
              {fields.map(([name,label,type])=>{
                const invalid=invalidFields.includes(name)
                const errorId=formId+'-'+name
                const locked=readOnly||lockedFields.includes(name)
                const required=requiredFields.includes(name)
                return <Field label={required?label+' *':label} key={name}>
                  {type==='multiline'?<textarea name={name} rows={3} required={required} value={values[name]??''} readOnly={locked} onChange={e=>change(name,e.target.value,false)}/>:
                    <input name={name} type={type??'text'} value={values[name]??''} readOnly={locked} aria-invalid={invalid||undefined}
                      required={required} max={intake&&name==='reportedAt'?intake.campusToday+'T23:59':undefined}
                      pattern={required&&type!=='datetime-local'?'.*\\S.*':undefined}
                      aria-describedby={invalid?errorId:undefined}
                      onChange={e=>change(name,e.target.value,e.target.validity.badInput)}
                      onBlur={e=>change(name,e.target.value,e.target.validity.badInput)}/>}
                  {invalid&&<small id={errorId} className="error-text">Enter a complete date and time, or clear the field.</small>}
                </Field>
              })}
            </fieldset>)}
            {intake&&<fieldset><legend>Item record only</legend>
              <Field label="Category *"><select name="category" required value={intakeValues.category??''}
                onChange={e=>setIntakeValues({...intakeValues,category:e.target.value})}>
                <option value="">Select category</option>{itemCategories.map(category=><option key={category}>{category}</option>)}
              </select></Field>
              <Field label="Reported by *"><select name="reporterType" required value={intakeValues.reporterType??''}
                onChange={e=>setIntakeValues({...intakeValues,reporterType:e.target.value})}>
                <option value="">Select reporter type</option>{itemReporterTypes.map(type=><option key={type}>{type}</option>)}
              </select></Field>
              {template==='found'&&<>
                <Field label="Reporter name *"><input name="recordReporter" required pattern=".*\S.*" value={intakeValues.recordReporter??''}
                  onChange={e=>setIntakeValues({...intakeValues,recordReporter:e.target.value})}/></Field>
                <Field label="Reporter contact"><input name="recordContact" type="tel" value={intakeValues.recordContact??''}
                  onChange={e=>setIntakeValues({...intakeValues,recordContact:e.target.value})}/></Field>
              </>}
              {intake.photo}
            </fieldset>}
          </form>
          <section className="lf-editor-preview" aria-labelledby={formId+'-preview'}>
            <div className="lf-editor-preview-header">
              <h3 id={formId+'-preview'}>Document Preview</h3>
              <div className="lf-editor-zoom" role="group" aria-label="Preview controls">
                <button type="button" className="outline" aria-label="Zoom out" disabled={factor<=.25}
                  onClick={()=>setZoom(Math.max(.25,Math.round((factor-.1)*100)/100))}>−</button>
                <output aria-label="Preview zoom">{Math.round(factor*100)}%</output>
                <button type="button" className="outline" aria-label="Zoom in" disabled={factor>=2}
                  onClick={()=>setZoom(Math.min(2,Math.round((factor+.1)*100)/100))}>+</button>
                <button type="button" className="outline" aria-pressed={zoom==='page'} onClick={()=>setZoom('page')}>Fit to page</button>
                <button type="button" className="outline" aria-pressed={zoom==='width'} onClick={()=>setZoom('width')}>Fit to width</button>
                <button type="button" ref={expandButton} className="outline" aria-pressed={expanded}
                  onClick={()=>setExpanded(!expanded)}>{expanded?'Exit expanded preview':'Expand preview'}</button>
              </div>
            </div>
            <div className="lf-editor-viewport" ref={viewport} tabIndex={0} aria-label="Scrollable document preview">
              <div className="lf-editor-paper" ref={paper} style={{zoom:factor}}><Sheet fields={sheetValues}/></div>
            </div>
          </section>
        </div>
        {saveError&&<p className="error-text" role="alert">{intake?'Check the required item details and reporting date before saving.':'This form could not be saved. Check that the item record is still available.'}</p>}
        <footer className="lf-editor-footer">
          <button type="button" className="outline" onClick={()=>expanded?discard(close):dismiss()}>{readOnly?'Close':'Cancel'}</button>
          {!readOnly&&<button type="button" className="outline" disabled={!changed} onClick={reset}>Reset fields</button>}
          {onSave?<button type="button" className="primary" onClick={save} disabled={intake?.photoLoading}>{intake?'Save item and document':'Save document'}</button>:
            !previewOnly&&<button type="button" className="primary" onClick={()=>{if(!focusInvalidField())window.print()}}>Print / Save as PDF</button>}
        </footer>
      </>}
    </Modal>
    {confirmation&&<Modal title={confirmation.title} subtitle="Your changes to this sample form will be discarded."
      close={()=>setConfirmation(undefined)}>{dismiss=><footer>
      <button type="button" className="outline" onClick={dismiss}>Keep editing</button>
      <button type="button" className="danger" onClick={()=>{setConfirmation(undefined);confirmation.apply()}}>{confirmation.confirmLabel}</button>
    </footer>}</Modal>}
    {!onSave&&!previewOnly&&createPortal(<div className="lf-editor-print-root"><Sheet fields={sheetValues}/></div>,document.body)}
  </>
}

