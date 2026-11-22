import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HomePage } from '@/pages/HomePage';
import { AboutPage } from '@/pages/AboutPage';
import { PublicEnrollmentPage } from '@/pages/PublicEnrollmentPage';
import { StaffApplicationPage } from '@/pages/StaffApplicationPage';
import { CoursesPage } from '@/pages/CoursesPage';
import { LearningPage } from '@/pages/LearningPage';
import { EnrollmentPage } from '@/pages/EnrollmentPage';
import { StudentPasswordSetupPage } from '@/pages/StudentPasswordSetupPage';
import { AdminPage } from '@/pages/AdminPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { DonationsPage } from '@/pages/DonationsPage';
import { PortalsPage } from '@/pages/PortalsPage';
import { LoginPage } from '@/pages/LoginPage';
import { StudentPortalPage } from '@/pages/StudentPortalPage';
import { StudentRecoveryPage } from '@/pages/StudentRecoveryPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { FirstAdminSetupPage } from '@/pages/FirstAdminSetupPage';
import { CustomerAccountPage } from '@/pages/CustomerAccountPage';
import { DigitalHubPage } from '@/pages/DigitalHubPage';
import { ForumPage } from '@/pages/ForumPage';
import { PaymentReceiptsPage } from '@/pages/PaymentReceiptsPage';
import { PublicResultVerificationPage } from '@/pages/PublicResultVerificationPage';
import { PayPage } from '@/pages/PayPage';
import { MusicPage } from '@/pages/MusicPage';
import { PortalNotificationsPage } from '@/pages/PortalNotificationsPage';
import { MyAccountPage } from '@/pages/MyAccountPage';
import { AIPage } from '@/pages/AIPage';
import { PortalMaintenanceGate } from '@/components/PortalMaintenanceGate';
import { Toaster } from '@/components/ui/sonner';

function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, search, hash]);
  return null;
}

function IdleSessionGuard() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const protectedPath = pathname.startsWith('/admin') || pathname.startsWith('/portals/') || pathname === '/student-portal' || pathname === '/my-account' || pathname === '/change-password'
    || pathname === '/set-password';
    if (!protectedPath) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeoutMs = 8 * 60 * 60 * 1000;
    let role = pathname === '/student-portal' ? 'student' : pathname.startsWith('/admin') ? 'admin' : pathname.startsWith('/portals/') && pathname.split('/')[2] !== 'notifications' ? pathname.split('/')[2] : (localStorage.getItem('navstar:lastRole') || '');
    const returnTo = pathname + search + hash;
    const loginGate = () => role ? '/login?role=' + encodeURIComponent(role) + '&returnTo=' + encodeURIComponent(returnTo) : '/portals';
    let lastPing = 0;
    let active = true;
    const signOutForInactivity = async () => {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      if (active) navigate(loginGate(), { replace: true });
    };
    const resetIdleTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void signOutForInactivity(); }, timeoutMs);
      const now = Date.now();
      if (now - lastPing > 60000) {
        lastPing = now;
        void fetch('/api/auth/me').then(async response => {
          if (!response.ok) {
            if (active) navigate(loginGate(), { replace: true });
            return;
          }
          const result = await response.json() as { user?: { role?: string }; sessionTimeoutMinutes?: number };
          if (result.user?.role) role = result.user.role;
          if (result.sessionTimeoutMinutes) timeoutMs = Math.max(5, Math.min(480, result.sessionTimeoutMinutes)) * 60000;
          if (timer) { clearTimeout(timer); timer = setTimeout(() => { void signOutForInactivity(); }, timeoutMs); }
        }).catch(() => undefined);
      }
    };
    void fetch('/api/auth/me').then(async response => {
      if (!response.ok) { if (active) navigate(loginGate(), { replace: true }); return; }
      const result = await response.json() as { user?: { role?: string }; sessionTimeoutMinutes?: number };
      if (result.user?.role) role = result.user.role;
      if (result.sessionTimeoutMinutes) timeoutMs = Math.max(5, Math.min(480, result.sessionTimeoutMinutes)) * 60000;
      resetIdleTimer();
    }).catch(() => undefined);
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, [pathname, search, hash, navigate]);

  return null;
}

function AppShell() {
  const { pathname } = useLocation();
  const standalone = pathname.startsWith('/admin')
    || pathname.startsWith('/portals/')
    || pathname === '/student-portal'
    || pathname === '/student-recovery'
    || pathname === '/login'
    || pathname === '/setup'
    || pathname === '/admin-reset'
    || pathname === '/change-password'
    || pathname === '/my-account'
    || pathname === '/staff-application';

  return (
    <>
      <div className={standalone ? 'min-h-screen' : 'flex min-h-screen flex-col'}>
        {!standalone && <Navbar />}
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/gallery" element={<Navigate to="/about" replace />} />
            <Route path="/enrollment" element={<PublicEnrollmentPage />} />\n            <Route path="/staff-application" element={<StaffApplicationPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/ai" element={<AIPage />} />
            <Route path="/pay" element={<PayPage />} />
            <Route path="/donations" element={<DonationsPage />} />
            <Route path="/portals" element={<PortalsPage />} />
            <Route path="/portals/student" element={<Navigate to="/student-portal" replace />} />
            <Route path="/student-portal" element={<PortalMaintenanceGate role="student"><StudentPortalPage /></PortalMaintenanceGate>} />
            <Route path="/portals/:role" element={<PortalsPage />} />
            <Route path="/portals/notifications" element={<PortalNotificationsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/student-recovery" element={<StudentRecoveryPage />} />
            <Route path="/account" element={<CustomerAccountPage />} />
            <Route path="/my-account" element={<MyAccountPage />} />
            <Route path="/campus-life" element={<DigitalHubPage />} />
            <Route path="/admissions-letters" element={<DigitalHubPage />} />
            <Route path="/analytics" element={<DigitalHubPage />} />
            <Route path="/forum" element={<ForumPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/set-password" element={<StudentPasswordSetupPage />} />
            <Route path="/setup" element={<FirstAdminSetupPage />} />
            <Route path="/admin-reset" element={<Navigate to="/student-recovery" replace />} />
            <Route path="/enroll/:id" element={<EnrollmentPage />} />
            <Route path="/admin" element={<PortalMaintenanceGate role="admin"><AdminPage /></PortalMaintenanceGate>} />
            <Route path="/admin/receipts" element={<PortalMaintenanceGate role="admin"><PaymentReceiptsPage /></PortalMaintenanceGate>} />
            <Route path="/payment-receipt/:id" element={<PaymentReceiptsPage />} />
            <Route path="/verify-result/:token" element={<PublicResultVerificationPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
        {!standalone && pathname !== '/ai' && <Footer />}
      </div>
      <Toaster position="top-center" />
    </>
  );
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <IdleSessionGuard />
      <AppShell />
    </Router>
  );
}

export default App;
