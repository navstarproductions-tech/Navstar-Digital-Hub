import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Monitor, Menu, X, GraduationCap, ShoppingCart } from 'lucide-react';
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
  'LOCATION: RAPHAEL ESTATES, ROOM 3',
  'OPPOSITE SHABAN MEDICAL CLINIC, AFTER ABC MEDICAL CLINIC',
  'OFF AGOROM–BUSIA ROAD • 200 M FROM ACK NAMBale HOSTELS',
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [brandName, setBrandName] = useState('NAVSTAR DIGITAL HUB');
  const [logoUrl, setLogoUrl] = useState('');
  const [signedInUser, setSignedInUser] = useState<{ name: string; role?: string } | null>(null);
  const navigate = useNavigate();

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSignedInUser(null);
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
        if (!sessionResponse.ok) {
          if (active) setSignedInUser(null);
          return;
        }
        const session = await sessionResponse.json() as { user?: { name?: string; role?: string } };
        if (active && session.user?.name) {
          setSignedInUser({ name: session.user.name, role: session.user.role });
        }
      } catch {
        // Public navigation remains available when the account service is offline.
      }
    };
    void loadHeaderData();
    return () => { active = false; };
  }, []);

  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="sticky top-0 z-50 w-full border-t-2 border-amber-400 border-b-2 border-green-500 bg-blue-950 text-white shadow-sm">
      <div className="container mx-auto px-3 sm:px-5 lg:px-7">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2.5" aria-label="NAVSTAR DIGITAL HUB home">
            {logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain" /> : <div className="rounded-lg bg-white/10 p-2 text-white"><Monitor className="h-5 w-5" /></div>}
            <span className="max-w-[150px] truncate text-xs font-black tracking-wide text-white sm:max-w-none sm:text-sm">{brandName}</span>
          </Link>

          <div className="hidden xl:flex min-w-0 flex-1 items-center justify-center gap-0.5">
            {navigation.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-lg px-2 py-2 text-[13px] font-bold transition-colors 2xl:px-2.5 ${isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {signedInUser && <span className="hidden xl:inline max-w-[170px] truncate text-xs font-bold text-white" title={signedInUser.name}>Hi, {signedInUser.name}</span>}
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white">
              <Link to="/portals"><GraduationCap className="mr-1.5 h-4 w-4" />Student Gateway</Link>
            </Button>
            <Link to="/services#service-cart" aria-label="Your orders and cart" title="Your orders" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            {signedInUser && <Button size="sm" variant="ghost" className="hidden 2xl:inline-flex text-white hover:bg-white/10 hover:text-white" onClick={signOut}>Sign out</Button>}
            <button onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={isOpen} className="inline-flex items-center justify-center rounded-lg border border-white/30 p-2 text-white hover:bg-white/10 xl:hidden">
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden border-t-2 border-green-500 border-b-2 bg-blue-900 py-2.5">
        <motion.div
          className="flex w-max items-center gap-8 whitespace-nowrap"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 58, ease: 'linear', repeat: Infinity }}
        >
          {[...contactTicker, ...contactTicker].map((item, index) => (
            <span key={index} className="shrink-0 font-serif text-xs font-bold italic tracking-[.08em] text-white sm:text-sm">
              {item}<span className="ml-8 text-amber-300">✦</span>
            </span>
          ))}
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="xl:hidden border-b-2 border-green-500 bg-blue-950 shadow-lg">
            <div className="grid grid-cols-2 gap-1 px-3 pb-4 pt-3 sm:grid-cols-3 sm:px-5">
              {navigation.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `rounded-lg px-3 py-3 text-sm font-bold ${isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10'}`} onClick={closeMenu}>{item.label}</NavLink>
              ))}
              <Link to="/portals" className="rounded-lg bg-white px-3 py-3 text-sm font-bold text-blue-950" onClick={closeMenu}>Student Gateway</Link>
              <Link to="/services#service-cart" className="rounded-lg px-3 py-3 text-sm font-bold text-blue-100 hover:bg-white/10" onClick={closeMenu}>Your orders / Cart</Link>
              {signedInUser && <button onClick={() => { closeMenu(); void signOut(); }} className="rounded-lg px-3 py-3 text-left text-sm font-bold text-blue-100 hover:bg-white/10">Sign out</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
