import type { ReactNode } from 'react'
import './lost-found-documents.css'

// shortcut: sample fields and A4 sizing are provisional until the original UNC forms are verified.
type ReportFields = {
  referenceNumber: string
  reportedAt: string
  contact: string
  itemName: string
  itemDescription: string
  remarks: string
  receivingPersonnel: string
}

export type ReportedLostFields = ReportFields & {
  reporterName: string
  lostAt: string
  lastKnownLocation: string
}

export type ReportedFoundFields = ReportFields & {
  finderName: string
  foundAt: string
  foundLocation: string
  itemCondition: string
}

export type TurnoverFields = {
  referenceNumber: string
  itemReference: string
  itemName: string
  itemDescription: string
  recipientName: string
  recipientVerification: string
  turnoverAt: string
  releasingPersonnel: string
  remarks: string
}

function DocumentField({label,value}:{label:string;value?:string}){
  return <div className="lf-document-field"><dt>{label}</dt><dd>{value}</dd></div>
}

function DocumentSheet({title,referenceNumber,reportedAt,signatures,children}:{
  title:string
  referenceNumber?:string
  reportedAt?:string
  signatures:readonly [string,string]
  children:ReactNode
}){
  return <article className="lf-document-sheet" aria-label={title}>
    <header className="lf-document-heading">
      <p className="lf-document-university">University of Nueva Caceres</p>
      <p>Security Office</p>
      <h2>{title}</h2>
      <p className="lf-document-sample">SAMPLE TEMPLATE — SUBJECT TO REPLACEMENT</p>
    </header>
    <dl className="lf-document-fields">
      <div className="lf-document-reference">
        <DocumentField label="Reference No.:" value={referenceNumber}/>
        {reportedAt!==undefined&&<DocumentField label="Date and Time Reported" value={reportedAt}/>}
      </div>
      {children}
    </dl>
    <div className="lf-document-signatures" role="group" aria-label="Signature lines">
      {signatures.map(label=><p key={label}>{label}</p>)}
    </div>
  </article>
}

export function ReportedLostForm({fields={}}:{fields?:Partial<ReportedLostFields>}){
  return <DocumentSheet title="Reported Lost Form" referenceNumber={fields.referenceNumber}
    reportedAt={fields.reportedAt??''} signatures={['Reporter’s Signature','Receiving Personnel']}>
    <DocumentField label="Reporter’s Name" value={fields.reporterName}/>
    <DocumentField label="Contact Information" value={fields.contact}/>
    <DocumentField label="Item Name" value={fields.itemName}/>
    <DocumentField label="Item Description" value={fields.itemDescription}/>
    <DocumentField label="Date and Time Lost" value={fields.lostAt}/>
    <DocumentField label="Last Known Location" value={fields.lastKnownLocation}/>
    <DocumentField label="Additional Remarks" value={fields.remarks}/>
    <DocumentField label="Receiving Security Personnel" value={fields.receivingPersonnel}/>
  </DocumentSheet>
}

export function ReportedFoundForm({fields={}}:{fields?:Partial<ReportedFoundFields>}){
  return <DocumentSheet title="Reported Found Form" referenceNumber={fields.referenceNumber}
    reportedAt={fields.reportedAt??''} signatures={['Finder’s Signature','Receiving Personnel']}>
    <DocumentField label="Finder’s Name" value={fields.finderName}/>
    <DocumentField label="Contact Information" value={fields.contact}/>
    <DocumentField label="Item Name" value={fields.itemName}/>
    <DocumentField label="Item Description" value={fields.itemDescription}/>
    <DocumentField label="Date and Time Found" value={fields.foundAt}/>
    <DocumentField label="Location Found" value={fields.foundLocation}/>
    <DocumentField label="Item Condition" value={fields.itemCondition}/>
    <DocumentField label="Additional Remarks" value={fields.remarks}/>
    <DocumentField label="Receiving Security Personnel" value={fields.receivingPersonnel}/>
  </DocumentSheet>
}

export function TurnoverForm({fields={}}:{fields?:Partial<TurnoverFields>}){
  return <DocumentSheet title="Turn-over Form" referenceNumber={fields.referenceNumber}
    signatures={['Recipient’s Signature','Releasing Personnel’s Signature']}>
    <DocumentField label="Associated Item Reference" value={fields.itemReference}/>
    <DocumentField label="Item Name" value={fields.itemName}/>
    <DocumentField label="Item Description" value={fields.itemDescription}/>
    <DocumentField label="Recipient’s Name" value={fields.recipientName}/>
    <DocumentField label="Recipient Verification Details" value={fields.recipientVerification}/>
    <DocumentField label="Date and Time of Turn-over" value={fields.turnoverAt}/>
    <DocumentField label="Releasing Security Personnel" value={fields.releasingPersonnel}/>
    <DocumentField label="Additional Remarks" value={fields.remarks}/>
  </DocumentSheet>
}
