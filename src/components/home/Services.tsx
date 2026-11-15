import { Monitor, Wifi, Printer, ShieldCheck, GraduationCap, Cpu, Palette, Code2, Bot, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const services = [
  { title: 'Computer Training', description: 'Practical computer packages, digital literacy and guided hands-on learning.', icon: GraduationCap, image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80', tag: 'Learn' },
  { title: 'Cyber & Online Services', description: 'Online applications, eCitizen support, typing, scanning and document processing.', icon: Wifi, image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80', tag: 'Get support' },
  { title: 'Programming & Web Design', description: 'Build websites, software projects and practical solutions with modern tools.', icon: Code2, image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80', tag: 'Build' },
  { title: 'Graphic Design & Branding', description: 'Creative posters, certificates, logos, promotional materials and layouts.', icon: Palette, image: 'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=900&q=80', tag: 'Create' },
  { title: 'Automation & Robotics', description: 'Explore smart systems, electronics, automation concepts and innovation.', icon: Bot, image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=80', tag: 'Innovate' },
  { title: 'Printing & Document Services', description: 'Clear printing, photocopying, scanning, formatting and document finishing.', icon: Printer, image: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?auto=format&fit=crop&w=900&q=80', tag: 'Deliver' },
];

export function Services() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white py-20 sm:py-24">
      <div className="pointer-events-none absolute -right-32 top-0 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[.22em] text-blue-800"><Cpu className="h-4 w-4" /> What we do</span>
          <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Digital services for <span className="bg-gradient-to-r from-blue-700 to-cyan-600 bg-clip-text text-transparent">every next step.</span></h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">From learning essential computer skills to building digital products, Navstar brings practical technology, creativity and support together.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(({ title, description, icon: Icon, image, tag }, index) => (
            <article key={title} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-blue-200 hover:shadow-xl">
              <div className="relative h-44 overflow-hidden bg-slate-900">
                <img src={image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061127]/90 via-[#061127]/10 to-transparent" />
                <span className="absolute bottom-4 left-5 rounded-full border border-white/25 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[.2em] text-white backdrop-blur">{tag}</span>
                <span className={`absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-white/90 shadow-lg ${index % 2 === 0 ? 'text-blue-700' : 'text-cyan-700'}`}><Icon className="h-5 w-5" /></span>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-black text-slate-950">{title}</h3>
                <p className="mt-2 min-h-[72px] text-sm leading-6 text-slate-600">{description}</p>
                <Link to="/services" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-blue-700 transition group-hover:gap-3 group-hover:text-cyan-700">Explore service <ArrowUpRight className="h-4 w-4" /></Link>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50 p-6 text-center sm:flex-row sm:text-left">
          <div><p className="font-black text-slate-950">Have a digital project or need assistance?</p><p className="mt-1 text-sm text-slate-600">Talk to our team about the service that fits your needs.</p></div>
          <Link to="/services" className="inline-flex shrink-0 items-center gap-2 rounded-full bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800">View all services <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}
