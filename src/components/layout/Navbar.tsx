import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, ShoppingCart, UserRound, LogOut } from 'lucide-react';
import { DonationPopup } from '@/components/DonationPopup';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navigation = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'Navstar AI', to: '/ai' },
  { label: 'Courses', to: '/courses' },
  { label: 'About', to: '/about' },
  { label: 'Forum', to: '/forum' },
  { label: 'Admission Letters', to: '/admissions-letters' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Donate', to: '#donate' },
  { label: 'Student Gateway', to: '/login?role=student' },
];

const contactTicker = [
  'CALL / WHATSAPP: +254 797 688 576',
  'CALL / WHATSAPP: +254 706 637 485',
  'EMAIL: navstardigitalhub@gmail.com',
  'NAVSTAR DIGITAL HUB • HOME OF TECHNOCRATS',
  'ALL CYBER, ICT, TRAINING & DIGITAL SERVICES',
  'LOCATION: RAPHAEL ESTATES, ROOM 3',
  'OPPOSITE SHABAN MEDICAL CLINIC, AFTER ABC MEDICAL CLINIC',
  'OFF AGOROM–BUSIA ROAD • 200 M FROM ACK NAMBALE HOSTELS',
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);
  const [donationOpen, setDonationOpen] = useState(false);
  const brandName = 'NAVSTAR DIGITAL HUB';
  const [signedInUser, setSignedInUser] = useState<{ name: string; role?: string } | null>(null);
  const navigate = useNavigate();

  const signOut = async () => {
    await Promise.all(['/api/customer/logout','/api/auth/logout'].map(url => fetch(url, { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)));
    setSignedInUser(null);
    window.dispatchEvent(new Event('navstar:customer-auth-changed'));
    navigate('/');
  };

  useEffect(() => {
    let active = true;
    const loadHeaderData = async () => {
      try {
        const staffResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
        if (staffResponse.ok) {
          const staff = await staffResponse.json() as { user?: { name?: string; role?: string } };
          if (active && staff.user?.name) {
            setSignedInUser({ name: staff.user.name, role: staff.user.role });
            return;
          }
        }
        const sessionResponse = await fetch('/api/customer/me', { credentials: 'same-origin', cache: 'no-store' });
        if (!sessionResponse.ok) {
          if (active) setSignedInUser(null);
          return;
        }
        const session = await sessionResponse.json() as { customer?: { fullName?: string } };
        if (active && session.customer?.fullName) setSignedInUser({ name: session.customer.fullName, role: 'customer' });
      } catch {
        // Public navigation remains available when the account service is offline.
      }
    };
    void loadHeaderData();
    window.addEventListener('navstar:customer-auth-changed', loadHeaderData);
    return () => { active = false; window.removeEventListener('navstar:customer-auth-changed', loadHeaderData); };
  }, []);

  const closeMenu = () => setIsOpen(false);

  return (
    <nav className="relative sticky top-0 z-50 w-full border-t-2 border-amber-400 border-b-2 border-green-500 bg-blue-950 text-white shadow-sm">
      <div className="w-full px-2 sm:px-3 lg:px-4 2xl:px-6">
        <div className="flex min-h-16 w-full items-center justify-between gap-2 xl:gap-3">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2 xl:gap-2.5" aria-label="NAVSTAR DIGITAL HUB home">
            <img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub logo" className="h-10 w-[4.5rem] shrink-0 rounded-md object-contain" />
            <span className="max-w-[112px] truncate text-[11px] font-black tracking-tight text-white sm:max-w-[170px] sm:text-xs 2xl:max-w-none 2xl:text-sm">{brandName}</span>
          </Link>

          <div className="hidden xl:flex min-w-0 flex-1 items-center justify-between gap-0.5 px-1 2xl:px-2">
            {navigation.map((item) => item.to === '#donate' ? <button key={item.to} type="button" onClick={() => setDonationOpen(true)} className="whitespace-nowrap rounded-lg bg-amber-300 px-1.5 py-2 text-xs font-extrabold text-blue-950 shadow-md shadow-amber-400/20 transition-colors hover:bg-amber-200 2xl:px-2" aria-haspopup="dialog">{item.label}</button> : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-lg px-1.5 py-2 text-xs font-bold transition-colors 2xl:px-2.5 ${isActive ? 'bg-amber-300 text-blue-950 shadow-md shadow-amber-400/20' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}>{item.label}</NavLink>)}
          </div>

          <div className="flex shrink-0 items-center gap-1 xl:gap-1.5">
            {signedInUser ? <div className="hidden md:flex max-w-[190px] items-center gap-2 rounded-xl border border-amber-300/70 bg-white/10 px-3 py-2 text-xs font-bold text-white" title={signedInUser.name}><UserRound className="h-4 w-4 shrink-0 text-amber-300"/><span className="truncate">Hi, {signedInUser.name}</span></div> : <Button asChild size="sm" className="hidden sm:inline-flex rounded-xl border border-amber-300 bg-amber-300 px-3 font-extrabold text-blue-950 shadow-md shadow-amber-400/20 hover:bg-amber-200"><Link to="/account"><UserRound className="mr-1.5 h-4 w-4"/>Log in / Sign up</Link></Button>}
            <Link to="/services#service-cart" aria-label="Your orders and cart" title="Your orders and cart" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-green-400/70 bg-green-500/15 text-white shadow-sm transition hover:border-amber-300 hover:bg-amber-300 hover:text-blue-950">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            {signedInUser && <Button size="sm" variant="ghost" className="hidden xl:inline-flex rounded-xl text-white hover:bg-white/10 hover:text-amber-300" onClick={signOut}><LogOut className="mr-1.5 h-4 w-4"/>Log out</Button>}
            <button onClick={() => setIsOpen(!isOpen)} aria-label={isOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={isOpen} aria-controls="navstar-public-navigation-menu" className="inline-flex items-center justify-center rounded-lg border border-amber-300/70 bg-white/5 p-2 text-white hover:bg-white/10 xl:hidden">
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
          <motion.div id="navstar-public-navigation-menu" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.16 }} className="absolute right-2 top-full z-[60] max-h-[min(75svh,640px)] w-[min(92vw,380px)] overflow-y-auto overscroll-contain rounded-2xl border border-amber-300/70 bg-blue-950 p-3 shadow-2xl shadow-blue-950/40 xl:hidden">
            <div className="mb-2 flex items-center justify-between border-b border-white/15 px-1 pb-2">
              <span className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Public navigation</span>
              <button type="button" onClick={closeMenu} aria-label="Close navigation menu" className="rounded-lg p-1.5 text-blue-100 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {navigation.map((item) => item.to === '#donate' ? <button key={item.to} type="button" onClick={() => { closeMenu(); setDonationOpen(true); }} className="rounded-xl bg-amber-300 px-3 py-3 text-left text-sm font-extrabold text-blue-950 transition hover:bg-amber-200">Donate</button> : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? "rounded-xl bg-amber-300 px-3 py-3 text-sm font-bold text-blue-950 shadow-md" : "rounded-xl px-3 py-3 text-sm font-bold text-blue-100 transition-colors hover:bg-white/10 hover:text-white"} onClick={closeMenu}>{item.label}</NavLink>)}
              {signedInUser ? <div className="rounded-xl border border-amber-300/50 bg-white/10 px-3 py-3 text-sm font-bold text-white sm:col-span-2">Hi, {signedInUser.name}</div> : <Link to="/account" className="rounded-xl bg-amber-300 px-3 py-3 text-sm font-extrabold text-blue-950" onClick={closeMenu}>Log in / Sign up</Link>}
              <Link to="/services#service-cart" className="rounded-xl px-3 py-3 text-sm font-bold text-blue-100 hover:bg-white/10" onClick={closeMenu}>Your orders / Cart</Link>
              {signedInUser && <button onClick={() => { closeMenu(); void signOut(); }} className="rounded-xl px-3 py-3 text-left text-sm font-bold text-amber-200 hover:bg-white/10">Log out</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <DonationPopup open={donationOpen} onClose={() => setDonationOpen(false)} />
    </nav>
  );
}
