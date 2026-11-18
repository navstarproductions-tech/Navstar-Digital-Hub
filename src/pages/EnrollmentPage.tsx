import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { INITIAL_COURSES } from '@/data/courses';
import type { Course } from '@/types';
import { GeographyPicker } from '@/components/GeographyPicker';

const steps = [
  { title: 'Personal profile', description: 'Your legal identity and personal details.' },
  { title: 'Contact information', description: 'How Navstar Admissions can reach you.' },
  { title: 'Identity document', description: 'Provide the document used for identity verification.' },
  { title: 'Course and education', description: 'Confirm the course and your learning background.' },
  { title: 'Location and address', description: 'Your county, sub-county, ward and local address.' },
  { title: 'Emergency and support', description: 'A trusted emergency contact and any learning support needs.' },
  { title: 'Declaration and verification', description: 'Review your details and verify your email and phone.' }
];

export function EnrollmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [registrationId, setRegistrationId] = useState('');
  const [registrationReference, setRegistrationReference] = useState('');
  const [installments, setInstallments] = useState<Array<{label:string;amount:number;dueDate:string}>>([]);
  const [geography, setGeography] = useState({ county: '', subCounty: '', ward: '', location: '', subLocation: '' });

  useEffect(() => {
    let active = true;
    const loadCourse = async () => {
      try {
        const response = await fetch('/api/courses');
        if (response.ok) {
          const result = await response.json() as { courses?: Course[] };
          const found = result.courses?.find(item => item.id === id);
          if (found) { if (active) setCourse(found); return; }
        }
      } catch { /* The server remains the authority when the applicant submits. */ }
      const bundled = INITIAL_COURSES.find(item => item.id === id);
      if (bundled && active) setCourse(bundled);
      else if (active) navigate('/courses', { replace: true });
    };
    void loadCourse();
    return () => { active = false; };
  }, [id, navigate]);

  const validateStep = () => {
    const panel = document.querySelector<HTMLElement>(`[data-wizard-step="${step}"]`);
    if (!panel) return false;
    const fields = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea'));
    for (const field of fields) {
      if (field.disabled || field.type === 'hidden') continue;
      if (!field.checkValidity()) { field.reportValidity(); return false; }
    }
    if (step === 4 && (!geography.county || !geography.subCounty || !geography.ward || !geography.location || !geography.subLocation)) {
      setStatus('Complete the county, sub-county, ward, location and sub-location selections before continuing.');
      return false;
    }
    setStatus('');
    return true;
  };

  const requestOtp = async (formData: FormData) => {
    const response = await fetch('/api/enrollments/otp/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(formData.get('email') || ''), phone: String(formData.get('phone') || '') })
    });
    const result = await response.json() as { sent?:boolean; message?:string; error?:string };
    if (!response.ok || !result.sent) throw new Error(result.error || 'Could not send your verification code.');
    setOtpOpen(true);
    setStatus(result.message || 'Verification code sent.');
  };

  const submitVerifiedApplication = async (token: string) => {
    const form = document.getElementById('navstar-application-form') as HTMLFormElement | null;
    if (!form || !course) return;
    const formData = new FormData(form);
    const phone = String(formData.get('phone') || '').replace(/[\s-]/g, '');
    const response = await fetch('/api/enrollments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...Object.fromEntries(formData.entries()),
        phone, courseId: course.id, courseTitle: course.title,
        county: geography.county, subCounty: geography.subCounty, ward: geography.ward,
        location: geography.location, subLocation: geography.subLocation,
        town: geography.location || geography.ward || geography.subCounty || geography.county,
        verificationToken: token
      })
    });
    const result = await response.json() as { id?:string; reference?:string; amountDueNow?:number; installments?:Array<{label:string;amount:number;dueDate:string}>; error?:string };
    if (!response.ok || !result.id) throw new Error(result.error || 'Your application could not be saved.');
    setRegistrationId(result.id);
    setRegistrationReference(result.reference || result.id);
    setInstallments(result.installments || []);
    setPaymentMessage(`Initial payment required: KSh ${Number(result.amountDueNow || 0).toLocaleString('en-KE')}. Approve the M-Pesa prompt on your phone. Your application remains pending until the payment provider confirms the transaction.`);
    const paymentResponse = await fetch('/api/payments/stk-push', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ purpose:'enrollment', reference:result.id, phone })
    });
    const payment = await paymentResponse.json() as {id?:string;message?:string;error?:string};
    if (!paymentResponse.ok || !payment.id) throw new Error(payment.error || 'Your application is saved, but the M-Pesa prompt could not start. You can retry the payment from Admissions.');
    setStatus(payment.message || 'M-Pesa prompt sent. Complete payment on your phone.');
    let confirmed = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 3000));
      const check = await fetch(`/api/payments/stk-push?reference=${encodeURIComponent(payment.id)}`);
      const checkData = await check.json() as {payment?:{status?:string}};
      if (checkData.payment?.status === 'paid') { confirmed = true; break; }
      if (checkData.payment?.status === 'failed') throw new Error('M-Pesa did not confirm this payment. You can request another prompt.');
    }
    if (confirmed) {
      setPaymentConfirmed(true);
      setStatus(`Payment confirmed. Your application ${result.reference || result.id} has been received. Admissions will review it and send the decision to your verified contacts.`);
    } else {
      setStatus('The M-Pesa prompt was sent. We are still waiting for confirmation. Do not submit another application; check your phone or contact Navstar Admissions.');
    }
  };

  const verifyOtpAndPay = async () => {
    const form = document.getElementById('navstar-application-form') as HTMLFormElement | null;
    if (!form) return;
    const data = new FormData(form);
    setLoading(true); setStatus('');
    try {
      const response = await fetch('/api/enrollments/otp/verify', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email:String(data.get('email') || ''), phone:String(data.get('phone') || ''), otp })
      });
      const result = await response.json() as {verified?:boolean;verificationToken?:string;error?:string};
      if (!response.ok || !result.verified || !result.verificationToken) throw new Error(result.error || 'The code could not be verified.');
      setVerificationToken(result.verificationToken);
      setOtpOpen(false);
      await submitVerifiedApplication(result.verificationToken);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Application verification failed.');
    } finally { setLoading(false); }
  };

  const handleFinalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validateStep()) return;
    if (!course) return;
    const formData = new FormData(event.currentTarget);
    setLoading(true); setStatus('');
    try { await requestOtp(formData); }
    catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Could not start verification.'); }
    finally { setLoading(false); }
  };

  if (!course) return null;
  const fieldClass = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900';
  const textAreaClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  const currentStep = steps[step];

  return (
    <main className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Link to="/courses" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4"/> Courses</Link>
        <div className="mb-7 mt-5 border-b pb-6">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-800">NAVSTAR DIGITAL HUB / ADMISSIONS</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Student application</h1>
          <p className="mt-2 text-slate-600">Complete all seven sections for <strong>{course.title}</strong>. Each section unlocks after the current section is complete.</p>
        </div>
        <div className="mb-6 grid grid-cols-7 gap-1.5" aria-label="Application progress">
          {steps.map((item,index)=><div key={item.title} className="min-w-0"><div className={`h-2 rounded-full ${index<=step?'bg-blue-800':'bg-slate-200'}`}/><p className={`mt-2 hidden truncate text-[10px] font-semibold sm:block ${index===step?'text-blue-900':'text-slate-500'}`}>{index+1}. {item.title}</p></div>)}
        </div>
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <form id="navstar-application-form" noValidate onSubmit={handleFinalSubmit} className="min-w-0 space-y-5">
            <Card data-wizard-step={step}>
              <CardHeader><CardTitle>Section {step+1} of 7 · {currentStep.title}</CardTitle><CardDescription>{currentStep.description}</CardDescription></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {step===0&&<>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="full-name">Full legal name *</Label><Input id="full-name" name="fullName" autoComplete="name" required placeholder="As shown on your identity document"/></div>
                  <div className="space-y-2"><Label htmlFor="birth-date">Date of birth *</Label><Input id="birth-date" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0,10)} required/></div>
                  <div className="space-y-2"><Label htmlFor="gender">Gender</Label><select id="gender" name="gender" className={fieldClass}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Another identity</option></select></div>
                  <div className="space-y-2"><Label htmlFor="nationality">Nationality</Label><Input id="nationality" name="nationality" autoComplete="country-name" defaultValue="Kenyan"/></div>
                </>}
                {step===1&&<>
                  <div className="space-y-2"><Label htmlFor="email">Email address *</Label><Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></div>
                  <div className="space-y-2"><Label htmlFor="phone">M-Pesa / mobile number *</Label><Input id="phone" name="phone" inputMode="tel" autoComplete="tel" required placeholder="07xx xxx xxx"/></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="address">Postal or physical address</Label><Input id="address" name="address" autoComplete="street-address" placeholder="Estate, street or postal address"/></div>
                </>}
                {step===2&&<>
                  <div className="space-y-2"><Label htmlFor="identity-type">Identity document *</Label><select id="identity-type" name="identityType" required className={fieldClass}><option value="">Select document</option><option value="national-id">National ID</option><option value="maisha-card">Maisha Card</option><option value="birth-certificate">Birth Certificate</option><option value="passport">Passport</option></select></div>
                  <div className="space-y-2"><Label htmlFor="identity-number">Document number *</Label><Input id="identity-number" name="identityNumber" autoComplete="off" required/></div>
                  <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Your identity details are used only for admissions checks and are not displayed in public course listings.</p>
                </>}
                {step===3&&<>
                  <div className="space-y-2"><Label>Selected course</Label><Input value={course.title} readOnly/></div>
                  <div className="space-y-2"><Label htmlFor="study-mode">Study mode *</Label><select id="study-mode" name="studyMode" required className={fieldClass}><option value="">Select mode</option><option>On campus</option><option>Online</option><option>Hybrid</option></select></div>
                  <div className="space-y-2"><Label htmlFor="education-level">Highest education level *</Label><select id="education-level" name="educationLevel" required className={fieldClass}><option value="">Select level</option><option>Primary</option><option>Secondary</option><option>Certificate</option><option>Diploma</option><option>Degree or higher</option></select></div>
                  <div className="space-y-2"><Label htmlFor="preferred-intake">Preferred intake</Label><Input id="preferred-intake" name="preferredIntake" type="month"/></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="experience">Relevant experience or learning goals</Label><textarea id="experience" name="experience" rows={4} className={textAreaClass} placeholder="Tell us about your experience and what you hope to learn."/></div>
                </>}
                {step===4&&<>
                  <div className="sm:col-span-2"><GeographyPicker {...geography} onChange={setGeography}/></div>
                  <p className="text-xs text-slate-500 sm:col-span-2">Choose each level in order. Location and sub-location options are maintained by Navstar Admin.</p>
                </>}
                {step===5&&<>
                  <div className="space-y-2"><Label htmlFor="emergency-name">Emergency contact full name *</Label><Input id="emergency-name" name="emergencyContactName" required/></div>
                  <div className="space-y-2"><Label htmlFor="emergency-phone">Emergency contact phone *</Label><Input id="emergency-phone" name="emergencyContactPhone" inputMode="tel" required/></div>
                  <div className="space-y-2"><Label htmlFor="relationship">Relationship to applicant</Label><Input id="relationship" name="emergencyContactRelationship" placeholder="Parent, guardian, spouse, friend…"/></div>
                  <div className="space-y-2 sm:col-span-2"><Label htmlFor="support-needs">Accessibility or learning support needs</Label><textarea id="support-needs" name="supportNeeds" rows={4} className={textAreaClass} placeholder="Optional"/></div>
                </>}
                {step===6&&<>
                  <div className="rounded-xl border bg-slate-50 p-4 text-sm leading-6 text-slate-700 sm:col-span-2"><p className="font-bold text-slate-950">Application review</p><p>Course: {course.title}</p><p>Published course fee: KSh {Number(course.price).toLocaleString('en-KE')}</p><p>Required initial payment is calculated by Navstar from the published course fee and the approved minimum payment setting.</p><p className="mt-2">After you submit this section, a one-time code will be sent to both your email and mobile phone. You must verify both contact channels before the application is saved and the M-Pesa payment prompt is requested.</p></div>
                  <label className="flex items-start gap-3 rounded-xl border bg-white p-4 text-sm leading-6 text-slate-700 sm:col-span-2"><input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-blue-800"/><span>I confirm that the information supplied is accurate and consent to Navstar Digital Hub using it for admissions, student administration and official communication. *</span></label>
                </>}
              </CardContent>
            </Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" disabled={step===0||loading} onClick={()=>{setStep(value=>Math.max(0,value-1));setStatus('');}}><ChevronLeft className="mr-1 h-4 w-4"/>Back</Button>
              {step<6?<Button type="button" disabled={loading} onClick={()=>{if(validateStep())setStep(value=>Math.min(6,value+1));}} className="bg-blue-800 hover:bg-blue-900">Continue <ChevronRight className="ml-1 h-4 w-4"/></Button>:<Button type="submit" disabled={loading} className="bg-blue-800 hover:bg-blue-900">{loading?'Processing…':'Verify contacts and continue'}</Button>}
            </div>
            {status&&<p role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-700">{status}</p>}
            {paymentMessage&&<p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900">{paymentMessage}</p>}
            {registrationId&&<Card className="border-emerald-200"><CardHeader><CardTitle className="flex items-center gap-2">{paymentConfirmed?<CheckCircle2 className="h-5 w-5 text-emerald-700"/>:<AlertCircle className="h-5 w-5 text-amber-700"/>}Application {paymentConfirmed?'received':'saved'}</CardTitle><CardDescription>Reference: {registrationReference}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-slate-700"><p>{paymentConfirmed?'Your payment is confirmed. Admissions will review your application and send a decision.':'Your application is saved while payment confirmation is pending. Do not submit another application.'}</p>{installments.length>0&&<div className="rounded-lg border p-3"><p className="font-bold">Published course fee instalments</p>{installments.map((item,index)=><p key={index} className="mt-1">{item.label}: KSh {item.amount.toLocaleString('en-KE')} {item.dueDate?'· Due '+item.dueDate:''}</p>)}</div>}<Link to="/login?role=student" className="inline-flex rounded-lg bg-blue-800 px-4 py-2.5 font-bold text-white">Student Portal</Link></CardContent></Card>}
          </form>
          <aside className="space-y-4 lg:sticky lg:top-24">
            <Card><CardHeader><CardTitle className="text-lg">Application summary</CardTitle><CardDescription>Official published course details</CardDescription></CardHeader><CardContent className="space-y-4"><div className="aspect-video overflow-hidden rounded-lg bg-slate-100"><img src={course.image} alt={course.title} className="h-full w-full object-cover"/></div><div><h2 className="font-bold text-slate-950">{course.title}</h2><p className="mt-1 text-sm text-slate-500">{course.duration} · {course.category}</p></div><div className="flex justify-between border-t pt-4 text-sm"><span className="text-slate-600">Published course fee</span><strong>KSh {Number(course.price).toLocaleString('en-KE')}</strong></div></CardContent></Card>
            <div className="rounded-xl border-l-2 border-blue-800 bg-white p-4 text-sm text-slate-700"><p className="font-bold">Secure admissions</p><p className="mt-2 leading-5">Email and mobile OTP verification is required. Payment is only marked successful after Safaricom confirms it.</p></div>
            <div className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0"/>Applicant records are stored in the protected Navstar admissions register.</div>
          </aside>
        </div>
      </div>
      {otpOpen&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-800"><ShieldCheck className="h-6 w-6"/></div><h2 className="text-xl font-bold text-slate-950">Verify your contacts</h2><p className="mt-2 text-sm leading-6 text-slate-600">Enter the six-digit code sent to your email and phone. The same code verifies both contact channels.</p><Label htmlFor="application-otp" className="mt-5 block">One-time verification code</Label><Input id="application-otp" value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="mt-2 h-12 text-center text-xl tracking-[.4em]" maxLength={6}/><div className="mt-5 flex gap-2"><Button variant="outline" className="flex-1" disabled={loading} onClick={()=>setOtpOpen(false)}>Cancel</Button><Button className="flex-1 bg-blue-800" disabled={loading||otp.length!==6} onClick={()=>void verifyOtpAndPay()}>{loading?'Verifying…':'Verify and pay'}</Button></div><p className="mt-3 text-xs text-slate-500">Codes expire after 10 minutes. Do not share your code with anyone.</p></div></div>}
    </main>
  );
}
