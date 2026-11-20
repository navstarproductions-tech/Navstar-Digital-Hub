import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Code2, Cpu, GraduationCap, Monitor, ShieldCheck, Sparkles, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

const highlights = [
  { icon: GraduationCap, label: 'Digital training', detail: 'Build practical skills' },
  { icon: Monitor, label: 'Cyber services', detail: 'Everyday digital support' },
  { icon: Code2, label: 'Technology solutions', detail: 'Create, automate, innovate' },
];

const heroPoster = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=2000&q=85';


export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#050b1b] text-white">
      <style>{`
        .navstar-hero-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 45%;
          filter: saturate(1.08) contrast(1.04);
        }
        @media (prefers-reduced-motion: reduce) {
          .navstar-hero-video { display: none; }
        }
      `}</style>on } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Code2, Cpu, GraduationCap, Monitor, ShieldCheck, Sparkles, LogIn } from 'lucide-react';
import { motion } from 'framer-motion';

const highlights = [
  { icon: GraduationCap, label: 'Digital training', detail: 'Build practical skills' },
  { icon: Monitor, label: 'Cyber services', detail: 'Everyday digital support' },
  { icon: Code2, label: 'Technology solutions', detail: 'Create, automate, innovate' },
];

const heroPoster = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=2000&q=85';


export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#050b1b] text-white">
      <style>{`
        @keyframes navstarHeroFade {
          0%, 28% { opacity: 1; transform: scale(1.02); }
          34%, 94% { opacity: 0; transform: scale(1.09); }
          100% { opacity: 1; transform: scale(1.02); }
        }
        .navstar-hero-photo { animation: navstarHeroFade 24s ease-in-out infinite; }
        .navstar-hero-photo:nth-child(2) { animation-delay: 8s; }
        .navstar-hero-photo:nth-child(3) { animation-delay: 16s; }
        @media (prefers-reduced-motion: reduce) { .navstar-hero-photo { animation: none; opacity: 0; } .navstar-hero-photo:first-child { opacity: 1; } }
      `}</style>
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${heroPoster}")` }} />
        <video
          className="navstar-hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={heroPoster}
          aria-hidden="true"
        >
          <source src="https://upload.wikimedia.org/wikipedia/commons/b/bf/Programming_a_simple_http_client.webm" type="video/webm" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-r from-[#030817]/70 via-[#06132b]/48 to-[#06132b]/35" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_20%,rgba(37,99,235,.20),transparent_38%),radial-gradient(ellipse_at_85%_15%,rgba(14,165,233,.13),transparent_34%),radial-gradient(ellipse_at_75%_90%,rgba(202,138,4,.10),transparent_32%)]" />
      </div>>

      <div className="container mx-auto grid min-h-[690px] items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-24">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
          <div className="mb-6 flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md sm:p-4">
            <img src="/Navstar_Official_Logo.jpg" alt="Official Navstar Digital Hub logo" className="h-16 w-24 shrink-0 object-contain sm:h-20 sm:w-32" fetchPriority="high" />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[.18em] text-white sm:text-sm">Welcome to Navstar Digital Hub</p>
              <p className="mt-1 text-[10px] font-bold tracking-[.16em] text-amber-300 sm:text-xs">HOME OF TECHNOCRATS</p>
            </div>
          </div>
          <p className="mt-7 text-sm font-extrabold uppercase tracking-[.35em] text-amber-300">HOME OF TECHNOCRATS</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Think digital.
            <span className="block bg-gradient-to-r from-sky-300 via-blue-400 to-amber-300 bg-clip-text text-transparent">Create the future.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
            Learn technology, sharpen your skills and get dependable digital support. From computer training and programming to graphic design, online services and technical solutions — make your next move with Navstar.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="h-12 rounded-full bg-gradient-to-r from-blue-600 to-sky-500 px-7 font-bold text-white shadow-lg shadow-blue-950/40 hover:from-blue-500 hover:to-sky-400">
              <Link to="/courses">Explore courses <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/30 bg-white/10 px-7 text-white backdrop-blur-md hover:bg-white/20 hover:text-white">
              <Link to="/services">Discover our services <Monitor className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-amber-300/50 bg-amber-300/10 px-7 text-amber-100 backdrop-blur-md hover:bg-amber-300/20 hover:text-white">
              <Link to="/portals"><LogIn className="mr-2 h-4 w-4" /> Portal sign in</Link>
            </Button>
          </div>
          <div className="mt-12 grid gap-3 sm:grid-cols-3">
            {highlights.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-[#07152c]/65 p-4 backdrop-blur-md">
                <Icon className="mb-3 h-5 w-5 text-sky-300" />
                <p className="text-sm font-bold text-white">{label}</p>
                <p className="mt-1 text-xs text-slate-300">{detail}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .8, delay: .12 }} className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-500/35 via-cyan-400/15 to-amber-300/25 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-[#0b1730]/80 p-4 shadow-2xl shadow-blue-950/50 backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
              <span className="text-[10px] font-bold uppercase tracking-[.25em] text-slate-300">Digital innovation studio</span>
              <Cpu className="h-4 w-4 text-sky-300" />
            </div>
            <div className="relative mt-5 overflow-hidden rounded-2xl">
              <img src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85" alt="A team collaborating on digital technology" className="h-64 w-full object-cover sm:h-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#071126] via-[#071126]/10 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <p className="text-xs font-bold uppercase tracking-[.25em] text-amber-300">Skills • Services • Solutions</p>
                <p className="mt-1 text-2xl font-black">Your ideas. Our technology.</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[{ icon: BookOpen, text: 'Learn' }, { icon: Code2, text: 'Build' }, { icon: ShieldCheck, text: 'Connect' }].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] py-3 text-xs font-semibold text-slate-200"><Icon className="h-4 w-4 text-sky-300" />{text}</div>
              ))}
            </div>
          </div>
          <div className="absolute -right-3 -top-5 rounded-2xl border border-sky-300/30 bg-blue-500/30 px-4 py-3 shadow-xl backdrop-blur-md sm:-right-7">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-100">Think • Learn</p><p className="text-sm font-black text-white">Innovate</p>
          </div>
        </motion.div>
      </div>
      <div className="h-1 bg-gradient-to-r from-blue-600 via-cyan-400 to-amber-300" />
    </section>
  );
}
