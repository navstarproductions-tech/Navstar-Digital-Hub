import { Monitor, Facebook, Instagram, Mail, Phone, MapPin, FileText, ShieldCheck, Music2, GraduationCap, BriefcaseBusiness } from 'lucide-react';
import { Link } from 'react-router-dom';

const downloads = [
  'STUDENT COURSE ENROLMENT FORM (FORM 1A)',
  'CONTINUING / REPEAT COURSE ENROLMENT FORM (FORM 2)',
  'STUDENT COMPLAINT / GRIEVANCE FORM (FORM 4)',
  'STUDENT FEEDBACK / COURSE EVALUATION FORM (FORM 7)',
  'ALUMNI / STUDENT FOLLOW-UP FORM (FORM 8)',
  'ORDER PLACEMENT SHEET',
  'ANSWER BOOKLET FOR NAVSTAR DIGITAL HUB',
  'OUR COURSES',
  '2026 ACADEMIC CALENDAR',
];

const resourceLinks = [
  ['CV Builder', '/cv-builder'],
  ['Admission Letters', '/admission-letters'],
  ['Scholarship Applications', '/scholarship'],
  ['AI Assistant', '/assistant'],
  ['Certificate Reprint Request', '/certificate-reprint'],
  ['Verify Certificate', '/verify-certificate'],
  ['Terms & Policies', '/terms'],
  ['Privacy Policy', '/privacy'],
  ['Refund Policy', '/refund-policy'],
  ['Events & Tickets', '/events'],
];

const portalLinks = [
  ['Student Gateway', '/portals/student'],
  ['Admin Portal', '/portals/admin'],
  ['Tutor Portal', '/portals/tutor'],
  ['Finance Portal', '/portals/finance'],
  ['ICT Portal', '/portals/ict'],
  ['Principal Portal', '/portals/principal'],
  ['Deputy Principal', '/portals/deputy-principal'],
  ['Dean of Studies', '/portals/dean-of-studies'],
];

export function Footer() {
  return (
    <footer className="bg-[#061127] text-slate-300">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1.25fr]">
          <div>
            <Link to="/" className="flex items-center gap-3 text-white"><span className="rounded-xl bg-blue-600 p-2"><Monitor className="h-6 w-6" /></span><span><strong className="block text-base tracking-wide">NAVSTAR DIGITAL HUB</strong><small className="text-xs font-semibold text-cyan-300">HOME OF TECHNOCRATS</small></span></Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">Cyber services, digital education and administrative tools. Empowering Kenya, one skill at a time.</p>
            <address className="mt-5 space-y-3 not-italic text-sm">
              <p className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />P.O. BOX 546-50200 Bungoma, Kenya</p>
              <a className="flex items-center gap-3 hover:text-white" href="tel:+254797688576"><Phone className="h-4 w-4 text-cyan-300" />+254 797 688 576</a>
              <a className="flex items-center gap-3 hover:text-white" href="mailto:navstardigitalhub@gmail.com"><Mail className="h-4 w-4 text-cyan-300" />navstardigitalhub@gmail.com</a>
            </address>
            <div className="mt-5 flex gap-3"><a href="https://www.facebook.com/" target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-lg border border-white/15 p-2 hover:bg-white/10"><Facebook className="h-4 w-4" /></a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-lg border border-white/15 p-2 hover:bg-white/10"><Instagram className="h-4 w-4" /></a></div>
          </div>
          <div><h3 className="text-xs font-extrabold uppercase tracking-[.2em] text-white">Explore</h3><ul className="mt-4 space-y-2.5 text-sm">{[['Home','/'],['Courses','/courses'],['Services','/services'],['Gallery','/gallery'],['Forum','/forum'],['Music','/music'],['About','/about'],['Fee Structures','/fees'],['Portals','/portals']].map(([label,path]) => <li key={label}><Link className="hover:text-cyan-300" to={path}>{label}</Link></li>)}</ul></div>
          <div><h3 className="text-xs font-extrabold uppercase tracking-[.2em] text-white">Portals</h3><ul className="mt-4 space-y-2.5 text-sm">{portalLinks.map(([label,path]) => <li key={label}><Link className="hover:text-cyan-300" to={path}>{label}</Link></li>)}</ul><h3 className="mt-7 text-xs font-extrabold uppercase tracking-[.2em] text-white">Resources & Legal</h3><ul className="mt-4 space-y-2.5 text-sm">{resourceLinks.map(([label,path]) => <li key={label}><Link className="hover:text-cyan-300" to={path}>{label}</Link></li>)}</ul></div>
          <div><h3 className="text-xs font-extrabold uppercase tracking-[.2em] text-white">Downloads & Documents</h3><ul className="mt-4 space-y-3 text-sm">{downloads.map((label) => <li key={label} className="flex items-start gap-2 text-slate-400"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span>{label}</span></li>)}</ul><div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4"><div className="flex items-center gap-2 text-sm font-bold text-white"><GraduationCap className="h-4 w-4 text-cyan-300" />Student Gateway</div><p className="mt-2 text-xs leading-5 text-slate-400">Access learning information, applications and student updates.</p><Link to="/portals/student" className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-cyan-300 hover:text-white">Open Gateway <BriefcaseBusiness className="h-4 w-4" /></Link></div></div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} NAVSTAR DIGITAL HUB. All Rights Reserved.</p><p>Designed & Powered by Navstar Systems · HOME OF TECHNOCRATS</p></div>
      </div>
    </footer>
  );
}