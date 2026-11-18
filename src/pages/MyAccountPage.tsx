import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, LogOut, Save, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';
import { GeographyPicker } from '@/components/GeographyPicker';
import { ProfileDropdown, GENDER_OPTIONS, CITIZENSHIP_OPTIONS, DEPARTMENT_OPTIONS, JOB_TITLE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from '@/components/ProfileDropdown';

type Profile = {
  id: string; name: string; email: string; role: string; staffId?: string; profilePhotoUrl?: string | null; nationalId?: string | null;
  phone?: string | null; dateOfBirth?: string | null; gender?: string | null; citizenship?: string | null;
  country?: string | null; province?: string | null; county?: string | null; subCounty?: string | null;
  constituency?: string | null; ward?: string | null; location?: string | null; subLocation?: string | null;
  department?: string | null; jobTitle?: string | null; employmentType?: string | null; joinedOn?: string | null; address?: string | null;
};

const fields: { key: keyof Profile; label: string; type?: string }[] = [
  { key: 'name', label: 'Full legal name' }, { key: 'nationalId', label: 'National ID / identity reference' },
  { key: 'phone', label: 'Phone number', type: 'tel' }, { key: 'dateOfBirth', label: 'Date of birth', type: 'date' },
  { key: 'gender', label: 'Gender' }, { key: 'citizenship', label: 'Citizenship' }, { key: 'country', label: 'Country' },
  { key: 'province', label: 'Province / region' }, { key: 'county', label: 'County' }, { key: 'subCounty', label: 'Sub-county' },
  { key: 'constituency', label: 'Constituency' }, { key: 'ward', label: 'Ward' }, { key: 'location', label: 'Location' },
  { key: 'subLocation', label: 'Sub-location' }, { key: 'department', label: 'Department' },
  { key: 'jobTitle', label: 'Job title / designation' }, { key: 'employmentType', label: 'Employment type' },
  { key: 'joinedOn', label: 'Date joined', type: 'date' }, { key: 'address', label: 'Full physical / postal address' },
];

export function MyAccountPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [subLocationOptions, setSubLocationOptions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch('/api/account/profile').then(async response => {
      const result = await readApiResponse<{ profile?: Profile; geographyOptions?: { locations?: string[]; subLocations?: string[] }; error?: string }>(response);
      if (!response.ok || !result.profile) throw new Error(result.error || 'Your profile could not be loaded.');
      if (active) {
        setProfile(result.profile);
        setLocationOptions(result.geographyOptions?.locations || []);
        setSubLocationOptions(result.geographyOptions?.subLocations || []);
        const next: Record<string, string> = {};
        fields.forEach(field => { next[field.key] = String(result.profile?.[field.key] ?? ''); });
        setValues(next);
      }
    }).catch(error => { if (active) setStatus(error instanceof Error ? error.message : 'Profile could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true); setStatus('Uploading profile photo…');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/account/profile-photo', { method: 'POST', body: form });
      const result = await readApiResponse<{ profilePhotoUrl?: string; error?: string }>(response);
      if (!result.profilePhotoUrl) throw new Error(result.error || 'Profile photo was not saved.');
      setProfile(current => current ? { ...current, profilePhotoUrl: result.profilePhotoUrl } : current);
      setStatus('Your profile photo has been saved successfully.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Profile photo could not be saved.'); }
    finally { setPhotoUploading(false); event.target.value = ''; }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setStatus('');
    try {
      const response = await fetch('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await readApiResponse<{ profile?: Profile; error?: string }>(response);
      if (!response.ok || !result.profile) throw new Error(result.error || 'Profile could not be saved.');
      setProfile(result.profile);
      setStatus('Your profile details have been saved.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    navigate('/login', { replace: true });
  };

  return <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={profile?.role === 'admin' ? '/admin' : profile?.role ? `/portals/${profile.role}` : '/portals'} className="inline-flex items-center gap-2 text-sm font-bold text-blue-800"><ArrowLeft className="h-4 w-4"/>Back to workspace</Link>
        <div className="flex gap-2"><Link to="/portals/notifications" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700">Notifications</Link><Button type="button" variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4"/>Log out</Button></div>
      </div>
      <header className="mt-6 rounded-2xl bg-[#071a38] p-6 text-white sm:p-8">
        <div className="flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10">{profile?.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Your profile" className="h-full w-full object-cover"/> : <UserRound className="h-8 w-8 text-cyan-200"/>}</span><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">NAVSTAR DIGITAL HUB · MY ACCOUNT</p><h1 className="mt-1 text-2xl font-black">Personal profile</h1><p className="mt-1 text-sm text-slate-300">Maintain your personal, contact and work details.</p></div></div>
        {profile && <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/15 bg-white/5 p-3"><p className="text-xs text-slate-300">System-generated ID</p><p className="mt-1 text-lg font-black tracking-wide text-amber-300">{profile.staffId || 'Not assigned'}</p></div><div className="rounded-xl border border-white/15 bg-white/5 p-3"><p className="text-xs text-slate-300">Portal role</p><p className="mt-1 font-bold capitalize">{profile.role}</p></div><div className="rounded-xl border border-white/15 bg-white/5 p-3"><p className="text-xs text-slate-300">Login email</p><p className="mt-1 break-all font-semibold">{profile.email}</p></div></div>}
      </header>
      <section className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm"><div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-slate-100">{profile?.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Profile photo" className="h-full w-full object-cover"/> : <UserRound className="h-8 w-8 text-slate-400"/>}</div><div className="min-w-0 flex-1"><h2 className="font-bold text-slate-950">Profile picture</h2><p className="mt-1 text-xs text-slate-500">Upload a clear JPEG, PNG, WebP or AVIF photo (maximum 3 MB). Visible on your account and supported portal profile views.</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-800 px-3 py-2 text-xs font-bold text-white hover:bg-blue-900"><Camera className="h-4 w-4"/>{photoUploading ? "Uploading…" : "Choose profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" disabled={photoUploading} onChange={uploadPhoto}/></label></div></section>
      <form onSubmit={save} className="mt-6 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 text-emerald-700"/><div><h2 className="font-bold text-slate-950">Profile information</h2><p className="mt-1 text-sm text-slate-600">Your email, portal role and generated staff ID are managed by the system and cannot be changed here. Your National ID is visible only to authorized administrators and you.</p></div></div>
        {loading ? <p className="py-8 text-sm text-slate-500">Loading profile…</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.filter(field => !['gender','citizenship','department','jobTitle','employmentType','country','province','county','subCounty','constituency','ward','location','subLocation'].includes(field.key)).map(field => <div key={field.key} className="space-y-2"><Label htmlFor={`profile-${field.key}`}>{field.label}</Label><Input id={`profile-${field.key}`} type={field.type || 'text'} value={values[field.key] || ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} required={field.key === 'name'} /></div>)}
          <ProfileDropdown id="profile-gender" label="Gender" value={values.gender || ''} options={GENDER_OPTIONS} onChange={value=>setValues(current=>({...current,gender:value}))}/>
          <ProfileDropdown id="profile-citizenship" label="Citizenship" value={values.citizenship || ''} options={CITIZENSHIP_OPTIONS} onChange={value=>setValues(current=>({...current,citizenship:value}))}/>
          <ProfileDropdown id="profile-department" label="Department" value={values.department || ''} options={DEPARTMENT_OPTIONS} onChange={value=>setValues(current=>({...current,department:value}))}/>
          <ProfileDropdown id="profile-jobTitle" label="Job title" value={values.jobTitle || ''} options={JOB_TITLE_OPTIONS} onChange={value=>setValues(current=>({...current,jobTitle:value}))}/>
          <ProfileDropdown id="profile-employmentType" label="Employment type" value={values.employmentType || ''} options={EMPLOYMENT_TYPE_OPTIONS} onChange={value=>setValues(current=>({...current,employmentType:value}))}/>
          <div className="sm:col-span-2 lg:col-span-3"><GeographyPicker county={values.county || ''} subCounty={values.subCounty || ''} ward={values.ward || ''} location={values.location || ''} subLocation={values.subLocation || ''} locations={locationOptions} subLocations={subLocationOptions} onChange={geo => setValues(current => ({ ...current, country: 'Kenya', county: geo.county, subCounty: geo.subCounty, ward: geo.ward, province: '', constituency: geo.subCounty, location: geo.location, subLocation: geo.subLocation }))} /></div>
        </div>}
        {status && <p role="status" className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">{status}</p>}
        <div className="mt-6 flex flex-wrap justify-end"><Button type="submit" disabled={loading || saving}><Save className="mr-2 h-4 w-4"/>{saving ? 'Saving…' : 'Save profile'}</Button></div>
      </form>
      <footer className="py-6 text-center text-xs text-slate-500">Powered by Navstar Digital Hub · HOME OF TECHNOCRATS</footer>
    </div>
  </main>;
}
