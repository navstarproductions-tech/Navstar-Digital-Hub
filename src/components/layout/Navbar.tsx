import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Monitor, Menu, X, GraduationCap, ShoppingCart, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navigation = [
  { label: 'Home', to: '/' },
  { label: 'Courses', to: '/courses' },
  { label: 'Services', to: '/services' },
  { label: 'Campus Life', to: '/campus-life' },
  { label: 'Admission Letters', to: '/admissions-letters' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Music', to: '/music' },
  { label: 'Forum', to: '/forum' },
];

const contactTicker = [
  'CALL / WHATSAPP: +254 797 688 576',
  'CALL / WHATSAPP: +254 706 637 485',
  'EMAIL: navstardigitalhub@gmail.com',
  'NAVSTAR DIGITAL HUB • HOME OF TECHNOCRATS',
  'ALL CYBER, ICT, TRAINING & DIGITAL SERVICES',
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [brandName, setBrandName] = useState('NAVSTAR DIGITAL HUB');
  const [logoUrl, setLogoUrl] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const navigate = useNavigate();

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSignedIn(false);
    navigate('/');
  };

  useEffect(() => {
    let active = true;
    const loadHeaderData = async () => {
      try {
        const settingsResponse = await fetch('/api/site-settings');
        if (settingsResponse.ok) {
          const result = await settingsResponse.json() as { settings?: { schoolName?: string; logoAssetId?: string } };
          if (active && result.settings) {
            setBrandName(result.settings.schoolName || 'NAVSTAR DIGITAL HUB');
            if (result.settings.logoAssetId) setLogoUrl(`/api/media/${result.settings.logoAssetId}`);
          }
        }
        const sessionResponse = await fetch('/api/auth/me');
        if (!sessionResponse.ok) return;
        const session = await sessionResponse.json() as { user?: { mustChangePassword?: boolean } };
        if (active && session.user) setSignedIn(true);
      } catch {
        // Public navigation remains available when the account service is offline.
      }
    };
    void loadHeaderData();
    return () => { active = false; };
  }, []);

  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-amber-300/70 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="container mx-auto px-3 sm:px-5 lg:px-7">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2.5" aria-label="NAVSTAR DIGITAL HUB home">
            {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain" /> : <div className="rounded-lg bg-blue-950 p-2 text-white"><Monitor className="h-5 w-5" /></div>}
            <span className="max-w-[150px] truncate text-xs font-black tracking-wide text-slate-950 sm:max-w-none sm:text-sm">{brandName}</span>
          </Link>

          <div className="hidden xl:flex min-w-0 flex-1 items-center justify-center gap-0.5">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-bold transition-colors 2xl:px-2.5 ${isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="hidden 2xl:inline text-xs font-bold text-blue-950">Hi, NAVSTAR</span>
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex border-blue-200 text-blue-900">
              <Link to="/portals"><GraduationCap className="mr-1.5 h-4 w-4" />Student Gateway</Link>
            </Button>
            <Link to="/services#service-cart" aria-label="Your orders and cart" title="Your orders" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-amber-50 hover:text-blue-900">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            {signedIn && <Button size="sm" variant="ghost" className="hidden 2xl:inline-flex" onClick={signOut}>Sign out</Button>}
            <button onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={isOpen} className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-800 hover:bg-slate-100 xl:hidden">
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden border-t border-amber-300 bg-gradient-to-r from-amber-50 via-yellow-100 to-amber-50 py-2.5">
        <motion.div className="flex w-max items-center gap-8 whitespace-nowrap px-5" animate={{ x: ['100vw', '-100%'] }} transition={{ duration: 34, ease: 'linear', repeat: Infinity }}>
          {[...contactTicker, ...contactTicker].map((item, index) => (
            <span key={index} className="font-serif text-xs font-bold italic tracking-[.12em] text-amber-900 sm:text-sm">
              <span className="mr-3 text-amber-600">✦</span>{item}<span className="ml-8 text-amber-600">✦</span>
            </span>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="xl:hidden border-b border-slate-200 bg-white shadow-lg">
            <div className="grid grid-cols-2 gap-1 px-3 pb-4 pt-3 sm:grid-cols-3 sm:px-5">
              {navigation.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `rounded-lg px-3 py-3 text-sm font-bold ${isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-100'}`} onClick={closeMenu}>{item.label}</NavLink>
              ))}
              <Link to="/portals" className="rounded-lg bg-blue-950 px-3 py-3 text-sm font-bold text-white" onClick={closeMenu}>Student Gateway</Link>
              <Link to="/services#service-cart" className="rounded-lg px-3 py-3 text-sm font-bold text-slate-700 hover:bg-amber-50" onClick={closeMenu}>Your orders / Cart</Link>
              {signedIn && <button onClick={() => { closeMenu(); void signOut(); }} className="rounded-lg px-3 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-100">Sign out</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
