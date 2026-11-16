import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, ShoppingCart, UserRound, LogOut } from 'lucide-react';
import { DonationPopup } from '@/components/DonationPopup';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navigation = [
  { label: 'Home', to: '/' },
  { label: 'Services', to: '/services' },
  { label: 'Courses', to: '/courses' },
  { label: 'Campus Life', to: '/campus-life' },
  { label: 'Forum', to: '/forum' },
  { label: 'Admission Letters', to: '/admissions-letters' },
  { label: 'Analytics', to: '/analytics' },
  { label: 'Donate', to: '#donate' },
  { label: 'Portals', to: '/portals' },
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
  const [donationOpen, setDonationOpen] = useState(false);
  const brandName = 'NAVSTAR DIGITAL HUB';
  const [signedInUser, setSignedInUser] = useState<{ name: string; role?: string } | null>(null);
  const navigate = useNavigate();

  const signOut = async () => {
    await fetch('/api/customer/logout', { method: 'POST' }).catch(() => undefined);
    setSignedInUser(null);
    window.dispatchEvent(new Event('navstar:customer-auth-changed'));
    navigate('/');
  };

  useEffect(() => {
    let active = true;
    const loadHeaderData = async () => {
      try {
        const sessionResponse = await fetch('/api/customer/me');
        if (!sessionResponse.ok) {
          if (active) setSignedInUser(null);
          return;
        }
        const session = await sessionResponse.json() as { customer?: { fullName?: string } };
        if (active && session.customer?.fullName) {
          setSignedInUser({ name: session.customer.fullName });
        }
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
    <nav className="sticky top-0 z-50 w-full border-t-2 border-amber-400 border-b-2 border-green-500 bg-blue-950 text-white shadow-sm">
      <div className="w-full px-2 sm:px-3 lg:px-4 2xl:px-6">
        <div className="flex min-h-16 w-full items-center justify-between gap-2 xl:gap-3">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2 xl:gap-2.5" aria-label="NAVSTAR DIGITAL HUB home">
            <img src="/navstar-logo.webp" alt="Navstar Digital Hub logo" className="h-12 w-28 shrink-0 object-contain sm:h-14 sm:w-36" />
            <span className="flex min-w-0 flex-col leading-tight"><strong className="max-w-[112px] truncate text-[11px] font-black tracking-tight text-white sm:max-w-[170px] sm:text-xs 2xl:max-w-none 2xl:text-sm">{brandName}</strong><small className="hidden text-[9px] font-bold tracking-[.18em] text-amber-300 sm:block">HOME OF TECHNOCRATS</small></span>
          </Link>

          <div className="hidden xl:flex min-w-0 flex-1 items-center justify-between gap-0.5 px-1 2xl:px-2">
            {navigation.map((item) => item.to === '#donate' ? <button key={item.to} type="button" onClick={() => setDonationOpen(true)} className="whitespace-nowrap rounded-lg bg-amber-300 px-1.5 py-2 text-xs font-extrabold text-blue-950 shadow-md shadow-amber-400/20 transition-colors hover:bg-amber-200 2xl:px-2" aria-haspopup="dialog">{item.label}</button> : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-lg px-1.5 py-2 text-xs font-bold transition-colors 2xl:px-2.5 ${isActive ? 'bg-amber-300 text-blue-950 shadow-md shadow-amber-400/20' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}>
                {item.label}
              </NavLink>)}
          </div>

          <div className="flex shrink-0 items-center gap-1 xl:gap-1.5">
            {signedInUser ? <div className="hidden md:flex max-w-[190px] items-center gap-2 rounded-xl border border-amber-300/70 bg-white/10 px-3 py-2 text-xs font-bold text-white" title={signedInUser.name}><UserRound className="h-4 w-4 shrink-0 text-amber-300"/><span className="truncate">Hi, {signedInUser.name}</span></div> : <Button asChild size="sm" className="hidden sm:inline-flex rounded-xl border border-amber-300 bg-amber-300 px-3 font-extrabold text-blue-950 shadow-md shadow-amber-400/20 hover:bg-amber-200"><Link to="/account"><UserRound className="mr-1.5 h-4 w-4"/>Log in / Sign up</Link></Button>}
            <Link to="/services#service-cart" aria-label="Your orders and cart" title="Your orders and cart" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-green-400/70 bg-green-500/15 text-white shadow-sm transition hover:border-amber-300 hover:bg-amber-300 hover:text-blue-950">
              <ShoppingCart className="h-5 w-5" />
            </Link>
            {signedInUser && <Button size="sm" variant="ghost" className="hidden xl:inline-flex rounded-xl text-white hover:bg-white/10 hover:text-amber-300" onClick={signOut}><LogOut className="mr-1.5 h-4 w-4"/>Log out</Button>}
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
              {navigation.map((item) => item.to === '#donate' ? <button key={item.to} type="button" onClick={() => { closeMenu(); setDonationOpen(true); }} className="rounded-lg bg-amber-300 px-3 py-3 text-left text-sm font-extrabold text-blue-950">Donate</button> : <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `rounded-lg px-3 py-3 text-sm font-bold ${isActive ? 'bg-amber-300 text-blue-950 shadow-md' : 'text-blue-100 hover:bg-white/10'}`} onClick={closeMenu}>{item.label}</NavLink>)}
              {signedInUser ? <div className="col-span-2 rounded-lg border border-amber-300/50 bg-white/10 px-3 py-3 text-sm font-bold text-white">Hi, {signedInUser.name}</div> : <Link to="/account" className="rounded-lg bg-amber-300 px-3 py-3 text-sm font-extrabold text-blue-950" onClick={closeMenu}>Log in / Sign up</Link>}
              <Link to="/services#service-cart" className="rounded-lg px-3 py-3 text-sm font-bold text-blue-100 hover:bg-white/10" onClick={closeMenu}>Your orders / Cart</Link>
              {signedInUser && <button onClick={() => { closeMenu(); void signOut(); }} className="rounded-lg px-3 py-3 text-left text-sm font-bold text-amber-200 hover:bg-white/10">Log out</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <DonationPopup open={donationOpen} onClose={() => setDonationOpen(false)} />
    </nav>
  );
}
