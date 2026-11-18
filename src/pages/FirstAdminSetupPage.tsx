import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

export function FirstAdminSetupPage() {
  const navigate = useNavigate();
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [staffId,setStaffId]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [setupKey,setSetupKey]=useState('');
  const [status,setStatus]=useState('');
  const [saving,setSaving]=useState(false);

  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault(); setSaving(true); setStatus('');
    try {
      const response=await fetch('/api/admin/bootstrap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+setupKey},body:JSON.stringify({name,email,staffId:staffId.trim().toUpperCase(),password,confirmPassword})});
      const result=await readApiResponse<{error?:string;message?:string;staffId?:string}>(response);
      if(!response.ok) throw new Error(result.error||'Admin setup could not be completed.');
      setStatus((result.message||'Admin account created.')+' Keep your staff ID safe: '+(result.staffId||'check with Navstar support')+'.');
      setSetupKey(''); setPassword(''); setConfirmPassword('');
    } catch(error) { setStatus(error instanceof Error?error.message:'Admin setup failed.'); }
    finally { setSaving(false); }
  };

  return <main className="flex min-h-screen items-center justify-center bg-[#061127] px-4 py-10">
    <section className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="bg-gradient-to-r from-[#071a38] via-blue-900 to-cyan-800 p-7 text-white sm:p-9"><div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-amber-300"/><div><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">HOME OF TECHNOCRATS</p><p className="text-sm">NAVSTAR DIGITAL HUB</p></div></div><h1 className="mt-6 text-3xl font-black">First Administrator setup</h1><p className="mt-2 text-sm leading-6 text-blue-100">Create the primary Admin account and assign its permanent staff ID.</p></header>
      <form onSubmit={submit} className="grid gap-4 p-6 sm:grid-cols-2 sm:p-9">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="first-admin-name">Full legal name</Label><Input id="first-admin-name" value={name} onChange={e=>setName(e.target.value)} required minLength={2}/></div>
        <div className="space-y-2"><Label htmlFor="first-admin-email">Admin email</Label><Input id="first-admin-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
        <div className="space-y-2"><Label htmlFor="first-admin-staff-id">Choose Admin staff ID (optional)</Label><Input id="first-admin-staff-id" value={staffId} onChange={e=>setStaffId(e.target.value.toUpperCase())} placeholder="AD12345" pattern="AD[0-9]{5}"/><p className="text-xs text-slate-500">Enter AD followed by five digits, or leave blank for automatic generation.</p></div>
        <div className="space-y-2"><Label htmlFor="first-admin-password">Password</Label><Input id="first-admin-password" type="password" autoComplete="new-password" minLength={14} value={password} onChange={e=>setPassword(e.target.value)} required/></div>
        <div className="space-y-2"><Label htmlFor="first-admin-confirm">Confirm password</Label><Input id="first-admin-confirm" type="password" autoComplete="new-password" minLength={14} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="first-admin-key">Private Admin setup key</Label><Input id="first-admin-key" type="password" autoComplete="off" value={setupKey} onChange={e=>setSetupKey(e.target.value)} required/><p className="text-xs text-slate-500">This is the server-side ADMIN_RESET_TOKEN. Do not share it in chat or save it in public files.</p></div>
        {status&&<p role="status" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950 sm:col-span-2">{status}</p>}
        <Button type="submit" disabled={saving||password!==confirmPassword} className="h-12 bg-blue-800 hover:bg-blue-900 sm:col-span-2"><KeyRound className="mr-2 h-4 w-4"/>{saving?'Creating Admin account…':'Create Admin account'}</Button>
        <Link to="/login?role=admin" className="text-center text-sm font-semibold text-blue-700 sm:col-span-2">Return to Admin Login</Link>
      </form>
    </section>
  </main>;
}
