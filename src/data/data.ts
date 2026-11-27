export const TODAY = '2026-10-19'
export type VisitorAssignment = { post:string; date:string; start:string; end:string; personIds:string[] }
export type Visit = { id: string; name: string; identification: string; date: string; time: string; gate: string; purpose: string; vehicle: string; pass: string; status: string; outcome: string; profileId?:string; entryAt?:string; entryGuardId?:string; entryActorId?:string; entryAssignment?:VisitorAssignment; exitAt?:string; exitGate?:string; exitGuardId?:string; exitActorId?:string; exitAssignment?:VisitorAssignment; idDeposited?:boolean; idReturned?:boolean }
export type Incident = { id: string; type: string; date: string; time: string; location: string; personnel: string; reporter: string; status: string; reportStatus: string; people: string; description: string; observations: string; actions: string; evidence: string }
export type ItemAction = { actorId: string; actorName: string; at: string }
export type Item = { id: string; name: string; category: string; location: string; date: string; time: string; type: string; status: string; reporterType: string; reporter: string; contact: string; description: string; photo?: string; matchedId?: string; ownershipVerified?: boolean; claimant?: string; evidence?: string; recipient?: string; releaseLocation?: string; verification?: ItemAction & { idType: string }; release?: ItemAction; history?: string[] }
export const personnelDesignations = ['SP', 'SPO', 'LSP', 'LSPO'] as const
export const personnelResponsibilities = ['Detachment Commander', 'Agency Area Supervisor', 'Security Head'] as const
export type PersonnelDesignation = typeof personnelDesignations[number]
export type PersonnelResponsibility = typeof personnelResponsibilities[number]
export type Person = { id: string; name: string; position: string; status: string; contact: string; photo?: string; designation?: PersonnelDesignation; organizationalResponsibility?: PersonnelResponsibility }
export type Assignment = { id: string; personId: string; location: string; date: string; start: string; end: string }
export type Activity = { id: string; date: string; time?: string; event: string; detail: string; actor: string; actorId?: string; personId?: string }
export const locations = ['UNC Arch / Entrance', 'E-Library', 'JH Building', 'UNC Sports Palace']
export const names = ['Carlos Ignacio Santos','Ramon Dante Mendoza','Joshua Allen Reyes','Miguel Andres Flores','Patricia Lynn Aquino','Benedicto Cruz Navarro','Loreto James Villanueva','Elena Marie Castillo']
export const people: Person[] = names.map((name,i)=>({id:`SEC-00${i+1}`,name,position:i===0?'Senior Security Personnel':'Security Guard',status:i<6?'Active':'Inactive',contact:`0917 000 100${i}`}))
const visitorNames = ['Nestor Balboa','Bianca Restrepo','Alex Fontaine','Nena Dalisay','Carlo Devereux','Mara Alcantara','Luis Domingo','Ana Solano','Paolo Rivera','Rosa Salcedo','Nico Flores','Clara Ramos','Dante Cruz','Elisa Mercado','Jonas Silva','Lia Ventura','Marco Reyes','Celia Santos','Ramon Luna','Inez Vega']
function historicalVisitDate(index:number){const [first,last]=index<58?[1,7]:index<121?[8,14]:index<182?[15,21]:[22,30];return `2026-09-${String(first+index%(last-first+1)).padStart(2,'0')}`}
export const visits: Visit[] = Array.from({length:265},(_,i)=>({id:`VIS-${String(i+1).padStart(4,'0')}`,name:visitorNames[i%20],identification:i%3?'National ID':'UMID',date:i<20?TODAY:historicalVisitDate(i-20),time:`${String(8+i%9).padStart(2,'0')}:${i%2?'30':'00'}`,gate:i%3?'Gate 1 (Main)':'Gate 2 (Side)',purpose:['Consultation','Meeting','Parent Visit','Delivery'][i%4],vehicle:i<3?'Car':'No',pass:i===19?'None':'Valid',status:i===19?'—':i<2?'Inside':'Exited',outcome:i===19?'Denied':'Entered'}))
export const incidents: Incident[] = ['Disturbance','Protection-Related','Suspected Theft','Unauthorized Access','Parking-Related'].map((type,i)=>({id:`INC-2026-00${5-i}`,type,date:TODAY,time:`${10+i}:30`,location:['Campus Canteen','Admin Building','Library','Gate 2 (Side)','Parking Area B'][i],personnel:people[i].id,reporter:['Guard Mendoza','Jason Fernandez','Ker Hurino','Mike Wasaki','Guard Yuro'][i],status:i<2?'Open':i<4?'Being Monitored':'Resolved',reportStatus:['Submitted','Draft','Under Review','Forwarded','Submitted'][i],people:'Fictional campus visitor',description:'A fictional incident recorded for this frontend demonstration.',observations:'Staff reviewed the sample situation.',actions:'The area was checked by security personnel.',evidence:'Sample statement; no real evidence.'}))
const itemNames=['Student ID Card','Gray Foldable Umbrella','Blue PE Jacket','White Phone Charger','Scientific Calculator','Black Leather Wallet','Black Water Tumbler','Blue Backpack','Reading Glasses','Notebook']
export const items: Item[] = itemNames.map((name,i)=>({id:`LF-${String(i+1).padStart(3,'0')}`,name,category:['Wallets & IDs','Personal Items','Clothing','Electronics','School Supplies'][i%5],location:['Gate 1 (Main)','Gymnasium Lobby','Science Building','CCIT Hallway'][i%4],date:i===5||i===6?'2026-08-11':`2026-10-${String(19-i%5).padStart(2,'0')}`,time:'15:30',type:i<7?'Found':'Lost',status:i===2||i===4?'Returned':i===5||i===6?'Overdue':i===1||i===3||i===7||i===8?'Possible Match':'Unclaimed',reporterType:i%2?'Student':'Staff',reporter:visitorNames[i],contact:'0917 000 0000',description:`Sample ${name.toLowerCase()} with identifying details for review.`}))
export const assignments: Assignment[] = people.slice(0,6).map((p,i)=>({id:`A-${i}`,personId:p.id,location:locations[i<2?0:i<4?1:i-2],date:TODAY,start:'06:00',end:'14:00'}))
// Older source records populate the designed September analytics without
// inflating today's visitors, open cases, unreturned found items, or duty roster.
incidents.push(...Array.from({length:12},(_,i)=>({...incidents[i%5],id:`INC-2026-1${String(i).padStart(2,'0')}`,type:i<5?'Unauthorized Access':i<8?'Suspected Theft':i<11?'Bullying':'Disturbance',date:`2026-09-${String(i+1).padStart(2,'0')}`,status:'Resolved',reportStatus:'Submitted'})))
items.push(...Array.from({length:24},(_,i)=>({...items[i%10],id:`LF-H${String(i+1).padStart(3,'0')}`,date:`2026-09-${String(i+1).padStart(2,'0')}`,type:i<11?'Lost':'Found',status:i<11?'Reported Lost':'Returned'})))
assignments.push(...Array.from({length:15},(_,i)=>({id:`A-H${i}`,personId:people[i%6].id,location:locations[i<5?0:i<9?1:i<12?2:3],date:`2026-09-${String(i+1).padStart(2,'0')}`,start:'06:00',end:'14:00'})))
export function periodMatches(date:string,period:string,customStart=TODAY,customEnd=TODAY){
  if(period==='All')return true
  if(period==='Custom')return date>=customStart&&date<=customEnd
  if(period==='Month'||period==='Monthly')return date.startsWith(TODAY.slice(0,7))
  if(period==='Year'||period==='Yearly')return date.startsWith('2026')
  if(period==='Week'||period==='Weekly')return date>='2026-10-19'&&date<='2026-10-25'
  return date===TODAY
}
export function dateLabel(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
export function overlaps(rows:Assignment[]){return rows.some((a,i)=>rows.some((b,j)=>i!==j&&a.personId===b.personId&&a.date===b.date&&a.start<b.end&&b.start<a.end))}

