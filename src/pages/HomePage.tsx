import { Hero } from '@/components/home/Hero';
import { Services } from '@/components/home/Services';
import { FeaturedCourses } from '@/components/home/FeaturedCourses';
import { Gallery } from '@/components/home/Gallery';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Code2, Cpu, GraduationCap, Lightbulb, MonitorCog, ShieldCheck, Sparkles, Zap } from 'lucide-react';

const pillars = [
  { icon: GraduationCap, title: 'Learn with purpose', text: 'Build practical digital skills through guided, hands-on training and flexible learning.' },
  { icon: MonitorCog, title: 'Get things done', text: 'Access dependable cyber, document, online application and everyday technology services.' },
  { icon: Code2, title: 'Create and innovate', text: 'Explore programming, web design, graphic design, automation and modern digital tools.' },
];

const values = ['Practical, learner-centred digital training', 'Friendly support for individuals and businesses', 'Technology explained in a clear, useful way', 'A commitment to responsible and safer digital use'];

export function HomePage() {
  return (
    <main className="overflow-hidden bg-white">
      <Hero />

      <section className="relative border-b border-slate-100 bg-white py-7">
        <div className="container mx-auto grid gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            { icon: BadgeCheck, label: 'Practical support', sub: 'Real-world digital help' },
            { icon: Cpu, label: 'Technology skills', sub: 'From basics to advanced' },
            { icon: ShieldCheck, label: 'Safer digital use', sub: 'Guidance with care' },
            { icon: Zap, label: 'Innovation mindset', sub: 'Learn, build and improve' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Icon className="h-5 w-5" /></span>
              <div><p className="text-sm font-bold text-slate-900">{label}</p><p className="mt-0.5 text-xs text-slate-500">{sub}</p></div>
            </div>
          ))}
        </div>
      </section>

      <Services />

      <section className="relative isolate overflow-hidden bg-[#071329] py-20 text-white sm:py-24">
        <div className="absolute -right-24 -top-28 -z-10 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[.25em] text-amber-200"><Sparkles className="h-4 w-4" /> The Navstar approach</p>
            <h2 className="mt-6 text-3xl font-black tracking-tight sm:text-4xl">Technology should open doors — not create barriers.</h2>
            <p className="mt-5 text-base leading-8 text-slate-300">We bring learning, practical digital assistance and creative technology together, helping people gain confidence and make technology work in everyday life.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {pillars.map(({ icon: Icon, title, text }, index) => (
              <article key={title} className="group rounded-2xl border border-white/10 bg-white/[.055] p-7 transition duration-300 hover:-translate-y-1 hover:border-sky-300/40 hover:bg-white/[.09]">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${index === 0 ? 'bg-blue-500/20 text-blue-300' : index === 1 ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-400/20 text-amber-300'}`}><Icon className="h-6 w-6" /></span>
                <h3 className="mt-6 text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-slate-50 via-white to-blue-50 py-20 sm:py-24">
        <div className="container mx-auto grid items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-blue-200/70 to-amber-100/80 blur-xl" />
            <div className="relative overflow-hidden rounded-[1.7rem] border border-white shadow-2xl">
              <img src="https://storage.googleapis.com/dala-prod-public-storage/generated-images/8fb27cb6-b5e4-4e3a-a9bd-86137cc28585/hero-hub-b53bdca5-1776781000029.webp" alt="Digital learning and technology" loading="lazy" className="aspect-[5/4] w-full object-cover" />
            </div>
            <div className="absolute -bottom-5 -right-2 rounded-2xl border border-blue-100 bg-white p-4 shadow-xl sm:-right-5"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Our motto</p><p className="mt-1 text-lg font-black text-slate-950">HOME OF TECHNOCRATS</p></div>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.28em] text-blue-700">Who we are</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">A hub for skills, services and digital possibilities.</h2>
            <p className="mt-5 text-base leading-8 text-slate-600">Navstar Digital Hub supports learners, job seekers, entrepreneurs and the wider community with accessible technology training and practical digital services.</p>
            <ul className="mt-7 space-y-4">
              {values.map((value) => <li key={value} className="flex items-start gap-3 text-sm leading-6 text-slate-700"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" /></span>{value}</li>)}
            </ul>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild className="rounded-full bg-blue-700 px-6 hover:bg-blue-800"><Link to="/services">Explore services <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild variant="outline" className="rounded-full border-slate-300 px-6"><Link to="/portals">Access portals</Link></Button>
            </div>
          </div>
        </div>
      </section>

      <FeaturedCourses />
      <Gallery />

      <section className="relative isolate overflow-hidden bg-[#061127] py-20 text-center text-white sm:py-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_120%,rgba(37,99,235,.42),transparent_55%)]" />
        <div className="container mx-auto px-4">
          <Lightbulb className="mx-auto h-9 w-9 text-amber-300" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[.3em] text-sky-300">Your next step starts here</p>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black sm:text-4xl">Ready to learn, create or get connected?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300">Explore our courses, discover the services available, or speak with our team about the right digital solution for you.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 px-8 font-bold"><Link to="/courses">Browse courses <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/25 bg-white/5 px-8 text-white hover:bg-white/10 hover:text-white"><Link to="/donations">Support digital access</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
