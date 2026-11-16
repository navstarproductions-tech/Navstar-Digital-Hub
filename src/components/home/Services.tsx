import { ArrowUpRight, BriefcaseBusiness, Code2, FileText, GraduationCap, Palette, Printer, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const serviceAreas = [
  { title: 'Government & Online Services', to: '/services?category=E-CITIZEN%20%26%20GVMNT', description: 'eCitizen, KRA, HELB, KUCCPS, TSC, NTSA and other online application assistance.', icon: ShieldCheck },
  { title: 'Academic & Student Support', to: '/services?category=ACADEMIC', description: 'Student applications, academic documents, research support, typing and related services.', icon: GraduationCap },
  { title: 'Printing & Document Finishing', to: '/services?category=PRINTING', description: 'Black-and-white and colour printing, photocopying, scanning and document preparation.', icon: Printer },
  { title: 'Design & Creative Services', to: '/services?category=DESIGN', description: 'Posters, branding, certificates, calendars and other graphic design work.', icon: Palette },
  { title: 'ICT & Digital Solutions', to: '/services?category=ICT', description: 'Computer support, programming, web solutions, troubleshooting and digital assistance.', icon: Code2 },
  { title: 'Business & Professional Support', to: '/services?category=BUSINESS', description: 'Business documents, digital services and tailored support for organisations and individuals.', icon: BriefcaseBusiness },
];

export function Services() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-20 sm:py-24">
      <div className="pointer-events-none absolute -right-32 top-0 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[.22em] text-blue-800"><FileText className="h-4 w-4" /> Our service areas</span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Practical services, clearly organised.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Explore Navstar’s main service areas below. Open the complete catalogue to search individual services, view their listed prices and place an order.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {serviceAreas.map(({ title, description, to, icon: Icon }) => (
            <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white"><Icon className="h-6 w-6" /></span>
              <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
              <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{description}</p>
              <Link to={to} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 transition group-hover:gap-3 group-hover:text-cyan-700">Browse this service area <ArrowUpRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-6 text-center sm:flex-row sm:text-left">
          <div><p className="font-black text-slate-950">Looking for a specific service?</p><p className="mt-1 text-sm text-slate-600">Search the full Navstar catalogue by service name, category or reference code.</p></div>
          <Link to="/services" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800">View full service catalogue <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}
