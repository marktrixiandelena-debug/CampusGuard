import { useSearchParams } from 'react-router'
export function useSummaryHref(){const [params]=useSearchParams();return (path:string,filters:Record<string,string>={})=>{const next=new URLSearchParams(filters);if(params.get('from')==='dashboard')next.set('from','dashboard');return path+'?'+next}}
