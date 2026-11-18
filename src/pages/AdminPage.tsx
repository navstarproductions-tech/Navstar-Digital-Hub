import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChangeEvent, FormEvent } from 'react';
import { Bell, BookOpen, BriefcaseBusiness, CircleDollarSign, FileDown, ImagePlus, LayoutDashboard, Pencil, Plus, Save, Settings, ShieldAlert, Trash2, Users, ReceiptText, PanelLeftClose, PanelLeftOpen, LogOut, UserRound, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';
import { INITIAL_COURSES } from '@/data/courses';
import type { Course } from '@/types';
import { formatEATDateTime } from '@/lib/datetime';
import { parseCsv, downloadCsvTemplate, exportBrandedData } from '@/lib/navstar-data-tools';
import { GeographyPicker } from '@/components/GeographyPicker';
import { ProfileDropdown, GENDER_OPTIONS, CITIZENSHIP_OPTIONS, DEPARTMENT_OPTIONS, JOB_TITLE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from '@/components/ProfileDropdown';

type Section = 'overview' | 'courses' | 'learning' | 'school' | 'services' | 'enrollments' | 'finance' | 'receipts' | 'gallery' | 'downloads' | 'orders' | 'users' | 'settings';
type ServiceItem = { id: string; name: string; category: string; price: string; priceAmount?: number | null; status: 'Active' | 'Paused' };
type PortalUser = { id: string; name: string; email: string; role: string; status: string; staffId?: string; nationalId?: string; phone?: string; dateOfBirth?: string; gender?: string; citizenship?: string; county?: string; subCounty?: string; ward?: string; location?: string; subLocation?: string; address?: string; department?: string; jobTitle?: string; employmentType?: string; joinedOn?: string };
type LearningSubmission = { id: string; learner_name: string; response_text: string; attachment_url?: string | null; status: string; points_awarded?: number | null; feedback?: string | null; submitted_at: string };
type LearningAssignment = { id: string; title: string; instructions: string; due_at?: string | null; max_points: number; status: string; submissions?: LearningSubmission[] };
type LearningModule = { id: string; title: string; description: string; status: string; lessons: { id: string; title: string; content: string; status: string; estimated_minutes: number }[] };
type LearningCourse = { id: string; title: string; modules: LearningModule[]; assignments: LearningAssignment[] };
type SchoolRecord = { id: string; school_code: string; name: string; school_type: string; curriculum: string };
type SchoolYear = { id: string; name: string; start_date: string; end_date: string; is_current: number };
type SchoolClass = { id: string; name: string; education_stage: string; grade_level: string; stream: string; academic_year: string };
type SchoolLearner = { id: string; admission_number: string; first_name: string; middle_name?: string; last_name: string; status: string; class_name?: string };
type SchoolSubject = { id: string; code?: string; name: string; education_stage: string; grade_level?: string };
type SchoolFee = { id: string; name: string; education_stage?: string; grade_level?: string; programme_name?: string; currency: string; total_amount: number; status: string; academic_year?: string };



const isPasswordStrong = (value: string) => value.length >= 6 && value.length <= 12 && [/[A-Z]/.test(value), /[a-z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length >= 3;

const initialServices: ServiceItem[] = [
  { id: 's1', name: 'Computer access', category: 'Cyber cafe', price: 'KSh 50 / hour', status: 'Active' },
  { id: 's2', name: 'Printing and scanning', category: 'Document desk', price: 'From KSh 10', status: 'Active' },
  { id: 's3', name: 'Online application support', category: 'Digital support', price: 'From KSh 100', status: 'Active' },
];

const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'courses', label: 'Courses & programmes', icon: BookOpen },
  { id: 'learning', label: 'Learning management', icon: BookOpen },
  { id: 'school', label: 'School ERP & registry', icon: Users },
  { id: 'services', label: 'Cyber service catalogue', icon: BriefcaseBusiness },
  { id: 'enrollments', label: 'Admissions & applications', icon: Users },
  { id: 'finance', label: 'Finance & cashouts', icon: CircleDollarSign },
  { id: 'receipts', label: 'Payment receipts', icon: ReceiptText },
  { id: 'gallery', label: 'Gallery & branding', icon: ImagePlus },
  { id: 'downloads', label: 'Downloads & documents', icon: FileDown },
  { id: 'orders', label: 'Cyber service desk', icon: BriefcaseBusiness },
  { id: 'users', label: 'Users, staff & Admins', icon: Users },
  { id: 'settings', label: 'Notifications & settings', icon: Settings },
];

const sectionSubtabs: Record<Section, { label: string; target: Section; settingsTab?: 'site' | 'notifications' | 'my-profile' | 'geography' | 'staff-ids' }[]> = {
  overview: [{label:'Overview',target:'overview'},{label:'Recent Admissions',target:'enrollments'},{label:'Course Statistics',target:'courses'},{label:'Academic Records',target:'school'},{label:'Finance Summary',target:'finance'},{label:'Quick Actions',target:'services'}],
  courses: [{label:'Course Catalogue',target:'courses'},{label:'Learning Modules',target:'learning'},{label:'Student Enrolment',target:'enrollments'},{label:'Academic Registry',target:'school'}],
  learning: [{label:'Courses & Modules',target:'learning'},{label:'Assignments',target:'learning'},{label:'Learner Records',target:'school'},{label:'Course Catalogue',target:'courses'}],
  school: [{label:'School Registry',target:'school'},{label:'Classes & Subjects',target:'school'},{label:'Fee Structures',target:'finance'},{label:'Admissions',target:'enrollments'}],
  services: [{label:'Service Catalogue',target:'services'},{label:'Customer Orders',target:'orders'},{label:'Gallery & Media',target:'gallery'},{label:'Downloads',target:'downloads'}],
  enrollments: [{label:'Applications',target:'enrollments'},{label:'Student Accounts',target:'users'},{label:'Course Allocation',target:'courses'},{label:'Payment Receipts',target:'receipts'}],
  finance: [{label:'Finance Overview',target:'finance'},{label:'Payments & Cashouts',target:'finance'},{label:'Receipts',target:'receipts'},{label:'Service Orders',target:'orders'}],
  receipts: [{label:'Payment Receipts',target:'receipts'},{label:'Finance',target:'finance'},{label:'Admissions Payments',target:'enrollments'}],
  gallery: [{label:'Gallery',target:'gallery'},{label:'Documents',target:'downloads'},{label:'Site Branding',target:'settings',settingsTab:'site'}],
  downloads: [{label:'Documents',target:'downloads'},{label:'Gallery & Media',target:'gallery'},{label:'Service Catalogue',target:'services'}],
  orders: [{label:'Service Orders',target:'orders'},{label:'Service Catalogue',target:'services'},{label:'Payment Receipts',target:'receipts'}],
  users: [{label:'User Directory',target:'users'},{label:'Staff Applications',target:'enrollments'},{label:'Staff IDs',target:'settings',settingsTab:'staff-ids'},{label:'Access Settings',target:'settings',settingsTab:'site'}],
  settings: [{label:'Site Settings',target:'settings',settingsTab:'site'},{label:'Notifications',target:'settings',settingsTab:'notifications'},{label:'My Profile',target:'settings',settingsTab:'my-profile'},{label:'Geography',target:'settings',settingsTab:'geography'},{label:'Staff IDs',target:'settings',settingsTab:'staff-ids'}],
};

export function AdminPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Section>('overview');
  const [settingsTab, setSettingsTab] = useState<'site' | 'notifications' | 'my-profile' | 'geography' | 'staff-ids'>('site');
  const [profileSubTab, setProfileSubTab] = useState<'account' | 'personal' | 'employment' | 'location'>('account');
  const [profileSystemDetails, setProfileSystemDetails] = useState<Record<string, unknown>>({});
  const [profileLoadError, setProfileLoadError] = useState('');
  const [profileLoadWarning, setProfileLoadWarning] = useState('');
  const [profileReload, setProfileReload] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [services, setServices] = useState(initialServices);
  const [serviceName, setServiceName] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Cyber cafe');
  const [servicePrice, setServicePrice] = useState('');
  const [servicePriceAmount, setServicePriceAmount] = useState('');
  const [courseName, setCourseName] = useState('');
  const [coursePrice, setCoursePrice] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseDuration, setCourseDuration] = useState('4 Months');
  const [courseCategory, setCourseCategory] = useState<Course['category']>('Professional');
  const [courseLevel, setCourseLevel] = useState<Course['level']>('Beginner');
  const [courseImage, setCourseImage] = useState('');
  const [editingCourseId, setEditingCourseId] = useState('');
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoAssetId, setLogoAssetId] = useState('');
  const [galleryPreview, setGalleryPreview] = useState<string[]>([]);
  const [notifications, setNotifications] = useState({ newApplication: true, paymentUpdate: true, donation: true });
  const [schoolName, setSchoolName] = useState('NAVSTAR DIGITAL HUB');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState('480');
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [subLocationOptions, setSubLocationOptions] = useState<string[]>([]);
  const [newLocationOption, setNewLocationOption] = useState('');
  const [newSubLocationOption, setNewSubLocationOption] = useState('');
  const [backendReady, setBackendReady] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [user, setUser] = useState<PortalUser | null>(null);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('tutor');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserNationalId, setNewUserNationalId] = useState('');
  const [editingPortalUser, setEditingPortalUser] = useState<PortalUser | null>(null);
  const [editingGeo, setEditingGeo] = useState({ county: '', subCounty: '', ward: '', location: '', subLocation: '' });
  const [newUserCitizenship, setNewUserCitizenship] = useState('Kenyan');
  const [newUserGender, setNewUserGender] = useState('');
  const [newUserDateOfBirth, setNewUserDateOfBirth] = useState('');
  const [newUserEmploymentType, setNewUserEmploymentType] = useState('');
  const [newUserAddress, setNewUserAddress] = useState('');
  const [newUserCounty, setNewUserCounty] = useState('');
  const [newUserSubCounty, setNewUserSubCounty] = useState('');
  const [newUserWard, setNewUserWard] = useState('');
  const [newUserLocation, setNewUserLocation] = useState('');
  const [newUserSubLocation, setNewUserSubLocation] = useState('');
  const [newUserDepartment, setNewUserDepartment] = useState('');
  const [newUserJobTitle, setNewUserJobTitle] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [adminProfile, setAdminProfile] = useState<Record<string, string>>({ name: '', nationalId: '', phone: '', dateOfBirth: '', gender: '', citizenship: '', country: 'Kenya', province: '', county: '', subCounty: '', constituency: '', ward: '', location: '', subLocation: '', department: '', jobTitle: '', employmentType: '', joinedOn: '', address: '' });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [adminStaffId, setAdminStaffId] = useState('');
  const [applications, setApplications] = useState<Record<string, unknown>[]>([]);
  const [cashoutRequests, setCashoutRequests] = useState<Record<string, unknown>[]>([]);
  const [metrics, setMetrics] = useState<Record<string, unknown>>({});
  const [documents, setDocuments] = useState<{ id: string; title: string; description: string; originalName: string; sizeBytes: number; url: string }[]>([]);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [customerOrders, setCustomerOrders] = useState<{ id: string; reference: string; customerName: string; email: string; phone: string; amount: number; notes: string; status: string; createdAt: string; serviceName: string }[]>([]);
  const [learningCourses, setLearningCourses] = useState<LearningCourse[]>([]);
  const [learningTutors, setLearningTutors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [learningCourseId, setLearningCourseId] = useState('');
  const [learningModuleId, setLearningModuleId] = useState('');
  const [learningModuleTitle, setLearningModuleTitle] = useState('');
  const [learningModuleDescription, setLearningModuleDescription] = useState('');
  const [moduleImportRows, setModuleImportRows] = useState<{ title: string; description: string; status: string; sortOrder: number }[]>([]);
  const [moduleImportName, setModuleImportName] = useState('');
  const [serviceImportRows, setServiceImportRows] = useState<{ name: string; category: string; price: string; priceAmount: string }[]>([]);
  const [learnerImportRows, setLearnerImportRows] = useState<{ admissionNumber: string; firstName: string; middleName: string; lastName: string; classId: string; gender: string; dateOfBirth: string }[]>([]);
  const [learningLessonTitle, setLearningLessonTitle] = useState('');
  const [learningLessonContent, setLearningLessonContent] = useState('');
  const [learningLessonMinutes, setLearningLessonMinutes] = useState('15');
  const [learningAssignmentTitle, setLearningAssignmentTitle] = useState('');
  const [learningAssignmentInstructions, setLearningAssignmentInstructions] = useState('');
  const [learningAssignmentDue, setLearningAssignmentDue] = useState('');
  const [learningAssignmentMax, setLearningAssignmentMax] = useState('100');
  const [learningTutorId, setLearningTutorId] = useState('');
  const [learningGradePoints, setLearningGradePoints] = useState<Record<string, string>>({});
  const [learningFeedback, setLearningFeedback] = useState<Record<string, string>>({});
  const [schoolRecords, setSchoolRecords] = useState<SchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [schoolLearners, setSchoolLearners] = useState<SchoolLearner[]>([]);
  const [schoolSubjects, setSchoolSubjects] = useState<SchoolSubject[]>([]);
  const [schoolFees, setSchoolFees] = useState<SchoolFee[]>([]);
  const [institutionName, setInstitutionName] = useState('Navstar Digital Hub Computer School');
  const [institutionCode, setInstitutionCode] = useState('NAVSTAR-01');
  const [institutionType, setInstitutionType] = useState('college');
  const [institutionCurriculum, setInstitutionCurriculum] = useState('Professional ICT Training');
  const [academicYearName, setAcademicYearName] = useState(String(new Date().getFullYear()));
  const [academicYearStart, setAcademicYearStart] = useState(String(new Date().getFullYear())+'-01-01');
  const [academicYearEnd, setAcademicYearEnd] = useState(String(new Date().getFullYear())+'-12-31');
  const [newClassName, setNewClassName] = useState('');
  const [newClassStage, setNewClassStage] = useState('college');
  const [newClassGrade, setNewClassGrade] = useState('Certificate');
  const [newClassStream, setNewClassStream] = useState('');
  const [newLearnerAdmission, setNewLearnerAdmission] = useState('');
  const [newLearnerFirst, setNewLearnerFirst] = useState('');
  const [newLearnerMiddle, setNewLearnerMiddle] = useState('');
  const [newLearnerLast, setNewLearnerLast] = useState('');
  const [newLearnerClass, setNewLearnerClass] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectStage, setNewSubjectStage] = useState('college');
  const [newFeeName, setNewFeeName] = useState('');
  const [newFeeAmount, setNewFeeAmount] = useState('');
  const [newFeeProgramme, setNewFeeProgramme] = useState('');



  useEffect(() => {
    let active = true;
    const loadBackend = async () => {
      try {
        const healthResponse = await fetch('/api/health');
        if (!healthResponse.ok) { if (active) setSessionResolved(true); return; }
        const health = await healthResponse.json() as { databaseConfigured?: boolean };
        if (!active) return;
        if (!health.databaseConfigured) { setSessionResolved(true); return; }
        setBackendReady(true);

        const sessionResponse = await fetch('/api/auth/me');
        if (!sessionResponse.ok) { if (active) { setSessionResolved(true); navigate('/login?role=admin', { replace: true }); } return; }
        const session = await sessionResponse.json() as { user?: PortalUser };
        if (!session.user || !active) { if (active) { setSessionResolved(true); navigate('/login?role=admin', { replace: true }); } return; }
        if (session.user.role !== 'admin') { setSessionResolved(true); navigate('/portals/' + encodeURIComponent(session.user.role), { replace: true }); return; }
        setUser(session.user);
        setSessionResolved(true);

        const [courseResponse, serviceResponse, overviewResponse, userResponse, enrollmentResponse, cashoutResponse, settingsResponse, mediaResponse] = await Promise.all([
          fetch('/api/courses'), fetch('/api/services'), fetch('/api/admin/overview'), fetch('/api/admin/users'), fetch('/api/enrollments'), fetch('/api/admin/cashouts'), fetch('/api/admin/settings'), fetch('/api/admin/media'),
        ]);
        if (!active) return;
        if (overviewResponse.ok) setMetrics(await overviewResponse.json() as Record<string, unknown>);
        if (courseResponse.ok) {
          const result = await courseResponse.json() as { courses?: Course[] };
          if (result.courses) setCourses(result.courses);
        }
        if (serviceResponse.ok) {
          const result = await serviceResponse.json() as { services?: { id: string; name: string; category: string; price: string; status: string }[] };
          if (result.services) setServices(result.services.map((service) => ({ ...service, status: service.status === 'active' ? 'Active' : 'Paused' })));
        }
        if (userResponse.ok) {
          const result = await userResponse.json() as { users?: PortalUser[] };
          if (result.users) setPortalUsers(result.users);
        }
        if (enrollmentResponse.ok) {
          const result = await enrollmentResponse.json() as { enrollments?: Record<string, unknown>[] };
          if (result.enrollments) setApplications(result.enrollments);
        }
        if (cashoutResponse.ok) {
          const result = await cashoutResponse.json() as { requests?: Record<string, unknown>[] };
          if (result.requests) setCashoutRequests(result.requests);
        }
        if (settingsResponse.ok) {
          const result = await settingsResponse.json() as { settings?: { schoolName?: string; contactEmail?: string; contactPhone?: string; address?: string; logoAssetId?: string; sessionTimeoutMinutes?: number; locationOptions?: string[]; subLocationOptions?: string[] } };
          if (result.settings) {
            setSchoolName(result.settings.schoolName ?? 'NAVSTAR DIGITAL HUB');
            setContactEmail(result.settings.contactEmail ?? '');
            setContactPhone(result.settings.contactPhone ?? '');
            setSchoolAddress(result.settings.address ?? '');
            setSessionTimeoutMinutes(String(result.settings.sessionTimeoutMinutes ?? 480));
            setLocationOptions(Array.isArray(result.settings.locationOptions) ? result.settings.locationOptions : []);
            setSubLocationOptions(Array.isArray(result.settings.subLocationOptions) ? result.settings.subLocationOptions : []);
            setLogoAssetId(result.settings.logoAssetId ?? '');
            if (result.settings.logoAssetId) setLogoPreview(`/api/media/${result.settings.logoAssetId}`);
          }
        }
        const schoolResponse = await fetch('/api/admin/school');
        if (schoolResponse.ok) {
          const result = await schoolResponse.json() as { schools?: SchoolRecord[]; selectedSchoolId?: string; years?: SchoolYear[]; classes?: SchoolClass[]; learners?: SchoolLearner[]; subjects?: SchoolSubject[]; feeStructures?: SchoolFee[] };
          if (result.schools) setSchoolRecords(result.schools);
          if (result.selectedSchoolId) setSelectedSchoolId(result.selectedSchoolId);
          if (result.years) setSchoolYears(result.years);
          if (result.classes) setSchoolClasses(result.classes);
          if (result.learners) setSchoolLearners(result.learners);
          if (result.subjects) setSchoolSubjects(result.subjects);
          if (result.feeStructures) setSchoolFees(result.feeStructures);
        }
        const learningResponse = await fetch('/api/learning');
        if (learningResponse.ok) {
          const result = await learningResponse.json() as { courses?: LearningCourse[]; tutors?: { id: string; name: string; email: string }[] };
          if (result.courses) setLearningCourses(result.courses);
          if (result.tutors) setLearningTutors(result.tutors);
          if (result.courses?.length) setLearningCourseId(result.courses[0].id);
        }
        if (mediaResponse.ok) {
          const result = await mediaResponse.json() as { media?: { id: string; url: string; altText: string }[] };
          if (result.media) setGalleryPreview(result.media.map((asset) => asset.url));
        }
        if (!overviewResponse.ok) setNotice('Live database connected; some dashboard metrics are not available for this role.');
      } catch {
        if (active) { setSessionResolved(true); setNotice('Backend connection failed. Check Cloudflare Pages Functions and D1 binding.'); }
      }
    };
    void loadBackend();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'admin' || !backendReady) return;
    fetch('/api/admin/downloads').then(async (response) => response.ok ? response.json() as Promise<{ documents?: typeof documents }> : null)
      .then((result) => { if (result?.documents) setDocuments(result.documents); })
      .catch(() => undefined);
    fetch('/api/admin/service-requests').then(async (response) => response.ok ? response.json() as Promise<{ orders?: typeof customerOrders }> : null)
      .then((result) => { if (result?.orders) setCustomerOrders(result.orders); })
      .catch(() => undefined);
  }, [user, backendReady]);

  useEffect(() => {
    if (!backendReady || user?.role !== 'admin' || profileLoaded) return;
    fetch('/api/account/profile').then(async response => {
      const result = await response.json() as { profile?: Record<string, unknown>; error?: string; warning?: string };
      if (!response.ok || !result.profile) { setProfileLoadError(result.error || 'Your existing profile details could not be loaded. Please retry or contact Navstar support.'); return; }
      setProfileSystemDetails(result.profile);
      setProfileLoadError('');
      setProfileLoadWarning(result.warning || '');
      setAdminStaffId(String(result.profile.staffId ?? '').replace(/^AD-/, 'AD'));
      const next: Record<string, string> = {};
      Object.keys(adminProfile).forEach(key => { next[key] = String(result.profile?.[key] ?? ''); });
      setAdminProfile(next);
      setProfileLoaded(true);
    }).catch(() => setProfileLoadError('The profile service could not be reached. Your account has not been changed.'));
  }, [backendReady, user, profileLoaded, profileReload]);

  const saveAdminProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const response = await fetch('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...adminProfile, staffId: adminStaffId.replace(/^AD-/, 'AD') }) });
      const result = await response.json() as { error?: string; warning?: string; profile?: Record<string, unknown> };
      if (!response.ok || !result.profile) throw new Error(result.error || 'Profile could not be saved.');
      const saved = result.profile;
      setProfileSystemDetails(saved);
      setProfileLoadWarning(result.warning || '');
      setAdminProfile(current => ({ ...current, ...Object.fromEntries(Object.keys(current).map(key => [key, String(saved[key] ?? current[key] ?? '')])) }));
      setProfileLoaded(true);
      if (saved.staffId) {
        const savedStaffId = String(saved.staffId).replace(/^AD-/, 'AD');
        setAdminStaffId(savedStaffId);
        setUser(current => current ? { ...current, staffId: savedStaffId } : current);
      }
      setNotice('Saved successfully. Your Admin profile and staff ID are stored in the Navstar database and will remain available when you return.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Profile could not be saved. Please try again.');
    } finally {
      setProfileSaving(false);
    }
  };

  const readModuleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('The CSV must include a header row and at least one module row.');
      const headers = parsed[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
      const titleIndex = headers.indexOf('title');
      if (titleIndex < 0) throw new Error('The template must contain a title column.');
      const descriptionIndex = headers.indexOf('description');
      const statusIndex = headers.indexOf('status');
      const orderIndex = headers.indexOf('sortorder');
      const rows = parsed.slice(1).map((row, index) => ({
        title: row[titleIndex] || '',
        description: descriptionIndex >= 0 ? row[descriptionIndex] || '' : '',
        status: statusIndex >= 0 && row[statusIndex]?.toLowerCase() === 'published' ? 'published' : 'draft',
        sortOrder: orderIndex >= 0 && Number.isFinite(Number(row[orderIndex])) ? Number(row[orderIndex]) : index + 1,
      })).filter(row => row.title.trim());
      if (!rows.length) throw new Error('No valid module rows were found in that file.');
      if (rows.length > 100) throw new Error('Upload up to 100 modules at a time.');
      setModuleImportRows(rows);
      setModuleImportName(file.name);
      setNotice(`${rows.length} module rows are ready to import. Review the course selection before saving.`);
    } catch (error) {
      setModuleImportRows([]);
      setModuleImportName('');
      setNotice(error instanceof Error ? error.message : 'The module template could not be read.');
    }
  };

  const importModules = async () => {
    if (!learningCourseId || !moduleImportRows.length) { setNotice('Select a course and choose a completed module template first.'); return; }
    const saved = await submitLearningAction({ action: 'bulk_create_modules', courseId: learningCourseId, rows: moduleImportRows }, 'Modules imported and saved successfully.');
    if (saved) { setModuleImportRows([]); setModuleImportName(''); }
  };

  const readServiceImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('The service CSV needs a header and at least one row.');
      const headers = parsed[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
      const at = (key: string) => headers.indexOf(key);
      if (at('name') < 0 || at('category') < 0) throw new Error('The service template needs name and category columns.');
      const rows = parsed.slice(1).map(row => ({ name: row[at('name')] || '', category: row[at('category')] || '', price: at('price') >= 0 ? row[at('price')] || '' : '', priceAmount: at('priceamount') >= 0 ? row[at('priceamount')] || '' : '' })).filter(row => row.name.trim());
      if (!rows.length || rows.length > 100) throw new Error('Choose a file with 1–100 valid service rows.');
      setServiceImportRows(rows); setNotice(`${rows.length} service rows ready. Review before importing.`);
    } catch (error) { setServiceImportRows([]); setNotice(error instanceof Error ? error.message : 'Service template could not be read.'); }
  };

  const importServices = async () => {
    if (!serviceImportRows.length) return;
    try {
      const response = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_create_services', rows: serviceImportRows.map(row => ({ ...row, priceAmount: row.priceAmount || null })) }) });
      const result = await response.json() as { error?: string; services?: { id: string; name: string; category: string; price: string; priceAmount?: number | null; status: string }[]; imported?: number };
      if (!response.ok || !result.services) throw new Error(result.error || 'Service import was not saved.');
      setServices(current => [...current, ...result.services!.map(service => ({ ...service, status: 'Active' as const }))]);
      setServiceImportRows([]); setNotice(`${result.imported || result.services.length} services imported and saved successfully.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Service import failed.'); }
  };

  const readLearnerImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('The student CSV needs a header and at least one row.');
      const headers = parsed[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
      const at = (key: string) => headers.indexOf(key);
      if (['admissionnumber','firstname','lastname'].some(key => at(key) < 0)) throw new Error('The student template needs admissionNumber, firstName and lastName columns.');
      const rows = parsed.slice(1).map(row => ({ admissionNumber: row[at('admissionnumber')] || '', firstName: row[at('firstname')] || '', middleName: at('middlename') >= 0 ? row[at('middlename')] || '' : '', lastName: row[at('lastname')] || '', classId: at('classid') >= 0 ? row[at('classid')] || '' : '', gender: at('gender') >= 0 ? row[at('gender')] || '' : '', dateOfBirth: at('dateofbirth') >= 0 ? row[at('dateofbirth')] || '' : '' })).filter(row => row.admissionNumber.trim());
      if (!rows.length || rows.length > 100) throw new Error('Choose a file with 1–100 valid student rows.');
      setLearnerImportRows(rows); setNotice(`${rows.length} student rows ready. Confirm the institution before importing.`);
    } catch (error) { setLearnerImportRows([]); setNotice(error instanceof Error ? error.message : 'Student template could not be read.'); }
  };

  const importLearners = async () => {
    if (!selectedSchoolId || !learnerImportRows.length) { setNotice('Select an institution and choose a completed student template first.'); return; }
    const saved = await submitSchoolAction({ action: 'bulk_create_learners', schoolId: selectedSchoolId, rows: learnerImportRows }, 'Student records imported and saved successfully.');
    if (saved) setLearnerImportRows([]);
  };

  const exportLearningModules = (format: 'excel' | 'word' | 'pdf') => {
    const rows = learningCourses.flatMap(course => course.modules.map(module => ({
      Course: course.title, Title: module.title, Description: module.description, Status: module.status,
      Lessons: module.lessons.length, 'Sort order': module.sort_order,
    })));
    try { exportBrandedData(format, 'Learning Modules Register', ['Course', 'Title', 'Description', 'Status', 'Lessons', 'Sort order'], rows); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be created.'); }
  };

  const exportServices = (format: 'excel' | 'word' | 'pdf') => {
    const rows = services.map(service => ({ Name: service.name, Category: service.category, Price: service.price, 'Online amount (KSh)': service.priceAmount ?? '', Status: service.status }));
    try { exportBrandedData(format, 'Service Catalogue', ['Name', 'Category', 'Price', 'Online amount (KSh)', 'Status'], rows); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be created.'); }
  };

  const exportLearners = (format: 'excel' | 'word' | 'pdf') => {
    const rows = schoolLearners.map(learner => ({ 'Admission number': learner.admission_number, 'First name': learner.first_name, 'Middle name': learner.middle_name || '', 'Last name': learner.last_name, Class: learner.class_name || '', Status: learner.status }));
    try { exportBrandedData(format, 'Student Register', ['Admission number', 'First name', 'Middle name', 'Last name', 'Class', 'Status'], rows); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be created.'); }
  };

  const exportMarks = (format: 'excel' | 'word' | 'pdf') => {
    const rows = learningCourses.flatMap(course => course.assignments.flatMap(assignment => (assignment.submissions || []).map(submission => ({
      Course: course.title, Assessment: assignment.title, Learner: submission.learner_name,
      Score: submission.points_awarded ?? '', 'Maximum score': assignment.max_points,
      Status: submission.status, Feedback: submission.feedback || '',
    }))));
    try { exportBrandedData(format, 'Assessment and Marks Register', ['Course', 'Assessment', 'Learner', 'Score', 'Maximum score', 'Status', 'Feedback'], rows); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be created.'); }
  };

  const submitLearningAction = async (payload: Record<string, unknown>, success: string) => {
    try {
      const response = await fetch('/api/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Learning management action failed.');
      const refresh = await fetch('/api/learning');
      if (refresh.ok) {
        const data = await refresh.json() as { courses?: LearningCourse[]; tutors?: { id: string; name: string; email: string }[] };
        if (data.courses) setLearningCourses(data.courses);
        if (data.tutors) setLearningTutors(data.tutors);
      }
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Learning management action failed.');
      return false;
    }
  };

  const refreshSchoolRecords = async (schoolId = selectedSchoolId) => {
    const response = await fetch('/api/admin/school' + (schoolId ? '?schoolId=' + encodeURIComponent(schoolId) : ''));
    const result = await response.json() as { schools?: SchoolRecord[]; selectedSchoolId?: string; years?: SchoolYear[]; classes?: SchoolClass[]; learners?: SchoolLearner[]; subjects?: SchoolSubject[]; feeStructures?: SchoolFee[]; error?: string };
    if (!response.ok) { setNotice(result.error || 'School records could not be loaded.'); return; }
    setSchoolRecords(result.schools ?? []);
    setSelectedSchoolId(result.selectedSchoolId ?? '');
    setSchoolYears(result.years ?? []);
    setSchoolClasses(result.classes ?? []);
    setSchoolLearners(result.learners ?? []);
    setSchoolSubjects(result.subjects ?? []);
    setSchoolFees(result.feeStructures ?? []);
  };

  const submitSchoolAction = async (payload: Record<string, unknown>, success: string) => {
    try {
      const response = await fetch('/api/admin/school', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error || 'School management action failed.');
      if (payload.action === 'create_school' && result.id) await refreshSchoolRecords(result.id);
      else await refreshSchoolRecords();
      setNotice(success);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'School management action failed.');
      return false;
    }
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!documentFile || !backendReady) { setNotice('Choose a file and ensure document storage is connected.'); return; }
    const form = new FormData();
    form.set('file', documentFile);
    form.set('title', documentTitle || documentFile.name);
    form.set('description', documentDescription);
    const response = await fetch('/api/admin/downloads', { method: 'POST', body: form });
    const result = await response.json() as { id?: string; title?: string; description?: string; originalName?: string; sizeBytes?: number; url?: string; error?: string };
    if (!response.ok || !result.id) { setNotice(result.error ?? 'Document upload failed.'); return; }
    setDocuments((current) => [{ id: result.id!, title: result.title ?? documentFile.name, description: result.description ?? '', originalName: result.originalName ?? documentFile.name, sizeBytes: result.sizeBytes ?? documentFile.size, url: result.url ?? `/api/downloads/${result.id}` }, ...current]);
    setDocumentTitle(''); setDocumentDescription(''); setDocumentFile(null);
    const input = document.getElementById('admin-document-file') as HTMLInputElement | null;
    if (input) input.value = '';
    setNotice('Document uploaded and published to public downloads.');
  };

  const updateOrderStatus = async (id: string, status: string) => {
    const response = await fetch(`/api/admin/service-requests/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error ?? 'Order status could not be updated.'); return; }
    setCustomerOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    setNotice('Customer order updated.');
  };

  const deleteDocument = async (id: string) => {
    const response = await fetch(`/api/admin/downloads/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error ?? 'Document could not be deleted.'); return; }
    setDocuments((current) => current.filter((item) => item.id !== id));
    setNotice('Document removed from public downloads.');
  };

  const addService = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!serviceName.trim()) return;
    const payload = { name: serviceName.trim(), category: serviceCategory, price: servicePrice.trim() || 'Contact us', priceAmount: servicePriceAmount ? Number(servicePriceAmount) : null };
    if (payload.priceAmount !== null && (!Number.isSafeInteger(payload.priceAmount) || payload.priceAmount < 1 || payload.priceAmount > 150000)) { setNotice('Enter a valid fixed online payment amount.'); return; }
    if (backendReady) {
      const response = await fetch('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { id?: string; reference?: string; priceAmount?: number | null; amount?: number; status?: string; error?: string };
      if (!response.ok || !result.id) { setNotice(result.error ?? 'Service could not be saved.'); return; }
      setServices((current) => [...current, { id: result.id!, ...payload, priceAmount: result.priceAmount, status: 'Active' }]);
      setNotice('Service published successfully.');
    } else {
      setServices((current) => [...current, { id: crypto.randomUUID(), ...payload, status: 'Active' }]);
      setNotice('Service added to this preview only. Connect Cloudflare Pages Functions and D1 to publish it.');
    }
    setServiceName('');
    setServicePrice('');
  };

  const updateApplicationStatus = async (applicationId: string, status: string) => {
    try {
      const response = await fetch(`/api/enrollments/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error ?? 'Application status could not be updated.');
      setApplications((current) => current.map((item) => item.id === applicationId ? { ...item, status: result.status ?? status } : item));
      setNotice(status === 'accepted' ? 'Application accepted. The learner can now access the course in the Learning Workspace.' : 'Application status updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Application status could not be updated.');
    }
  };

  const addCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!courseName.trim() || Number(coursePrice) < 1) return;
    const payload = { title: courseName.trim(), description: courseDescription.trim(), duration: courseDuration.trim(), image: courseImage.trim(), category: courseCategory, level: courseLevel, price: Number(coursePrice) };
    if (backendReady) {
      const response = await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { id?: string; error?: string };
      if (!response.ok || !result.id) { setNotice(result.error ?? 'Course could not be saved.'); return; }
      setCourses((current) => [...current, { ...payload, id: result.id! }]);
      setNotice('Course published successfully.');
    } else {
      setCourses((current) => [...current, { ...payload, id: crypto.randomUUID() }]);
      setNotice('Course draft added to this preview only.');
    }
    setCourseName('');
    setCoursePrice('');
    setCourseDescription('');
    setCourseDuration('4 Months');
    setCourseCategory('Professional');
    setCourseLevel('Beginner');
    setCourseImage('');
  };

  const editCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setCourseName(course.title);
    setCoursePrice(String(course.price));
    setCourseDescription(course.description);
    setCourseDuration(course.duration);
    setCourseCategory(course.category);
    setCourseLevel(course.level ?? 'Beginner');
    setCourseImage(course.image);
    setActive('courses');
    setNotice('Editing course. Update the fields above and save your changes.');
  };

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCourseId || !courseName.trim() || !Number.isSafeInteger(Number(coursePrice)) || Number(coursePrice) < 0) return;
    const payload = { title: courseName.trim(), description: courseDescription.trim(), duration: courseDuration.trim(), image: courseImage.trim(), category: courseCategory, level: courseLevel, price: Number(coursePrice) };
    if (backendReady) {
      const response = await fetch(`/api/courses/${encodeURIComponent(editingCourseId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setNotice(result.error ?? 'Course could not be updated.'); return; }
    }
    setCourses((current) => current.map((course) => course.id === editingCourseId ? { ...course, ...payload } : course));
    setNotice(backendReady ? 'Course updated and published.' : 'Course updated in this preview only.');
    setEditingCourseId(''); setCourseName(''); setCoursePrice(''); setCourseDescription(''); setCourseDuration('4 Months'); setCourseCategory('Professional'); setCourseLevel('Beginner'); setCourseImage('');
  };

  const cancelCourseEdit = () => { setEditingCourseId(''); setCourseName(''); setCoursePrice(''); setCourseDescription(''); setCourseDuration('4 Months'); setCourseCategory('Professional'); setCourseLevel('Beginner'); setCourseImage(''); };

  const removeCourse = async (courseId: string) => {
    if (backendReady) {
      const response = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setNotice(result.error ?? 'Course could not be archived.'); return; }
    }
    setCourses((current) => current.filter((item) => item.id !== courseId));
    setNotice(backendReady ? 'Course archived.' : 'Course removed from this preview only.');
  };

  const removeService = async (serviceId: string) => {
    if (backendReady) {
      const response = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setNotice(result.error ?? 'Service could not be paused.'); return; }
    }
    setServices((current) => current.filter((item) => item.id !== serviceId));
    setNotice(backendReady ? 'Service paused.' : 'Service removed from this preview only.');
  };

  const startCashout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/admin/cashouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(cashoutAmount) }),
      });
      const result = await response.json() as { id?: string; amount?: number; status?: string; error?: string };
      if (!response.ok || !result.id) throw new Error(result.error ?? 'Cashout request was not accepted.');
      setCashoutRequests((current) => [{ id: result.id, amount: result.amount, status: result.status, created_at: new Date().toISOString() }, ...current]);
      setNotice('Cashout request submitted for approval. No money was transferred.');
      setCashoutAmount('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cashout request failed.');
    }
  };

  const createPortalUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTemporaryPassword('');
    if (newUserPassword.length < 6 || !/[a-z]/.test(newUserPassword) || !/[A-Z]/.test(newUserPassword) || !/[0-9]/.test(newUserPassword)) {
      setNotice('Password must be at least 6 characters and include uppercase, lowercase and a number.');
      return;
    }
    if (newUserPassword !== newUserConfirmPassword) {
      setNotice('The passwords do not match.');
      return;
    }
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName, email: newUserEmail, role: newUserRole, password: newUserPassword,
          confirmPassword: newUserConfirmPassword, phone: newUserPhone, nationalId: newUserNationalId, citizenship: newUserCitizenship,
          gender: newUserGender, dateOfBirth: newUserDateOfBirth, employmentType: newUserEmploymentType, address: newUserAddress,
          country: 'Kenya', county: newUserCounty, subCounty: newUserSubCounty, ward: newUserWard,
          location: newUserLocation, subLocation: newUserSubLocation, department: newUserDepartment, jobTitle: newUserJobTitle
        }),
      });
      const result = await readApiResponse<{ user?: PortalUser; error?: string }>(response);
      if (!response.ok || !result.user) throw new Error(result.error ?? 'Account could not be created.');
      setPortalUsers((current) => [result.user!, ...current]);
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword(''); setNewUserConfirmPassword('');
      setNewUserPhone(''); setNewUserNationalId(''); setNewUserGender(''); setNewUserDateOfBirth(''); setNewUserEmploymentType(''); setNewUserAddress(''); setNewUserCounty(''); setNewUserSubCounty(''); setNewUserWard(''); setNewUserLocation(''); setNewUserSubLocation(''); setNewUserDepartment(''); setNewUserJobTitle('');
      setNotice(`Account created successfully. Staff ID: ${result.user.staffId || 'assigned'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Account could not be created.');
    }
  };

  const reviewCashout = async (requestId: string, status: 'approved' | 'rejected') => {
    const response = await fetch(`/api/admin/cashouts/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error ?? 'Cashout review failed.'); return; }
    setCashoutRequests((current) => current.map((item) => item.id === requestId ? { ...item, status } : item));
    setNotice(`Cashout request ${status}. This records approval only; it does not transfer money.`);
  };

  const setImage = async (event: ChangeEvent<HTMLInputElement>, target: 'logo' | 'gallery') => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, target === 'logo' ? 1 : 8);
    if (backendReady) {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('altText', target === 'logo' ? 'NAVSTAR DIGITAL HUB logo' : file.name);
        const response = await fetch('/api/admin/media', { method: 'POST', body: formData });
        const result = await response.json() as { id?: string; url?: string; error?: string };
        if (!response.ok || !result.id || !result.url) { setNotice(result.error ?? 'Image upload failed.'); return; }
        if (target === 'logo') {
          setLogoAssetId(result.id);
          setLogoPreview(result.url);
        } else {
          setGalleryPreview((current) => [...current, result.url!].slice(-8));
        }
      }
      setNotice('Image uploaded to NAVSTAR media storage. Save site settings to publish a new logo.');
      return;
    }
    const previews = files.map((file) => URL.createObjectURL(file));
    if (target === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(previews[0] ?? '');
      setNotice('Logo preview selected. Connect secure media storage to publish it.');
    } else {
      setGalleryPreview((current) => [...current, ...previews].slice(-8));
      setNotice('Gallery previews selected. Connect secure media storage to publish them.');
    }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (settingsSaving) return;
    setSettingsSaving(true);
    if (!backendReady) {
      setNotice('Settings are shown in this browser preview only; connect the backend and sign in to save site-wide changes.');
      return;
    }
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolName, contactEmail, contactPhone, address: schoolAddress, logoAssetId, sessionTimeoutMinutes: Number(sessionTimeoutMinutes), locationOptions, subLocationOptions }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Settings could not be saved.');
      setNotice('Saved successfully. Your settings and geography dropdowns are now stored in the Navstar database.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Settings could not be saved. Please try again.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePortalUserEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPortalUser) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get('name') ?? ''), role: String(form.get('role') ?? ''),
      nationalId: String(form.get('nationalId') ?? ''), phone: String(form.get('phone') ?? ''),
      citizenship: String(form.get('citizenship') ?? ''), gender: String(form.get('gender') ?? ''), dateOfBirth: String(form.get('dateOfBirth') ?? ''), country: 'Kenya',
      county: editingGeo.county, subCounty: editingGeo.subCounty, constituency: editingGeo.subCounty, ward: editingGeo.ward, location: editingGeo.location, subLocation: editingGeo.subLocation,
      address: String(form.get('address') ?? ''), department: String(form.get('department') ?? ''), jobTitle: String(form.get('jobTitle') ?? ''),
      employmentType: String(form.get('employmentType') ?? ''), joinedOn: String(form.get('joinedOn') ?? ''),
    };
    const response = await fetch(`/api/admin/users/${encodeURIComponent(editingPortalUser.id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error || 'User profile could not be updated.'); return; }
    setPortalUsers(current => current.map(item => item.id === editingPortalUser.id ? { ...item, ...payload } : item));
    setEditingPortalUser(null);
    setNotice('User profile updated successfully.');
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    navigate('/login?role=admin', { replace: true });
  };

  const title = sections.find((section) => section.id === active)?.label ?? 'Overview';

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [active, settingsTab]);

  if (!sessionResolved) {
    return <main className="flex min-h-screen items-center justify-center bg-[#080d19] text-white"><div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#171d2b] px-6 py-5"><span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent"/><span className="text-sm font-semibold">Checking your secure Admin session…</span></div></main>;
  }

  if (!user || user.role !== 'admin') {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 py-12">
        <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">NAVSTAR DIGITAL HUB</p>
          <h1 className="mt-3 text-2xl font-black text-slate-950">Administrator sign-in required</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">This workspace is restricted to authorised administrators. Sign in directly to the Admin Portal to continue.</p>
          <a href="/login?role=admin" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">Continue to Admin Login</a>
        </section>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-[#080d19] text-slate-100 navstar-admin">
      <div className={'mx-auto grid h-screen max-w-[1800px] grid-cols-1 grid-rows-[4rem_minmax(0,1fr)] overflow-hidden md:grid-rows-1 ' + (sidebarCollapsed ? 'md:grid-cols-[76px_minmax(0,1fr)]' : 'md:grid-cols-[250px_minmax(0,1fr)]')}>
        <aside className="navstar-admin-sidebar sticky top-0 z-40 flex h-16 min-w-0 flex-row border-b border-white/10 bg-[#0b2348] text-white md:h-screen md:flex-col md:border-b-0 md:border-r">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-3 md:px-5 md:py-5"><div className={sidebarCollapsed ? "md:hidden" : "flex items-center gap-3"}><img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub" className="h-10 w-10 rounded-lg bg-white object-contain p-1"/><div><h1 className="text-base font-extrabold">Admin Portal</h1><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">NAVSTAR DIGITAL HUB</p><p className="text-[9px] text-emerald-300">● Online</p></div></div><button type="button" onClick={() => setSidebarCollapsed((value) => !value)} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 hover:text-white md:inline-flex" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>{sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</button></div>
          <nav aria-label="Admin sections" className="flex min-w-0 flex-1 gap-1 overflow-x-auto p-2 md:min-h-0 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:space-y-1 md:p-3">
            {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { setActive(id); setNotice(''); }} aria-current={active === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 px-3 py-2.5 text-left text-sm md:w-full ${active === id ? 'bg-emerald-800 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon className="h-4 w-4 shrink-0" /><span className={sidebarCollapsed ? "md:hidden" : ""}>{label}</span></button>)}
          </nav>
          <div className="hidden border-t border-white/10 p-4 text-xs leading-5 text-slate-400 md:block">Preview dashboard. Live records and actions require authenticated server access.</div>
        </aside>

        <section ref={contentRef} className="navstar-admin-content h-full min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 lg:px-7">
          <header className="navstar-admin-topbar mb-5 flex flex-col gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{formatEATDateTime(new Date().toISOString())} · NAVSTAR DIGITAL HUB</p><h2 className="mt-1 text-xl font-extrabold text-white">Welcome back, {user.name} 👋</h2><p className="mt-1 text-xs text-slate-400">Admin Portal / {title}</p></div>
              <span className={`inline-flex w-fit items-center gap-2 border px-3 py-2 text-xs font-semibold ${backendReady && user ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}><ShieldAlert className="h-4 w-4" />{backendReady && user ? `Connected · ${user.role}` : 'Preview mode · backend not connected'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/portals/notifications" className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Bell className="h-4 w-4"/>Notifications</Link>
              <button type="button" onClick={() => { setSettingsTab('my-profile'); setActive('settings'); setNotice(''); }} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4"/>Settings · My Profile</button>
              <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"><LogOut className="h-4 w-4"/>Log out</button>
            </div>
          </header>

          <nav aria-label="Admin workspace subtabs" className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#111a2b] p-2">
            {sectionSubtabs[active].map((tab, index) => <button key={tab.label} type="button" onClick={() => { setActive(tab.target); if (tab.settingsTab) setSettingsTab(tab.settingsTab); setNotice(''); }} aria-current={tab.target === active && (!tab.settingsTab || tab.settingsTab === settingsTab) ? 'page' : undefined} className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab.target === active && (!tab.settingsTab || tab.settingsTab === settingsTab) ? 'bg-blue-700 text-white shadow-lg shadow-blue-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>{tab.label}</button>)}
          </nav>

          {notice && <p role="status" className="mb-5 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</p>}

          {active === 'overview' && <div className="space-y-5"><div className="navstar-admin-hero mb-5 flex min-h-[138px] items-center justify-between overflow-hidden rounded-2xl border border-blue-400/20 px-6 py-5 sm:px-8"><div className="relative z-10 max-w-xl"><p className="text-[10px] font-extrabold uppercase tracking-[.32em] text-cyan-300">NAVSTAR DIGITAL HUB</p><h3 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Learn. Create. Innovate. Grow.</h3><p className="mt-2 text-sm font-medium text-blue-100">HOME OF TECHNOCRATS</p></div><div className="relative z-10 hidden text-right sm:block"><p className="text-xs font-bold uppercase tracking-[.24em] text-white/90">Your digital command centre</p><p className="mt-2 text-xs text-blue-100">Education · Technology · Innovation</p></div></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
            ['Students', String(metrics.students ?? '—'), 'Registered student accounts'], ['Applications', String(metrics.applications ?? applications.length), 'Admissions queue'], ['Courses', String(metrics.courses ?? courses.length), 'Active courses'], ['Services', String(metrics.services ?? services.length), 'Active cyber services'],
          ].map(([label, value, caption]) => <div key={label} className="navstar-admin-stat rounded-2xl border border-white/10 bg-[#171d2b] p-4"><p className="text-xs font-medium text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p><p className="mt-1 text-[11px] text-slate-400">{caption}</p></div>)}</div><div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><section className="navstar-admin-panel rounded-2xl border border-white/10 bg-[#171d2b] p-5"><h3 className="font-bold text-slate-950">Workspace summary</h3><p className="mt-2 text-sm leading-6 text-slate-600">Use the navigation and subtabs to manage learning, admissions, finance, services, staff records and system settings. Live actions are saved by the connected Navstar services; items marked as previews are not published until saved.</p><div className="mt-5 grid gap-2 sm:grid-cols-2">{sections.slice(1).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActive(id)} className="flex items-center justify-between border p-3 text-left text-sm font-medium hover:bg-slate-50"><span className="flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-800" />{label}</span><span aria-hidden="true">›</span></button>)}</div></section><section className="navstar-admin-panel rounded-2xl border border-white/10 bg-[#171d2b] p-5"><h3 className="font-bold text-white">Important setup</h3><ul className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><li className="border-l-2 border-amber-500 pl-3">Rotate the Daraja production credentials shared in chat.</li><li className="border-l-2 border-emerald-700 pl-3">Keep all Daraja secrets in server environment variables only.</li><li className="border-l-2 border-emerald-700 pl-3">Protect admin actions with verified staff roles and audit logs.</li></ul></section></div></div>}

          {active === 'courses' && <div className="space-y-5"><form onSubmit={editingCourseId ? saveCourse : addCourse} className="grid gap-3 border bg-white p-4 sm:grid-cols-2 xl:grid-cols-3"><div className="space-y-2 sm:col-span-2 xl:col-span-3"><h3 className="font-bold text-slate-950">{editingCourseId ? 'Edit course details' : 'Add a new course'}</h3><p className="text-xs text-slate-500">All fees are whole Kenyan shillings for M-Pesa payment compatibility.</p></div><div className="space-y-2"><Label htmlFor="new-course">Course title</Label><Input id="new-course" value={courseName} onChange={(event) => setCourseName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="new-course-price">Fee (KSh)</Label><Input id="new-course-price" type="number" min="0" step="1" value={coursePrice} onChange={(event) => setCoursePrice(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="course-duration">Duration</Label><Input id="course-duration" value={courseDuration} onChange={(event) => setCourseDuration(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="course-category">Category</Label><select id="course-category" value={courseCategory} onChange={(event) => setCourseCategory(event.target.value as Course['category'])} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option>Professional</option><option>Computer School</option><option>Cyber Services</option></select></div><div className="space-y-2"><Label htmlFor="course-image">Course image URL</Label><Input id="course-image" value={courseImage} onChange={(event) => setCourseImage(event.target.value)} placeholder="https://..." /></div><div className="space-y-2"><Label htmlFor="course-level">Course level</Label><select id="course-level" value={courseLevel} onChange={(event) => setCourseLevel(event.target.value as Course['level'])} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label htmlFor="course-description">Course description</Label><textarea id="course-description" value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></div><div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><Button type="submit" className="bg-emerald-800 hover:bg-emerald-900">{editingCourseId ? <><Save className="mr-2 h-4 w-4" />Save course</> : <><Plus className="mr-2 h-4 w-4" />Add course</>}</Button>{editingCourseId && <Button type="button" variant="outline" onClick={cancelCourseEdit}>Cancel edit</Button>}</div></form><div className="overflow-x-auto border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Course</th><th className="p-3">Category</th><th className="p-3">Duration</th><th className="p-3">Fee</th><th className="p-3">Actions</th></tr></thead><tbody>{courses.map((course) => <tr key={course.id} className="border-b last:border-0"><td className="p-3 font-semibold text-slate-900">{course.title}<p className="mt-1 max-w-md text-xs font-normal text-slate-500">{course.description}</p></td><td className="p-3">{course.category}</td><td className="p-3">{course.duration}</td><td className="p-3">KSh {course.price.toLocaleString()}</td><td className="p-3"><div className="flex items-center gap-3"><button aria-label={`Edit ${course.title}`} className="text-blue-700 hover:text-blue-900" onClick={() => editCourse(course)}><Pencil className="h-4 w-4" /></button><button aria-label={`Archive ${course.title}`} className="text-slate-500 hover:text-red-700" onClick={() => void removeCourse(course.id)}><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div></div>}

          {active === 'school' && <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">School ERP and Computer School Registry</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Manage the training institution, academic years, classes or cohorts, learner admissions, subjects and fee structures. This registry is separate from public website course applications and preserves those existing records.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">KSh · East Africa</span></div>
              {schoolRecords.length>0&&<div className="mt-4 space-y-2"><Label>Active institution workspace</Label><select value={selectedSchoolId} onChange={async e=>{setSelectedSchoolId(e.target.value);await refreshSchoolRecords(e.target.value);}} className="h-11 w-full rounded-md border bg-white px-3 text-sm">{schoolRecords.map(x=><option key={x.id} value={x.id}>{x.name} · {x.school_code}</option>)}</select></div>}
              <div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Academic years</p><p className="mt-1 text-2xl font-bold">{schoolYears.length}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Classes / cohorts</p><p className="mt-1 text-2xl font-bold">{schoolClasses.length}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Learners registered</p><p className="mt-1 text-2xl font-bold">{schoolLearners.length}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Subjects / units</p><p className="mt-1 text-2xl font-bold">{schoolSubjects.length}</p></div></div>
            </section>
            {schoolRecords.length===0&&<form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_school',name:institutionName,schoolCode:institutionCode,schoolType:institutionType,curriculum:institutionCurriculum},'Computer school institution registered.');if(ok)setInstitutionName('Navstar Digital Hub Computer School');}} className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2"><div className="sm:col-span-2"><h3 className="font-bold">Register the computer school workspace</h3><p className="mt-1 text-sm text-slate-600">This creates a separate institution record for the School ERP. It does not modify your public Navstar website or existing student accounts.</p></div><div className="space-y-2"><Label>Institution name</Label><Input value={institutionName} onChange={e=>setInstitutionName(e.target.value)} required /></div><div className="space-y-2"><Label>Unique institution code</Label><Input value={institutionCode} onChange={e=>setInstitutionCode(e.target.value.toUpperCase())} minLength={3} maxLength={24} required /></div><div className="space-y-2"><Label>Institution type</Label><select value={institutionType} onChange={e=>setInstitutionType(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="college">College / computer school</option><option value="mixed">Mixed institution</option><option value="other">Other</option></select></div><div className="space-y-2"><Label>Curriculum / training framework</Label><Input value={institutionCurriculum} onChange={e=>setInstitutionCurriculum(e.target.value)} /></div><div className="sm:col-span-2"><Button type="submit" disabled={!backendReady||user?.role!=='admin'} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-2 h-4 w-4"/>Create institution workspace</Button></div></form>}
            {selectedSchoolId&&<div className="grid gap-5 xl:grid-cols-2">
              <form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_year',schoolId:selectedSchoolId,name:academicYearName,startDate:academicYearStart,endDate:academicYearEnd,isCurrent:true},'Academic year created and set as current.');if(ok)setAcademicYearName('');}} className="space-y-4 rounded-2xl border bg-white p-5"><h3 className="font-bold">1. Academic calendar</h3><p className="text-xs text-slate-500">Set academic years for cohorts, classes and fees.</p><div className="space-y-2"><Label>Academic year name</Label><Input value={academicYearName} onChange={e=>setAcademicYearName(e.target.value)} required /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Start date</Label><Input type="date" value={academicYearStart} onChange={e=>setAcademicYearStart(e.target.value)} required /></div><div className="space-y-2"><Label>End date</Label><Input type="date" value={academicYearEnd} onChange={e=>setAcademicYearEnd(e.target.value)} required /></div></div><Button type="submit" disabled={!backendReady||!selectedSchoolId} className="bg-blue-800 hover:bg-blue-900">Add academic year</Button><div className="divide-y border">{schoolYears.map(y=><div key={y.id} className="flex justify-between gap-2 p-3 text-sm"><span>{y.name} · {y.start_date} to {y.end_date}</span><span className="text-xs font-bold text-emerald-700">{y.is_current?'CURRENT':''}</span></div>)}</div></form>
              <form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_class',schoolId:selectedSchoolId,academicYearId:schoolYears.find(y=>y.is_current)?.id||schoolYears[0]?.id,name:newClassName,educationStage:newClassStage,gradeLevel:newClassGrade,stream:newClassStream},'Class or training cohort created.');if(ok){setNewClassName('');setNewClassStream('');}}} className="space-y-4 rounded-2xl border bg-white p-5"><h3 className="font-bold">2. Classes and training cohorts</h3><p className="text-xs text-slate-500">For example: Computer Packages — April Intake, Python Programming — Evening Class.</p><div className="space-y-2"><Label>Class / cohort name</Label><Input value={newClassName} onChange={e=>setNewClassName(e.target.value)} required /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Education stage</Label><select value={newClassStage} onChange={e=>setNewClassStage(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="college">College / training</option><option value="junior_secondary">Junior secondary</option><option value="senior_secondary">Senior secondary</option><option value="primary">Primary</option><option value="other">Other</option></select></div><div className="space-y-2"><Label>Level / grade</Label><Input value={newClassGrade} onChange={e=>setNewClassGrade(e.target.value)} placeholder="Certificate, Beginner, Level 1" required /></div></div><div className="space-y-2"><Label>Stream / study mode</Label><Input value={newClassStream} onChange={e=>setNewClassStream(e.target.value)} placeholder="Morning, Evening, Weekend, Online" /></div><Button type="submit" disabled={!backendReady||!schoolYears.length||!newClassName.trim()} className="bg-blue-800 hover:bg-blue-900">Create class / cohort</Button><div className="divide-y border">{schoolClasses.map(c=><div key={c.id} className="p-3 text-sm"><p className="font-semibold">{c.name} {c.stream&&'· '+c.stream}</p><p className="text-xs text-slate-500">{c.grade_level} · {c.education_stage} · {c.academic_year}</p></div>)}</div></form>
              <form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_learner',schoolId:selectedSchoolId,admissionNumber:newLearnerAdmission,firstName:newLearnerFirst,middleName:newLearnerMiddle,lastName:newLearnerLast,classId:newLearnerClass},'Learner registered in the School ERP.');if(ok){setNewLearnerAdmission('');setNewLearnerFirst('');setNewLearnerMiddle('');setNewLearnerLast('');}}} className="space-y-4 rounded-2xl border bg-white p-5"><h3 className="font-bold">3. Learner admission register</h3><p className="text-xs text-slate-500">Create an institutional admission record with a unique admission number.</p><div className="space-y-2"><Label>Admission number</Label><Input value={newLearnerAdmission} onChange={e=>setNewLearnerAdmission(e.target.value)} placeholder="e.g. NDH/2026/001" required /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>First name</Label><Input value={newLearnerFirst} onChange={e=>setNewLearnerFirst(e.target.value)} required /></div><div className="space-y-2"><Label>Middle name</Label><Input value={newLearnerMiddle} onChange={e=>setNewLearnerMiddle(e.target.value)} /></div><div className="space-y-2"><Label>Surname</Label><Input value={newLearnerLast} onChange={e=>setNewLearnerLast(e.target.value)} required /></div><div className="space-y-2"><Label>Assign class / cohort</Label><select value={newLearnerClass} onChange={e=>setNewLearnerClass(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Unassigned</option>{schoolClasses.map(c=><option key={c.id} value={c.id}>{c.name} · {c.stream}</option>)}</select></div></div><Button type="submit" disabled={!backendReady||!newLearnerAdmission.trim()||!newLearnerFirst.trim()||!newLearnerLast.trim()} className="bg-blue-800 hover:bg-blue-900">Register learner</Button></form>
              <form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_subject',schoolId:selectedSchoolId,name:newSubjectName,code:newSubjectCode,educationStage:newSubjectStage},'Subject or training unit added.');if(ok){setNewSubjectName('');setNewSubjectCode('');}}} className="space-y-4 rounded-2xl border bg-white p-5"><h3 className="font-bold">4. Subjects and training units</h3><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Subject / unit name</Label><Input value={newSubjectName} onChange={e=>setNewSubjectName(e.target.value)} required /></div><div className="space-y-2"><Label>Unit code</Label><Input value={newSubjectCode} onChange={e=>setNewSubjectCode(e.target.value)} /></div></div><div className="space-y-2"><Label>Education stage</Label><select value={newSubjectStage} onChange={e=>setNewSubjectStage(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="college">College / training</option><option value="junior_secondary">Junior secondary</option><option value="senior_secondary">Senior secondary</option><option value="primary">Primary</option><option value="other">Other</option></select></div><Button type="submit" disabled={!backendReady||!newSubjectName.trim()} className="bg-blue-800 hover:bg-blue-900">Add subject / unit</Button><div className="divide-y border">{schoolSubjects.map(x=><div key={x.id} className="p-3 text-sm">{x.name} <span className="text-xs text-slate-500">{x.code||'No code'} · {x.education_stage}</span></div>)}</div></form>
              <form onSubmit={async e=>{e.preventDefault();const ok=await submitSchoolAction({action:'create_fee_structure',schoolId:selectedSchoolId,name:newFeeName,totalAmount:Number(newFeeAmount),programmeName:newFeeProgramme,academicYearId:schoolYears.find(y=>y.is_current)?.id||schoolYears[0]?.id||null},'Fee structure saved as a draft for review.');if(ok){setNewFeeName('');setNewFeeAmount('');setNewFeeProgramme('');}}} className="space-y-4 rounded-2xl border bg-white p-5 xl:col-span-2"><h3 className="font-bold">5. Fees and programme pricing</h3><p className="text-xs text-slate-500">Fee structures are saved as drafts; publish/issue invoices only after reviewing the amounts.</p><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2"><Label>Fee structure name</Label><Input value={newFeeName} onChange={e=>setNewFeeName(e.target.value)} placeholder="e.g. Python Programming Fees" required /></div><div className="space-y-2"><Label>Programme / course</Label><Input value={newFeeProgramme} onChange={e=>setNewFeeProgramme(e.target.value)} placeholder="Course or intake name" /></div><div className="space-y-2"><Label>Total amount (KSh)</Label><Input type="number" min="0" max="10000000" value={newFeeAmount} onChange={e=>setNewFeeAmount(e.target.value)} required /></div></div><Button type="submit" disabled={!backendReady||!newFeeName.trim()||newFeeAmount===''} className="bg-blue-800 hover:bg-blue-900">Save draft fee structure</Button><div className="divide-y border">{schoolFees.map(f=><div key={f.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{f.name} · {f.programme_name||'General'} · {f.academic_year||'No year'}</span><span className="font-semibold">KSh {Number(f.total_amount).toLocaleString()} · {f.status}</span></div>)}</div></form>
            </div>}
            {selectedSchoolId&&<section className="overflow-hidden rounded-2xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-bold">Learner register</h3><p className="mt-1 text-sm text-slate-600">Institutional admissions and cohort placement. This does not create a login account or alter existing portal users.</p><p className="mt-1 text-xs text-slate-500">Bulk upload requires admissionNumber, firstName and lastName. Optional classId must be a valid class ID for this school.</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => downloadCsvTemplate('navstar-student-import-template.csv', ['admissionNumber','firstName','middleName','lastName','classId','gender','dateOfBirth'], ['NDH-001','Jane','','Doe','','Female','2010-01-15'])}>Download student template</Button><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs font-semibold hover:bg-slate-50">Choose CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={readLearnerImport}/></label><Button type="button" size="sm" disabled={!learnerImportRows.length||!selectedSchoolId} onClick={() => void importLearners()}>Import {learnerImportRows.length || ''} students</Button>{(['pdf','word','excel'] as const).map(format=><Button key={'learners-'+format} type="button" size="sm" variant="outline" onClick={() => exportLearners(format)}>Export {format.toUpperCase()}</Button>)}</div></div><div className="flex flex-wrap gap-2">{(['pdf','word','excel'] as const).map(format=><Button key={'learners-'+format} type="button" size="sm" variant="outline" onClick={() => exportLearners(format)}>Export {format.toUpperCase()}</Button>)}</div></div><p className="mt-1 text-sm text-slate-600">Institutional admissions and cohort placement. This does not create a login account or alter existing portal users.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Admission no.</th><th className="p-3">Learner</th><th className="p-3">Class / cohort</th><th className="p-3">Status</th></tr></thead><tbody>{schoolLearners.map(l=><tr key={l.id} className="border-t"><td className="p-3 font-semibold">{l.admission_number}</td><td className="p-3">{l.first_name} {l.middle_name||''} {l.last_name}</td><td className="p-3">{l.class_name||'Unassigned'}</td><td className="p-3">{l.status}</td></tr>)}{schoolLearners.length===0&&<tr><td colSpan={4} className="p-5 text-center text-slate-500">No learners registered in this institution yet.</td></tr>}</tbody></table></div></section>}
          </div>}

          {active === 'learning' && <div className="space-y-6">
            <section className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Learning Management System</h3><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Build course content, publish modules and lessons, set assignments, allocate tutors and assess learner submissions. Published content becomes visible in the authorised Learning Workspace.</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{learningCourses.length} active courses</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Modules</p><p className="mt-1 text-2xl font-bold">{learningCourses.reduce((n,c)=>n+c.modules.length,0)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Lessons</p><p className="mt-1 text-2xl font-bold">{learningCourses.reduce((n,c)=>n+c.modules.reduce((m,x)=>m+x.lessons.length,0),0)}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Assignments</p><p className="mt-1 text-2xl font-bold">{learningCourses.reduce((n,c)=>n+c.assignments.length,0)}</p></div></div>
            </section>
            <section className="grid gap-4 rounded-2xl border border-blue-100 bg-gradient-to-r from-[#0b2854] to-[#123e78] p-5 text-white xl:grid-cols-[1.2fr_1fr]">
              <div><h3 className="font-bold">Bulk module upload & branded registers</h3><p className="mt-1 text-xs leading-5 text-blue-100">Download the Navstar CSV template, fill in module details and import up to 100 rows at once. Existing records are retained.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => downloadCsvTemplate('navstar-module-import-template.csv', ['title','description','status','sortOrder'], ['Introduction to the course','Module learning objectives','draft','1'])}>Download module template</Button>
                  <label className="inline-flex cursor-pointer items-center rounded-md border border-white/30 px-3 py-2 text-xs font-semibold hover:bg-white/10">Choose CSV file<input type="file" accept=".csv,text/csv" className="sr-only" onChange={readModuleImport}/></label>
                  <Button type="button" size="sm" disabled={!moduleImportRows.length || !learningCourseId} onClick={() => void importModules()}>Import {moduleImportRows.length || ''} modules</Button>
                </div>
                {moduleImportName && <p className="mt-2 text-xs text-cyan-100">Selected: {moduleImportName} · {moduleImportRows.length} valid rows</p>}
              </div>
              <div><p className="text-xs font-bold uppercase tracking-wider text-blue-100">Export existing records</p><div className="mt-3 flex flex-wrap gap-2">{(['pdf','word','excel'] as const).map(format=><Button key={'modules-'+format} type="button" size="sm" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15" onClick={() => exportLearningModules(format)}>Modules · {format.toUpperCase()}</Button>)}{(['pdf','word','excel'] as const).map(format=><Button key={'marks-'+format} type="button" size="sm" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15" onClick={() => exportMarks(format)}>Marks · {format.toUpperCase()}</Button>)}</div></div>
            </section>
            <div className="grid gap-5 xl:grid-cols-2">
              <form onSubmit={async (event)=>{event.preventDefault();if(!learningCourseId)return;const ok=await submitLearningAction({action:'create_module',courseId:learningCourseId,title:learningModuleTitle,description:learningModuleDescription,status:'published'},'Module created and published.');if(ok){setLearningModuleTitle('');setLearningModuleDescription('');}}} className="space-y-4 rounded-2xl border bg-white p-5">
                <div><h3 className="font-bold text-slate-950">1. Create course module</h3><p className="mt-1 text-xs text-slate-500">Organise a course into topics or units.</p></div>
                <div className="space-y-2"><Label>Course</Label><select value={learningCourseId} onChange={e=>setLearningCourseId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="space-y-2"><Label>Module title</Label><Input value={learningModuleTitle} onChange={e=>setLearningModuleTitle(e.target.value)} placeholder="e.g. Introduction to Python" required /></div>
                <div className="space-y-2"><Label>Module description</Label><textarea value={learningModuleDescription} onChange={e=>setLearningModuleDescription(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 p-3 text-sm" placeholder="Learning objectives and topics covered" /></div>
                <Button type="submit" disabled={!backendReady||!learningCourseId||!learningModuleTitle.trim()} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-2 h-4 w-4"/>Create module</Button>
              </form>
              <form onSubmit={async (event)=>{event.preventDefault();if(!learningModuleId)return;const ok=await submitLearningAction({action:'create_lesson',moduleId:learningModuleId,title:learningLessonTitle,content:learningLessonContent,estimatedMinutes:Number(learningLessonMinutes),status:'published'},'Lesson created and published.');if(ok){setLearningLessonTitle('');setLearningLessonContent('');}}} className="space-y-4 rounded-2xl border bg-white p-5">
                <div><h3 className="font-bold text-slate-950">2. Add lesson or learning material</h3><p className="mt-1 text-xs text-slate-500">Lessons support text content and the existing LMS video/resource links.</p></div>
                <div className="space-y-2"><Label>Module</Label><select value={learningModuleId} onChange={e=>setLearningModuleId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select module</option>{learningCourses.flatMap(c=>c.modules.map(m=><option key={m.id} value={m.id}>{c.title} — {m.title}</option>))}</select></div>
                <div className="space-y-2"><Label>Lesson title</Label><Input value={learningLessonTitle} onChange={e=>setLearningLessonTitle(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Lesson content / notes</Label><textarea value={learningLessonContent} onChange={e=>setLearningLessonContent(e.target.value)} rows={4} className="w-full rounded-md border border-slate-300 p-3 text-sm" placeholder="Write the lesson notes or instructions..." /></div>
                <div className="space-y-2"><Label>Estimated time (minutes)</Label><Input type="number" min="1" max="1440" value={learningLessonMinutes} onChange={e=>setLearningLessonMinutes(e.target.value)} /></div>
                <Button type="submit" disabled={!backendReady||!learningModuleId||!learningLessonTitle.trim()} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-2 h-4 w-4"/>Publish lesson</Button>
              </form>
              <form onSubmit={async(event)=>{event.preventDefault();if(!learningCourseId)return;const ok=await submitLearningAction({action:'create_assignment',courseId:learningCourseId,moduleId:learningModuleId||null,title:learningAssignmentTitle,instructions:learningAssignmentInstructions,dueAt:learningAssignmentDue?new Date(learningAssignmentDue).toISOString():null,maxPoints:Number(learningAssignmentMax),status:'published'},'Assignment published to the selected course.');if(ok){setLearningAssignmentTitle('');setLearningAssignmentInstructions('');setLearningAssignmentDue('');}}} className="space-y-4 rounded-2xl border bg-white p-5">
                <div><h3 className="font-bold text-slate-950">3. Create assignment or CAT</h3><p className="mt-1 text-xs text-slate-500">Set instructions, due date and maximum marks.</p></div>
                <div className="space-y-2"><Label>Course</Label><select value={learningCourseId} onChange={e=>setLearningCourseId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="space-y-2"><Label>Related module (optional)</Label><select value={learningModuleId} onChange={e=>setLearningModuleId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">No specific module</option>{learningCourses.flatMap(c=>c.modules.filter(m=>c.id===learningCourseId).map(m=><option key={m.id} value={m.id}>{m.title}</option>))}</select></div>
                <div className="space-y-2"><Label>Assignment title</Label><Input value={learningAssignmentTitle} onChange={e=>setLearningAssignmentTitle(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Instructions</Label><textarea value={learningAssignmentInstructions} onChange={e=>setLearningAssignmentInstructions(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 p-3 text-sm" /></div>
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Deadline (East Africa time)</Label><Input type="datetime-local" value={learningAssignmentDue} onChange={e=>setLearningAssignmentDue(e.target.value)} /></div><div className="space-y-2"><Label>Maximum marks</Label><Input type="number" min="1" max="10000" value={learningAssignmentMax} onChange={e=>setLearningAssignmentMax(e.target.value)} /></div></div>
                <Button type="submit" disabled={!backendReady||!learningCourseId||!learningAssignmentTitle.trim()} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-2 h-4 w-4"/>Publish assignment</Button>
              </form>
              <form onSubmit={async(event)=>{event.preventDefault();if(!learningCourseId||!learningTutorId)return;await submitLearningAction({action:'assign_tutor',courseId:learningCourseId,tutorUserId:learningTutorId},'Tutor assigned to the selected course.');}} className="space-y-4 rounded-2xl border bg-white p-5">
                <div><h3 className="font-bold text-slate-950">4. Allocate course tutor</h3><p className="mt-1 text-xs text-slate-500">Tutors see only courses assigned to them.</p></div>
                <div className="space-y-2"><Label>Course</Label><select value={learningCourseId} onChange={e=>setLearningCourseId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select course</option>{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
                <div className="space-y-2"><Label>Tutor account</Label><select value={learningTutorId} onChange={e=>setLearningTutorId(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select tutor</option>{learningTutors.map(t=><option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select></div>
                <Button type="submit" disabled={!backendReady||!learningCourseId||!learningTutorId} className="bg-blue-800 hover:bg-blue-900"><Users className="mr-2 h-4 w-4"/>Assign tutor</Button>
              </form>
            </div>
            <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-5"><h3 className="font-bold text-slate-950">Course content and learner submissions</h3><p className="mt-1 text-sm text-slate-600">Review published modules, lessons, assignments and submitted work.</p></div><div className="divide-y">{learningCourses.map(course=><article key={course.id} className="p-5"><h4 className="font-bold text-slate-950">{course.title}</h4><div className="mt-3 space-y-3">{course.modules.map(module=><div key={module.id} className="rounded-xl bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{module.title}</p><span className="text-xs font-bold uppercase text-emerald-700">{module.status}</span></div>{module.lessons.map(lesson=><div key={lesson.id} className="ml-3 mt-2 border-l-2 border-blue-200 pl-3 text-sm"><p>{lesson.title} <span className="text-xs text-slate-500">· {lesson.estimated_minutes} min · {lesson.status}</span></p></div>)}</div>)}
                {course.assignments.map(assignment=><div key={assignment.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{assignment.title}</p><span className="text-xs text-slate-500">{assignment.status} · Max {assignment.max_points}</span></div><p className="mt-1 text-xs text-slate-500">{assignment.due_at ? formatEATDateTime(assignment.due_at) : 'No deadline'} · {(assignment.submissions||[]).length} submissions</p>{(assignment.submissions||[]).map(sub=><div key={sub.id} className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_120px_1fr_auto] md:items-end"><div><p className="text-sm font-semibold">{sub.learner_name}</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{sub.response_text || 'No written response'}</p>{sub.attachment_url&&<a href={sub.attachment_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700">Open attachment</a>}</div><div className="space-y-1"><Label>Score</Label><Input type="number" min="0" max={assignment.max_points} value={learningGradePoints[sub.id] ?? String(sub.points_awarded ?? '')} onChange={e=>setLearningGradePoints(v=>({...v,[sub.id]:e.target.value}))}/></div><div className="space-y-1"><Label>Feedback</Label><Input value={learningFeedback[sub.id] ?? sub.feedback ?? ''} onChange={e=>setLearningFeedback(v=>({...v,[sub.id]:e.target.value}))}/></div><Button type="button" size="sm" disabled={!backendReady||learningGradePoints[sub.id]===undefined&&sub.points_awarded==null} onClick={()=>void submitLearningAction({action:'grade_submission',submissionId:sub.id,pointsAwarded:Number(learningGradePoints[sub.id] ?? sub.points_awarded),feedback:learningFeedback[sub.id] ?? sub.feedback ?? ''},'Submission graded and feedback saved.')}>Save grade</Button></div>)}</div>)}
                {course.modules.length===0&&course.assignments.length===0&&<p className="text-sm text-slate-500">No modules or assignments have been created for this course.</p>}</div></article>)}{learningCourses.length===0&&<p className="p-6 text-sm text-slate-500">{backendReady?'Create a course first, then add modules and lessons.':'Connect the live database to manage learning content.'}</p>}</div></section>
          </div>}

          {active === 'services' && <div className="space-y-5"><section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-[#0b2854] p-4 text-white"><div><h3 className="font-bold">Bulk service upload</h3><p className="text-xs text-blue-100">Use the Navstar CSV template to add up to 100 services without replacing existing services.</p></div><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => downloadCsvTemplate('navstar-service-import-template.csv', ['name','category','price','priceAmount'], ['Passport photos','Digital support','From KSh 40',''])}>Download template</Button><label className="inline-flex cursor-pointer items-center rounded-md border border-white/30 px-3 py-2 text-xs font-semibold hover:bg-white/10">Choose CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={readServiceImport}/></label><Button type="button" size="sm" disabled={!serviceImportRows.length} onClick={() => void importServices()}>Import {serviceImportRows.length || ''} services</Button></div>{serviceImportRows.length>0&&<p className="w-full text-xs text-cyan-100">{serviceImportRows.length} valid rows ready to import.</p>}</section><div><h3 className="font-bold">Navstar Service Catalogue</h3><p className="text-xs text-blue-100">Download branded copies of the current service register.</p></div><div className="flex flex-wrap gap-2">{(['pdf','word','excel'] as const).map(format=><Button key={format} type="button" size="sm" variant="outline" className="border-white/30 text-white hover:bg-white/10" onClick={() => exportServices(format)}>Export {format.toUpperCase()}</Button>)}</div></section><form onSubmit={addService} className="grid gap-3 border bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_180px_180px_auto] xl:items-end"><div className="space-y-2"><Label htmlFor="service-name">Service name</Label><Input id="service-name" value={serviceName} onChange={(event) => setServiceName(event.target.value)} placeholder="e.g. Scanning" required /></div><div className="space-y-2"><Label htmlFor="service-category">Category</Label><select id="service-category" value={serviceCategory} onChange={(event) => setServiceCategory(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option>Cyber cafe</option><option>Document desk</option><option>Digital support</option><option>Training</option><option>Technical help</option></select></div><div className="space-y-2"><Label htmlFor="service-price">Display price</Label><Input id="service-price" value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} placeholder="From KSh 100" /></div><div className="space-y-2"><Label htmlFor="service-price-amount">Fixed online payment (KSh)</Label><Input id="service-price-amount" type="number" min="1" max="150000" value={servicePriceAmount} onChange={(event) => setServicePriceAmount(event.target.value)} placeholder="Optional — e.g. 500" /></div><Button type="submit" className="bg-emerald-800 hover:bg-emerald-900"><Plus className="mr-2 h-4 w-4" />Add service</Button></form><div className="divide-y border bg-white">{services.map((service) => <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold text-slate-950">{service.name}</p><p className="mt-1 text-xs text-slate-500">{service.category} · {service.price}{service.priceAmount ? ` · Online: KSh ${service.priceAmount.toLocaleString()}` : ''}</p></div><div className="flex items-center gap-4"><span className="text-xs font-semibold text-emerald-800">{service.status}</span><button aria-label={`Pause ${service.name}`} onClick={() => void removeService(service.id)} className="text-slate-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></div>}

          {active === 'enrollments' && <div className="overflow-x-auto border bg-white"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course</th><th className="p-3">Application</th><th className="p-3">Payment</th><th className="p-3">Received</th><th className="p-3">Review</th></tr></thead><tbody>{applications.map((application) => <tr key={String(application.id)} className="border-b last:border-0"><td className="p-3"><p className="font-semibold">{String(application.full_name ?? '')}</p><p className="text-xs text-slate-500">{String(application.email ?? '')}</p></td><td className="p-3">{courses.find((item) => item.id === application.course_id)?.title ?? String(application.course_id ?? '')}</td><td className="p-3">{String(application.status ?? '')}</td><td className="p-3">{String(application.payment_status ?? '')}</td><td className="p-3">{formatEATDateTime(application.created_at as string | null | undefined)}</td><td className="p-3">{(user?.role === 'admin' || user?.role === 'admissions') ? <select aria-label={`Review application for ${String(application.full_name ?? 'learner')}`} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900" value={String(application.status ?? 'submitted')} onChange={(event) => void updateApplicationStatus(String(application.id), event.target.value)}><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="accepted">Accepted — enable LMS</option><option value="rejected">Rejected</option></select> : 'Read only'}</td></tr>)}{applications.length === 0 && <tr><td className="p-6 text-center text-slate-500" colSpan={6}>{backendReady ? 'No applications received yet.' : 'Connect the backend and sign in to view applications.'}</td></tr>}</tbody></table></div>}

          {active === 'users' && <div className="space-y-5"><form onSubmit={createPortalUser} className="space-y-5 border bg-white p-4 sm:p-6">
            <div><h3 className="font-bold text-slate-900">Create a portal user, staff or Admin account</h3><p className="mt-1 text-sm text-slate-600">Only an authenticated Admin can create accounts here, including additional Admins. A unique Navstar ID is generated automatically. Give each person the least access they need and issue credentials privately.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="portal-user-name">Full legal name *</Label><Input id="portal-user-name" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-email">Email address *</Label><Input id="portal-user-email" type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-role">Portal role *</Label><select id="portal-user-role" value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm">{['admin','principal','finance','admissions','tutor','student'].map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="portal-user-phone">Phone number</Label><Input id="portal-user-phone" value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-national-id">National ID / identity reference</Label><Input id="portal-user-national-id" value={newUserNationalId} onChange={(event) => setNewUserNationalId(event.target.value)} /></div>
              <ProfileDropdown id="portal-user-citizenship" label="Citizenship" value={newUserCitizenship} options={CITIZENSHIP_OPTIONS} onChange={setNewUserCitizenship}/><ProfileDropdown id="portal-user-gender" label="Gender" value={newUserGender} options={GENDER_OPTIONS} onChange={setNewUserGender}/><div className="space-y-2"><Label htmlFor="portal-user-dob">Date of birth</Label><Input id="portal-user-dob" type="date" value={newUserDateOfBirth} onChange={event=>setNewUserDateOfBirth(event.target.value)}/></div>
               <div className="sm:col-span-2 xl:col-span-3"><GeographyPicker county={newUserCounty} subCounty={newUserSubCounty} ward={newUserWard} location={newUserLocation} subLocation={newUserSubLocation} locations={locationOptions} subLocations={subLocationOptions} onChange={(value) => { setNewUserCounty(value.county); setNewUserSubCounty(value.subCounty); setNewUserWard(value.ward); setNewUserLocation(value.location); setNewUserSubLocation(value.subLocation); }} /></div>
              <ProfileDropdown id="portal-user-department" label="Department" value={newUserDepartment} options={DEPARTMENT_OPTIONS} onChange={setNewUserDepartment}/><ProfileDropdown id="portal-user-title" label="Job title" value={newUserJobTitle} options={JOB_TITLE_OPTIONS} onChange={setNewUserJobTitle}/><ProfileDropdown id="portal-user-employment" label="Employment type" value={newUserEmploymentType} options={EMPLOYMENT_TYPE_OPTIONS} onChange={setNewUserEmploymentType}/><div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label htmlFor="portal-user-address">Full physical / postal address</Label><Input id="portal-user-address" value={newUserAddress} onChange={event=>setNewUserAddress(event.target.value)} placeholder="Building, street, estate or village, town"/></div>
              
              <div className="space-y-2"><Label htmlFor="portal-user-password">Password *</Label><Input id="portal-user-password" type="password" minLength={6} maxLength={12} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} autoComplete="new-password" required /><p className="text-xs leading-5 text-slate-600">6–12 characters. Meet at least 3: capital letter, small letter, number, special character (! @ #).</p><p className={isPasswordStrong(newUserPassword)?'text-xs font-semibold text-emerald-700':'text-xs text-slate-500'}>{newUserPassword ? (isPasswordStrong(newUserPassword)?'Strong password ✓':'Password does not meet the strength rule yet.') : 'Password strength will be checked as you type.'}</p></div>
              <div className="space-y-2"><Label htmlFor="portal-user-confirm">Confirm password *</Label><Input id="portal-user-confirm" type="password" minLength={6} maxLength={12} value={newUserConfirmPassword} onChange={(event) => setNewUserConfirmPassword(event.target.value)} autoComplete="new-password" required />{newUserConfirmPassword && <p className={newUserPassword === newUserConfirmPassword ? 'text-xs text-emerald-700' : 'text-xs text-red-600'}>{newUserPassword === newUserConfirmPassword ? 'Passwords match ✓' : 'Passwords do not match.'}</p>}</div>
            </div>
            <Button type="submit" disabled={!backendReady || user?.role !== 'admin' || !isPasswordStrong(newUserPassword) || newUserPassword !== newUserConfirmPassword} className="bg-emerald-800 hover:bg-emerald-900"><Plus className="mr-2 h-4 w-4" />Create account and generate ID</Button>
          </form>
          <div className="divide-y border bg-white">{portalUsers.map((portalUser) => <div key={portalUser.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{portalUser.name}</p><p className="mt-1 text-xs text-slate-500">{portalUser.staffId || 'ID pending'} · {portalUser.email} · {portalUser.role}</p><p className="mt-1 text-xs text-slate-500">{portalUser.nationalId ? 'National ID recorded' : 'National ID not yet provided'}</p></div><div className="flex items-center gap-3"><span className="border px-2 py-1 text-xs">{portalUser.status}</span><Button type="button" size="sm" variant="outline" onClick={() => { setEditingPortalUser(portalUser); setEditingGeo({ county: portalUser.county || '', subCounty: portalUser.subCounty || '', ward: portalUser.ward || '', location: portalUser.location || '', subLocation: portalUser.subLocation || '' }); }}><Pencil className="mr-1 h-3 w-3"/>Edit profile</Button></div></div>)}{portalUsers.length === 0 && <p className="p-5 text-sm text-slate-500">{backendReady ? 'No accounts found.' : 'Connect Cloudflare Pages Functions and sign in as Admin to manage accounts.'}</p>}</div>
          {editingPortalUser && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><form onSubmit={savePortalUserEdit} className="my-6 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black text-slate-950">Edit account profile</h3><p className="mt-1 text-sm text-slate-600">{editingPortalUser.staffId} · {editingPortalUser.email}</p></div><button type="button" onClick={() => setEditingPortalUser(null)} className="rounded-lg border px-3 py-1 text-sm">Close</button></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Full name</Label><Input name="name" defaultValue={editingPortalUser.name} required/></div><div className="space-y-1"><Label>Portal role</Label><select name="role" defaultValue={editingPortalUser.role} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{['admin','principal','finance','admissions','tutor','student'].map(role=><option key={role} value={role}>{role}</option>)}</select></div><div className="space-y-1"><Label>National ID</Label><Input name="nationalId" defaultValue={editingPortalUser.nationalId || ''}/></div><div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={editingPortalUser.phone || ''}/></div><div className="space-y-1"><Label>Gender</Label><select name="gender" defaultValue={editingPortalUser.gender || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select gender</option>{GENDER_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Citizenship</Label><select name="citizenship" defaultValue={editingPortalUser.citizenship || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select citizenship</option>{CITIZENSHIP_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Date of birth</Label><Input name="dateOfBirth" type="date" defaultValue={editingPortalUser.dateOfBirth || ''}/></div><div className="sm:col-span-2"><GeographyPicker county={editingGeo.county} subCounty={editingGeo.subCounty} ward={editingGeo.ward} location={editingGeo.location} subLocation={editingGeo.subLocation} locations={locationOptions} subLocations={subLocationOptions} onChange={setEditingGeo}/></div><div className="space-y-1"><Label>Department</Label><select name="department" defaultValue={editingPortalUser.department || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select department</option>{DEPARTMENT_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Job title</Label><select name="jobTitle" defaultValue={editingPortalUser.jobTitle || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select job title</option>{JOB_TITLE_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Employment type</Label><select name="employmentType" defaultValue={editingPortalUser.employmentType || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select employment type</option>{EMPLOYMENT_TYPE_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Date joined</Label><Input name="joinedOn" type="date" defaultValue={editingPortalUser.joinedOn || ''}/></div><div className="sm:col-span-2"><Label>Full physical / postal address</Label><Input name="address" defaultValue={editingPortalUser.address || ''} placeholder="Building, street, estate or village, town"/></div></div><p className="text-xs text-slate-500">The system-generated Navstar ID is assigned by the system. The primary Admin can set their own ID under Settings → My Profile.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingPortalUser(null)}>Cancel</Button><Button type="submit"><Save className="mr-2 h-4 w-4"/>Save changes</Button></div></form></div>}
          </div>}
          {active === 'receipts' && <section className="rounded-2xl border bg-white p-6"><div className="flex items-center gap-3"><ReceiptText className="h-6 w-6 text-blue-800"/><div><h3 className="font-bold text-slate-950">Confirmed payment receipts</h3><p className="mt-1 text-sm text-slate-600">View confirmed payments and print or save official Navstar receipts as PDF.</p></div></div><Link to="/admin/receipts" className="mt-5 inline-flex items-center rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900">Open payment receipt register</Link></section>}

          {active === 'finance' && <div className="grid gap-6 xl:grid-cols-2"><section className="border bg-white p-5"><h3 className="font-bold text-slate-950">Verified donations and payments</h3><p className="mt-2 text-sm leading-6 text-slate-600">Only provider callbacks mark donations and tuition as paid. No M-Pesa PIN or payment credentials are shown here.</p><p className="mt-5 border bg-slate-50 p-4 text-sm text-slate-600">Verified donations: KSh {Number(metrics.verifiedDonations ?? 0).toLocaleString()} · Verified payments: KSh {Number(metrics.verifiedPayments ?? 0).toLocaleString()}</p></section><form onSubmit={startCashout} className="space-y-4 border bg-white p-5"><div><h3 className="font-bold text-slate-950">Request cashout</h3><p className="mt-2 text-sm leading-6 text-slate-600">This creates an approval request only; it does not transfer funds. Never withdraw from the browser.</p></div><div className="space-y-2"><Label htmlFor="cashout-amount">Amount (KSh)</Label><Input id="cashout-amount" type="number" min="1" value={cashoutAmount} onChange={(event) => setCashoutAmount(event.target.value)} required /></div><Button className="bg-emerald-800 hover:bg-emerald-900" type="submit" disabled={!backendReady || !user}><CircleDollarSign className="mr-2 h-4 w-4" />{backendReady ? 'Submit for approval' : 'Backend required'}</Button><div className="divide-y border">{cashoutRequests.map((item) => <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><span>KSh {Number(item.amount).toLocaleString()} · {String(item.status)}</span>{item.status === 'pending_approval' && user?.role === 'admin' && <span className="flex gap-2"><Button size="sm" type="button" variant="outline" onClick={() => reviewCashout(String(item.id), 'approved')}>Approve</Button><Button size="sm" type="button" variant="outline" onClick={() => reviewCashout(String(item.id), 'rejected')}>Reject</Button></span>}</div>)}{cashoutRequests.length === 0 && <p className="p-3 text-xs text-slate-500">No cashout requests.</p>}</div></form></div>}

          {active === 'orders' && <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-bold text-slate-950">Customer service orders</h3><p className="mt-1 text-sm text-slate-600">Requests submitted from the public Customer Service Desk.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{customerOrders.length} orders</span></div>
            <div className="divide-y">{customerOrders.map((order) => <article key={order.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{order.serviceName}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{order.status}</span></div><p className="mt-1 text-sm text-slate-600">{order.customerName} · {order.phone}{order.email ? ' · ' + order.email : ''}</p><p className="mt-1 text-xs text-slate-500">Reference: {order.reference} · KSh {Number(order.amount).toLocaleString()} · {formatEATDateTime(order.createdAt)}</p>{order.notes && <p className="mt-2 text-sm text-slate-600">{order.notes}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void updateOrderStatus(order.id, 'completed')} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800">Mark completed</button><button type="button" onClick={() => void updateOrderStatus(order.id, 'cancelled')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Cancel</button></div></article>)}{customerOrders.length === 0 && <p className="p-6 text-sm text-slate-500">No customer orders have been submitted yet.</p>}</div>
          </section>}

          {active === 'downloads' && <div className="space-y-5">
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-bold text-slate-950">Publish downloadable documents</h3>
              <p className="mt-1 text-sm text-slate-600">Upload approved forms, academic calendars, answer booklets, course lists, admission documents and other resources. Published files appear in the website footer.</p>
              <form onSubmit={uploadDocument} className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="document-title">Document title</Label><Input id="document-title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="e.g. Student Course Enrolment Form (Form 1A)" /></div>
                <div className="space-y-2"><Label htmlFor="admin-document-file">Choose document</Label><Input id="admin-document-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,application/pdf" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} required /></div>
                <div className="space-y-2 md:col-span-2"><Label htmlFor="document-description">Short description</Label><Input id="document-description" value={documentDescription} onChange={(event) => setDocumentDescription(event.target.value)} placeholder="What is this document used for?" /></div>
                <div className="md:col-span-2"><Button type="submit" disabled={!backendReady || !documentFile} className="bg-blue-800 hover:bg-blue-900"><Plus className="mr-2 h-4 w-4" />Upload and publish</Button></div>
              </form>
              {!backendReady && <p className="mt-3 text-xs text-amber-700">Connect the production D1 database and DOCS R2 bucket before uploads can be published.</p>}
            </section>
            <section className="overflow-hidden rounded-2xl border bg-white"><div className="border-b p-4"><h3 className="font-bold text-slate-950">Published downloads</h3></div>
              <div className="divide-y">{documents.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold text-slate-900">{doc.title}</p><p className="mt-1 text-xs text-slate-500">{doc.originalName} · {(doc.sizeBytes / 1024).toFixed(0)} KB</p>{doc.description && <p className="mt-1 text-sm text-slate-600">{doc.description}</p>}</div><div className="flex items-center gap-3"><a href={doc.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700">View file</a><button type="button" onClick={() => void deleteDocument(doc.id)} className="text-sm font-semibold text-rose-700">Remove</button></div></div>)}{documents.length === 0 && <p className="p-5 text-sm text-slate-500">No documents published yet. Upload your forms and calendar here.</p>}</div>
            </section>
          </div>}

          {active === 'gallery' && <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"><section className="space-y-4 border bg-white p-5"><h3 className="font-bold text-slate-950">Logo and site identity</h3><p className="text-sm leading-6 text-slate-600">Choose a local logo preview. It will not be published until secure media storage is connected.</p><Label htmlFor="brand-name">Display name</Label><Input id="brand-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} /><Label htmlFor="logo-upload">Logo image</Label><Input id="logo-upload" type="file" accept="image/*" onChange={(event) => setImage(event, 'logo')} />{logoPreview && <img src={logoPreview} alt="Selected NAVSTAR logo preview" className="h-24 w-24 border object-contain p-2" />}<p className="text-xs text-slate-500">Recommended: transparent PNG or SVG, square format.</p></section><section className="space-y-4 border bg-white p-5"><div><h3 className="font-bold text-slate-950">Gallery</h3><p className="mt-1 text-sm text-slate-600">Preview up to eight images at a time. Storage is not configured.</p></div><Label htmlFor="gallery-upload">Add gallery images</Label><Input id="gallery-upload" type="file" accept="image/*" multiple onChange={(event) => setImage(event, 'gallery')} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{galleryPreview.map((url, index) => <img key={url} src={url} alt={`Gallery preview ${index + 1}`} className="aspect-square w-full border object-cover" />)}</div></section></div>}

          {active === 'settings' && <div className="space-y-5">
            <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="Settings sections">
              {[
                ['site','Site settings'],['notifications','Notifications'],['my-profile','My Profile'],['geography','Geography directories'],['staff-ids','Staff ID formats']
              ].map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={settingsTab === id} onClick={() => setSettingsTab(id as typeof settingsTab)} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${settingsTab === id ? 'bg-emerald-800 text-white shadow' : 'border bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>)}
            </div>

            {settingsTab === 'site' && <form onSubmit={saveSettings} className="max-w-3xl space-y-4 rounded-2xl border bg-white p-5">
              <div><h3 className="font-bold text-slate-950">Site settings</h3><p className="mt-1 text-sm text-slate-600">Configure the official Navstar site and session policy.</p></div>
              <div className="space-y-2"><Label htmlFor="site-name">Site name</Label><Input id="site-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="contact-email">Admissions email</Label><Input id="contact-email" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="admissions@example.org" /></div>
              <div className="space-y-2"><Label htmlFor="contact-phone">Contact phone</Label><Input id="contact-phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="+254 7xx xxx xxx" /></div>
              <div className="space-y-2"><Label htmlFor="school-address">Business address</Label><Input id="school-address" value={schoolAddress} onChange={(event) => setSchoolAddress(event.target.value)} placeholder="Town, county" /></div>
              <div className="space-y-2"><Label htmlFor="session-timeout">Automatic inactivity logout</Label><select id="session-timeout" value={sessionTimeoutMinutes} onChange={(event) => setSessionTimeoutMinutes(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option></select><p className="text-xs text-slate-500">The user is signed out after this period without activity.</p></div>
              <Button type="submit" disabled={!backendReady || user?.role !== 'admin'}><Save className="mr-2 h-4 w-4"/>Save site settings</Button>
            </form>}

            {settingsTab === 'notifications' && <section className="max-w-3xl space-y-4 rounded-2xl border bg-white p-5">
              <div><h3 className="font-bold text-slate-950">Notification preferences</h3><p className="mt-1 text-sm text-slate-600">Choose which events the connected Admin service should notify.</p></div>
              {[
                ['newApplication', 'New student application'], ['paymentUpdate', 'Payment status update'], ['donation', 'Donation received'],
              ].map(([key, label]) => <label key={key} className="flex items-center justify-between gap-4 border-b py-3 last:border-0"><span className="flex items-center gap-2 text-sm font-medium"><Bell className="h-4 w-4 text-emerald-800"/>{label}</span><input type="checkbox" checked={notifications[key as keyof typeof notifications]} onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 accent-emerald-800"/></label>)}
              <p className="text-xs leading-5 text-slate-500">Browser push and SMS notifications require user permission and a notification backend.</p>
            </section>}

            {settingsTab === 'my-profile' && <form onSubmit={saveAdminProfile} className="space-y-5 rounded-2xl border bg-white p-5">
              <div><h3 className="font-bold text-slate-950">My Admin Profile</h3><p className="mt-1 text-sm text-slate-600">Live details for the account currently signed in. Update the existing account; no new account is created.</p></div>
              {profileSubTab === 'account' && <section id="profile-account-summary" className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-bold text-slate-950">System account information</h4><p className="mt-1 text-xs text-slate-600">Read directly from your active Navstar session and profile record.</p></div><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Signed in · {user?.role || 'Admin'}</span></div>
                {profileLoadWarning && <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{profileLoadWarning}</div>}
                {profileLoadError && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{profileLoadError}<button type="button" onClick={() => { setProfileLoaded(false); setProfileLoadError(''); setProfileReload(value => value + 1); }} className="ml-2 font-bold underline">Retry loading</button></div>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account name</p><p className="mt-1 font-semibold text-slate-900">{String(profileSystemDetails.name || user?.name || 'Not available')}</p></div>
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Login email</p><p className="mt-1 break-all font-semibold text-slate-900">{String(profileSystemDetails.email || user?.email || 'Not available')}</p></div>
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">System user ID</p><p className="mt-1 break-all font-mono text-sm font-semibold text-slate-900">{String(profileSystemDetails.id || user?.id || 'Not available')}</p></div>
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Portal role</p><p className="mt-1 font-semibold capitalize text-slate-900">{String(profileSystemDetails.role || user?.role || 'Admin')}</p></div>
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Staff ID</p><p className="mt-1 font-mono font-bold text-slate-900">{adminStaffId || 'Not assigned yet'}</p></div>
                  <div className="rounded-lg border bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Account created</p><p className="mt-1 font-semibold text-slate-900">{profileSystemDetails.created_at ? formatEATDateTime(String(profileSystemDetails.created_at)) : 'Not available'}</p></div>
                </div>
              </section>}
              <div className="flex flex-wrap gap-2 border-b pb-3" role="tablist" aria-label="My profile subtabs">
                {([['account','Account overview'],['personal','Personal & identity'],['employment','Employment'],['location','Location & address']] as const).map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={profileSubTab === id} onClick={() => setProfileSubTab(id)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${profileSubTab === id ? 'bg-blue-800 text-white' : 'border bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>)}
              </div>
              <p className="text-xs text-slate-500">Choose a section above. Only that section is displayed, so you can work without scrolling through one long form. Existing details are loaded from your signed-in account.</p>
              {profileSubTab === 'account' && <>
              <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_2fr] sm:items-end">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-900">Your Admin staff ID</p><p className="mt-1 text-xs text-amber-800">Choose an unused AD + five-digit ID.</p></div>
                <div className="space-y-2"><Label htmlFor="admin-profile-staffId">Staff ID</Label><Input id="admin-profile-staffId" value={adminStaffId} onChange={event => setAdminStaffId(event.target.value.toUpperCase())} placeholder="AD12345" pattern="AD[0-9]{5}" maxLength={7} required/><p className="text-xs text-slate-500">Current saved ID: {user?.staffId || adminStaffId || 'Not loaded'} · Example: AD12345</p></div>
              </div>
              </>}
              {profileSubTab === 'personal' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
<div className="space-y-2"><Label htmlFor="admin-profile-name">Full legal name</Label><Input id="admin-profile-name" value={adminProfile.name || ''} onChange={event => setAdminProfile(current => ({...current,name:event.target.value}))} required/></div>
                <div className="space-y-2"><Label htmlFor="admin-profile-nationalId">National ID</Label><Input id="admin-profile-nationalId" value={adminProfile.nationalId || ''} onChange={event => setAdminProfile(current => ({...current,nationalId:event.target.value}))}/></div>
                <div className="space-y-2"><Label htmlFor="admin-profile-phone">Phone number</Label><Input id="admin-profile-phone" value={adminProfile.phone || ''} onChange={event => setAdminProfile(current => ({...current,phone:event.target.value}))}/></div>
                <div className="space-y-2"><Label htmlFor="admin-profile-dateOfBirth">Date of birth</Label><Input id="admin-profile-dateOfBirth" type="date" value={adminProfile.dateOfBirth || ''} onChange={event => setAdminProfile(current => ({...current,dateOfBirth:event.target.value}))}/></div>
                <ProfileDropdown id="admin-profile-gender" label="Gender" value={adminProfile.gender || ''} options={GENDER_OPTIONS} onChange={value => setAdminProfile(current => ({...current,gender:value}))}/>
                <ProfileDropdown id="admin-profile-citizenship" label="Citizenship" value={adminProfile.citizenship || ''} options={CITIZENSHIP_OPTIONS} onChange={value => setAdminProfile(current => ({...current,citizenship:value}))}/>
              </div>}
              {profileSubTab === 'employment' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
<ProfileDropdown id="admin-profile-department" label="Department" value={adminProfile.department || ''} options={DEPARTMENT_OPTIONS} onChange={value => setAdminProfile(current => ({...current,department:value}))}/>
                <ProfileDropdown id="admin-profile-jobTitle" label="Job title" value={adminProfile.jobTitle || ''} options={JOB_TITLE_OPTIONS} onChange={value => setAdminProfile(current => ({...current,jobTitle:value}))}/>
                <ProfileDropdown id="admin-profile-employmentType" label="Employment type" value={adminProfile.employmentType || ''} options={EMPLOYMENT_TYPE_OPTIONS} onChange={value => setAdminProfile(current => ({...current,employmentType:value}))}/>
                <div className="space-y-2"><Label htmlFor="admin-profile-joinedOn">Date joined</Label><Input id="admin-profile-joinedOn" type="date" value={adminProfile.joinedOn || ''} onChange={event => setAdminProfile(current => ({...current,joinedOn:event.target.value}))}/></div>
              </div>}
              {profileSubTab === 'location' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
<div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label htmlFor="admin-profile-address">Full physical / postal address</Label><Input id="admin-profile-address" value={adminProfile.address || ''} onChange={event => setAdminProfile(current => ({...current,address:event.target.value}))} placeholder="Building, street, estate or village, town"/></div>
                <div className="sm:col-span-2 lg:col-span-3"><GeographyPicker county={adminProfile.county || ''} subCounty={adminProfile.subCounty || ''} ward={adminProfile.ward || ''} location={adminProfile.location || ''} subLocation={adminProfile.subLocation || ''} locations={locationOptions} subLocations={subLocationOptions} onChange={geo => setAdminProfile(current => ({...current,country:'Kenya',county:geo.county,subCounty:geo.subCounty,ward:geo.ward,location:geo.location,subLocation:geo.subLocation,constituency:geo.subCounty,province:''}))}/></div>
              </div>}
              <div className="flex justify-end"><Button type="submit" disabled={!backendReady || user?.role !== 'admin' || profileSaving || !/^AD[0-9]{5}$/.test(adminStaffId.replace(/^AD-/, 'AD'))}>{profileSaving ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Saving your profile…</> : <><Save className="mr-2 h-4 w-4"/>Save My Profile and Staff ID</>}</Button></div>
            </form>}

            {settingsTab === 'geography' && <form onSubmit={saveSettings} className="max-w-4xl space-y-5 rounded-2xl border bg-white p-5">
              <div><h3 className="font-bold text-slate-950">Geography directories</h3><p className="mt-1 text-sm text-slate-600">County, sub-county and ward come from the Kenya administrative divisions directory. Add your local locations and sub-locations once here; they will then appear as dropdown choices in account profiles.</p></div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-3"><Label>Locations available in the system</Label><div className="flex gap-2"><Input value={newLocationOption} onChange={event=>setNewLocationOption(event.target.value)} placeholder="Add location name"/><Button type="button" variant="outline" disabled={!newLocationOption.trim()} onClick={()=>{setLocationOptions(current=>Array.from(new Set([...current,newLocationOption.trim()])).sort());setNewLocationOption('');}}>Add</Button></div><div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">{locationOptions.map(value=><div key={value} className="flex items-center justify-between gap-2 text-sm"><span>{value}</span><button type="button" onClick={()=>setLocationOptions(current=>current.filter(item=>item!==value))} className="text-xs font-semibold text-rose-700">Remove</button></div>)}{locationOptions.length===0&&<p className="text-xs text-slate-500">No local locations have been configured yet.</p>}</div></div>
                <div className="space-y-3"><Label>Sub-locations available in the system</Label><div className="flex gap-2"><Input value={newSubLocationOption} onChange={event=>setNewSubLocationOption(event.target.value)} placeholder="Add sub-location name"/><Button type="button" variant="outline" disabled={!newSubLocationOption.trim()} onClick={()=>{setSubLocationOptions(current=>Array.from(new Set([...current,newSubLocationOption.trim()])).sort());setNewSubLocationOption('');}}>Add</Button></div><div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">{subLocationOptions.map(value=><div key={value} className="flex items-center justify-between gap-2 text-sm"><span>{value}</span><button type="button" onClick={()=>setSubLocationOptions(current=>current.filter(item=>item!==value))} className="text-xs font-semibold text-rose-700">Remove</button></div>)}{subLocationOptions.length===0&&<p className="text-xs text-slate-500">No sub-locations have been configured yet.</p>}</div></div>
              </div>
              <Button type="submit" disabled={!backendReady || user?.role !== 'admin' || settingsSaving}>{settingsSaving ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Saving directories…</> : <><Save className="mr-2 h-4 w-4"/>Save geography directories</>}</Button>
            </form>}

            {settingsTab === 'staff-ids' && <section className="max-w-3xl space-y-4 rounded-2xl border bg-white p-5">
              <div><h3 className="font-bold text-slate-950">Staff ID formats available in Navstar</h3><p className="mt-1 text-sm text-slate-600">The system generates a unique five-digit number after each role prefix. IDs are checked for duplicates before saving.</p></div>
              <div className="overflow-hidden rounded-xl border"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Portal role</th><th className="p-3">Prefix</th><th className="p-3">Example format</th></tr></thead><tbody>{[['Administrator','AD','AD12345'],['Principal','PR','PR12345'],['Finance','FN','FN12345'],['Admissions','AM','AM12345'],['Tutor / Staff','TU','TU12345'],['Student','ST','ST12345']].map(([role,prefix,example])=><tr key={prefix} className="border-t"><td className="p-3 font-medium">{role}</td><td className="p-3 font-mono font-bold">{prefix}</td><td className="p-3 font-mono">{example}</td></tr>)}</tbody></table></div>
              <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Existing account IDs are preserved. The logged-in Admin can set the primary Admin ID from Settings → My Profile. New accounts receive their IDs automatically.</p>
            </section>}
          </div>}

          <footer className="mt-8 flex flex-col gap-2 border-t pt-4 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Daraja secrets stay server-side. User accounts, student records, uploads, and finance operations require authenticated role access.</span><span className="font-semibold text-blue-800">Powered by Navstar Digital Hub</span></footer>
        </section>
      </div>
    </main>
  );
}