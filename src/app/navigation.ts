import { LayoutDashboard, ChartNoAxesColumn, DoorOpen, ShieldAlert, PackageSearch, CalendarDays, BookOpen, UsersRound } from 'lucide-react'
export const overviewTabs=[{label:'Dashboard',to:'/dashboard'},{label:'Analytics',to:'/analytics'},{label:'Reports',to:'/reports'}]
export const dailyAssignmentsPath='/personnel/duty-schedule/selected-shift'
export const personnelAssignmentsPath='/personnel/assignments'
export const personnelTabs=[{label:'Personnel',to:'/personnel'},{label:'Duty Schedule',to:'/personnel/duty-schedule',end:false},{label:'Personnel Assignments',to:personnelAssignmentsPath},{label:'Activity History',to:'/personnel/activity-history'}]

export const appNavigation=[
  {title:'Overview',links:[{label:'Dashboard',to:'/dashboard',icon:LayoutDashboard},{label:'Reports & Analytics',to:'/analytics',icon:ChartNoAxesColumn}]},
  {title:'Operations',links:[{label:'Gate & Visitor',to:'/visitors',icon:DoorOpen},{label:'Incidents',to:'/incidents',icon:ShieldAlert},{label:'Lost & Found',to:'/lost-found',icon:PackageSearch},{label:'Personnel',to:'/personnel',icon:CalendarDays}]},
  {title:'System',links:[{label:'Guard Accounts',to:'/accounts',icon:UsersRound},{label:'Help & Guide',to:'/help',icon:BookOpen}]},
]
