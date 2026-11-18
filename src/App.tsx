import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { HomePage } from '@/pages/HomePage';
import { CoursesPage } from '@/pages/CoursesPage';
import { LearningPage } from '@/pages/LearningPage';
import { EnrollmentPage } from '@/pages/EnrollmentPage';
import { AdminPage } from '@/pages/AdminPage';
import { ServicesPage } from '@/pages/ServicesPage';
import { DonationsPage } from '@/pages/DonationsPage';
import { PortalsPage } from '@/pages/PortalsPage';
import { LoginPage } from '@/pages/LoginPage';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { AdminResetPage } from '@/pages/AdminResetPage';
import { CustomerAccountPage } from '@/pages/CustomerAccountPage';
import { DigitalHubPage } from '@/pages/DigitalHubPage';
import { ForumPage } from '@/pages/ForumPage';
import { PaymentReceiptsPage } from '@/pages/PaymentReceiptsPage';
import { MusicPage } from '@/pages/MusicPage';
import { PortalNotificationsPage } from '@/pages/PortalNotificationsPage';
import { MyAccountPage } from '@/pages/MyAccountPage';
import { AIChatWidget } from '@/components/AIChatWidget';
import { Toaster } from '@/components/ui/sonner';

function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, search, hash]);
  return null;
}

function AppShell() {
  const { pathname } = useLocation();
  const standalone = pathname.startsWith('/admin')
    || pathname.startsWith('/portals/')
    || pathname === '/login'
    || pathname === '/setup'
    || pathname === '/admin-reset'
    || pathname === '/change-password'
    || pathname === '/my-account';

  return (
    <>
      <div className={standalone ? 'min-h-screen' : 'flex min-h-screen flex-col'}>
        {!standalone && <Navbar />}
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/courses" element={<CoursesPage />} />
            <Route path="/learning" element={<LearningPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/donations" element={<DonationsPage />} />
            <Route path="/portals" element={<PortalsPage />} />
            <Route path="/portals/:role" element={<PortalsPage />} />
            <Route path="/portals/notifications" element={<PortalNotificationsPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/account" element={<CustomerAccountPage />} />
            <Route path="/my-account" element={<MyAccountPage />} />
            <Route path="/campus-life" element={<DigitalHubPage />} />
            <Route path="/admissions-letters" element={<DigitalHubPage />} />
            <Route path="/analytics" element={<DigitalHubPage />} />
            <Route path="/forum" element={<ForumPage />} />
            <Route path="/music" element={<MusicPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/setup" element={<Navigate to="/login?role=admin" replace />} />
            <Route path="/admin-reset" element={<AdminResetPage />} />
            <Route path="/enroll/:id" element={<EnrollmentPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/receipts" element={<PaymentReceiptsPage />} />
            <Route path="/payment-receipt/:id" element={<PaymentReceiptsPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
        {!standalone && <Footer />}
      </div>
      <AIChatWidget />
      <Toaster position="top-center" />
    </>
  );
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <AppShell />
    </Router>
  );
}

export default App;
