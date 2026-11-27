export const weeklyDutyGroups=[
  {id:'supervision',name:'Security Supervision',slots:[1,22]},
  {id:'gate-1',name:'Gate 1 Operations',slots:[2,3,4,5,6,7,8,21,24]},
  {id:'gate-2',name:'Gate 2 Operations',slots:[9,10,11,25]},
  {id:'roving',name:'Roving Operations',slots:[12,13,14,23]},
  {id:'cctv',name:'CCTV Operations',slots:[15,16]},
  {id:'bag-inspection',name:'Bag Inspection',slots:[19,20]},
  {id:'building-safety',name:'Building & Safety',slots:[17,18]},
] satisfies readonly {id:string;name:string;slots:readonly number[]}[]

const responsibilityBySlot:Partial<Record<number,string>>={
  2:'Pedestrian Entrance',3:'RFID Entrance',4:'RFID Entrance',5:'RFID Exit',
  6:'Vehicle Entrance',7:'Vehicle Entrance',8:'Vehicle Exit',9:'Pedestrian Entrance',
  10:'RFID/SIC Entrance',11:'RFID Entrance',12:'Area 2',13:'Area 3',14:'Area 4',
  21:'Vehicle Assist',23:'Sector 2',24:'Pedestrian Entrance',25:'Pedestrian Entrance',
}

export function dutyResponsibility(duty:{number:number;name:string}){
  return responsibilityBySlot[duty.number]??duty.name
}
