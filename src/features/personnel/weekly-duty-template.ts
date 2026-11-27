import type { PersonnelDesignation } from '../../data/data.ts'
import { shiftReportDate } from '../reporting/reporting.ts'

type FixedDuty = readonly [description:string,start:string,end:string,designation?:PersonnelDesignation]

// UNC-FM-SO-09, August 10–15, 2026. Keep wording and row order from the transcription.
const template:readonly FixedDuty[]=[
  ["OFFICER IN CHARGE (SPO)", "07:00", "19:00", "SPO"],
  ["Gate-1 Pedestrian Entrance checker (LSP)", "06:00", "18:00", "LSP"],
  ["Gate-1 Pedestrian Entrance checker/RFID ENTRANCE (SP)", "06:00", "14:00", "SP"],
  ["Gate-1 Pedestrian Entrance checker/RFID ENTRANCE (SP)", "14:00", "22:00", "SP"],
  ["Gate-1 Pedestrian EXIT checker/RFID EXIT (SP)", "07:00", "19:00", "SP"],
  ["Gate 1 Vehicle Entrance Checker (SP)", "06:00", "14:00", "SP"],
  ["Gate 1 Vehicle Entrance Checker (SP)", "14:00", "22:00", "SP"],
  ["Gate 1 Vehicle Exit checker (SP)", "07:00", "19:00", "SP"],
  ["Gate-2 Pedestrian Entrance checker (LSP)", "06:00", "18:00", "LSP"],
  ["Gate-2 Pedestrian Entrance checker/RFID/SIC (SP)(GROUND)", "06:00", "14:00", "SP"],
  ["Gate-2 Pedestrian Entrance checker/RFID/(SP)(GROUND)", "14:00", "22:00", "SP"],
  ["Area 2 Roving DHS and CHAPEL", "07:00", "19:00"],
  ["Area 3 Roving New BLDG, CC Pavilion and HS BLDG.", "07:00", "19:00"],
  ["Area 4 Roving SC, EN, Museum and Sport Palace", "07:00", "19:00"],
  ["CCTV Operator", "06:00", "14:00"],
  ["CCTV OPERATOR", "14:00", "22:00"],
  ["Health and Safety Marshall Cashier and Register", "08:00", "20:00"],
  ["E LIBRARY", "08:00", "20:00"],
  ["BAG CHECKER 1 / AMS BLDG in Charge", "06:00", "18:00"],
  ["BAG CHECKER 2 / Science BLDG in Charge", "06:00", "18:00"],
  ["Gate 1 Vehicle assist checker (SP)", "06:00", "18:00", "SP"],
  ["OFFICER IN CHARGE (SPO) AMS, JH BDLG AND SPORT PALACE", "19:00", "07:00", "SPO"],
  ["SECTOR 2 ROVING A2, A3, A4 CHAPEL, DHS, NEW BLDG, LIBRARY, HS, SC, EN, MUSEUM, PAV, CC", "19:00", "07:00"],
  ["Gate-1 Pedestrian Entrance checker (SP)", "18:00", "06:00", "SP"],
  ["Gate-2 Pedestrian Entrance checker (SP)", "18:00", "06:00", "SP"],
]

const display:readonly (readonly [name:string,details?:string])[]=[
  ['Officer in Charge'],
  ['Gate 1 — Pedestrian Entry'],
  ['Gate 1 — RFID Entry'],
  ['Gate 1 — RFID Entry'],
  ['Gate 1 — RFID Exit'],
  ['Gate 1 — Vehicle Entry'],
  ['Gate 1 — Vehicle Entry'],
  ['Gate 1 — Vehicle Exit'],
  ['Gate 2 — Pedestrian Entry'],
  ['Gate 2 — RFID Entry','SIC · Ground'],
  ['Gate 2 — RFID Entry','Ground'],
  ['Area 2 — Roving','DHS and Chapel'],
  ['Area 3 — Roving','New BLDG, CC Pavilion and HS BLDG'],
  ['Area 4 — Roving','SC, EN, Museum and Sport Palace'],
  ['CCTV Operator'],
  ['CCTV Operator'],
  ['Health & Safety Marshal','Cashier and Register'],
  ['E-Library'],
  ['Bag Checker 1','AMS BLDG in Charge'],
  ['Bag Checker 2','Science BLDG in Charge'],
  ['Gate 1 — Vehicle Assist'],
  ['Officer in Charge','AMS, JH BDLG and Sport Palace'],
  ['Sector 2 — Roving','A2, A3, A4, Chapel, DHS, New BLDG, Library, HS, SC, EN, Museum, PAV, CC'],
  ['Gate 1 — Pedestrian Entry'],
  ['Gate 2 — Pedestrian Entry'],
]

export const weeklyDuties=template.map(([description,start,end,designation],index)=>{
  const [name,details]=display[index]
  return {number:index+1,description,name,details,start,end,designation,shift:index<21?'Day':'Night'}
})

export function upcomingDutyPeriod(campusDate:string){
  const weekday=new Date(campusDate+'T00:00:00Z').getUTCDay()
  const start=shiftReportDate(campusDate,(8-weekday)%7)
  return {start,end:shiftReportDate(start,5)}
}
