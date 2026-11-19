import { useEffect, useState, type ReactNode } from 'react';
import { Clock3, Wrench } from 'lucide-react';
type Maintenance={active:boolean;portals:string[];message:string;startsAt:string;returnAt:string;backgroundUrl:string};
export function PortalMaintenanceGate({role,children}:{role:string;children:ReactNode}) {
 const [data,setData]=useState<Maintenance|null>(null);
 useEffect(()=>{let live=true;fetch('/api/maintenance-status',{cache:'no-store'}).then(async response=>{const result=await response.json() as Partial<Maintenance>;if(live&&response.ok&&result.active&&(result.portals||[]).includes(role))setData({active:true,portals:result.portals||[],message:result.message||'Navstar Digital Hub is undergoing scheduled maintenance.',startsAt:result.startsAt||'',returnAt:result.returnAt||'',backgroundUrl:result.backgroundUrl||''});else if(live)setData(null);}).catch(()=>{if(live)setData(null)});return()=>{live=false}},[role]);
 if(!data?.active)return <>{children}</>;
 return <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#061127] px-4 py-12 text-white">
  {data.backgroundUrl&&<div className="absolute inset-0 -z-20 bg-cover bg-center opacity-35" style={{backgroundImage:`url("${data.backgroundUrl}")`}}/>}
  <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#041126]/95 via-blue-950/90 to-[#071329]/95"/>
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[.07]"><img src="/Navstar_Official_Logo.jpg" alt="" className="w-[min(75vw,620px)] object-contain"/></div>
  <section className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/[.08] p-7 text-center shadow-2xl backdrop-blur-xl sm:p-10">
   <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub" className="mx-auto mb-7 h-20 w-40 object-contain"/>
   <p className="text-xs font-black uppercase tracking-[.28em] text-amber-300">HOME OF TECHNOCRATS</p>
   <div className="mx-auto mt-7 grid h-16 w-16 place-items-center rounded-2xl border border-cyan-200/30 bg-cyan-300/10"><Wrench className="h-8 w-8 text-cyan-200"/></div>
   <h1 className="mt-6 text-3xl font-black sm:text-4xl">Portal under maintenance</h1>
   <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-blue-100">{data.message}</p>
   <div className="mt-7 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left sm:grid-cols-2">
    <div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">Maintenance starts</p><p className="mt-1 font-bold">{data.startsAt} EAT</p></div>
    <div><p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200"><Clock3 className="h-3 w-3"/>Expected return</p><p className="mt-1 font-bold">{data.returnAt} EAT</p></div>
   </div>
   <p className="mt-6 text-xs text-slate-300">We are improving your {role} portal. Please return after the scheduled time.</p>
   <p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400">NAVSTAR DIGITAL HUB · navstardigitalhub.co.ke</p>
  </section>
 </main>;
}
