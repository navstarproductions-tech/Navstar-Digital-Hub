import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ChangeEvent, FormEvent } from 'react';
import { Bell, BookOpen, BriefcaseBusiness, CircleDollarSign, FileDown, ImagePlus, LayoutDashboard, Pencil, Plus, Save, Settings, ShieldAlert, Trash2, Users, ReceiptText, PanelLeftClose, PanelLeftOpen, LogOut, UserRound, LoaderCircle, Search, ArrowLeft, ArrowUpRight, RefreshCw, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';
import { INITIAL_COURSES } from '@/data/courses';
import type { Course } from '@/types';
import { formatEATDateTime } from '@/lib/datetime';
import { parseCsv, downloadCsvTemplate, exportBrandedData } from '@/lib/navstar-data-tools';
import { GeographyPicker } from '@/components/GeographyPicker';
import { AdminSettingsCenter } from '@/components/AdminSettingsCenter';
import { AdminDashboard } from '@/components/AdminDashboard';
import { StudentSubtabWorkspace } from '@/components/StudentSubtabWorkspace';
import { AdminWorkspaceHub } from '@/components/AdminWorkspaceHub';
import { LearningAdminSubtab } from '@/components/LearningAdminSubtab';
import { MarksHubWorkspace } from '@/components/MarksHubWorkspace';
import { StudentStatusWorkspace } from '@/components/StudentStatusWorkspace';
import { StaffApplicationsWorkspace } from '@/components/StaffApplicationsWorkspace';
import { AdminFinancePanel } from '@/components/admin/AdminFinancePanel';
import { ProfileDropdown, GENDER_OPTIONS, CITIZENSHIP_OPTIONS, DEPARTMENT_OPTIONS, JOB_TITLE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from '@/components/ProfileDropdown';

type Section = string;
type ServiceItem = { id: string; name: string; category: string; price: string; priceAmount?: number | null; status: 'Active' | 'Paused' };
type PortalUser = { id: string; name: string; email: string; role: string; status: string; profilePhotoUrl?: string | null; staffId?: string; nationalId?: string; phone?: string; dateOfBirth?: string; gender?: string; citizenship?: string; county?: string; subCounty?: string; ward?: string; location?: string; subLocation?: string; address?: string; department?: string; jobTitle?: string; employmentType?: string; joinedOn?: string };
type LearningSubmission = { id: string; learner_name: string; response_text: string; attachment_url?: string | null; status: string; points_awarded?: number | null; feedback?: string | null; submitted_at: string };
type LearningAssignment = { id: string; title: string; instructions: string; due_at?: string | null; module_id?: string | null; max_points: number; status: string; submissions?: LearningSubmission[] };
type LearningModule = { id: string; title: string; description: string; status: string; lessons: { id: string; title: string; content: string; status: string; estimated_minutes: number }[] };
type LearningCourse = { id: string; title: string; course_code?:string|null; modules: LearningModule[]; assignments: LearningAssignment[] };
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
  {id:'overview',label:'Dashboard',icon:LayoutDashboard},
  {id:'courses',label:'Courses',icon:BookOpen},
  {id:'learning',label:'Modules',icon:BookOpen},
  {id:'school',label:'Students',icon:Users},
  {id:'employees',label:'Employees',icon:Users},
  {id:'staff-applications',label:'Staff Applications',icon:Users},
  {id:'navstar-analytics',label:'Navstar Analytics',icon:LayoutDashboard},
  {id:'ai-intake-advisor',label:'AI Intake Advisor',icon:LayoutDashboard},
  {id:'enrollment-summary',label:'Enrollment Summary',icon:LayoutDashboard},
  {id:'services',label:'Services',icon:BriefcaseBusiness},
  {id:'pos',label:'Point of Sale',icon:CircleDollarSign},
  {id:'finance',label:'Accounts',icon:CircleDollarSign},
  {id:'fees',label:'Fees',icon:CircleDollarSign},
  {id:'marks-tests',label:'Marks Hub',icon:BookOpen},
  {id:'student-projects',label:'Student Projects',icon:BookOpen},
  {id:'scholarships',label:'Scholarships & Discounts',icon:CircleDollarSign},
  {id:'certificates',label:'Certificates',icon:FileDown},
  {id:'alumni',label:'Alumni Management',icon:Users},
  {id:'report-cards',label:'Report Cards & Transcripts',icon:FileDown},
  {id:'auto-reports',label:'Auto Reports & Documents',icon:FileDown},
  {id:'student-status',label:'Student Status',icon:Users},
  {id:'attendance',label:'Attendance',icon:Users},
  {id:'class-rating',label:'Class Rating Form',icon:Users},
  {id:'fingerprint',label:'Fingerprint Scan & Save',icon:Users},
  {id:'applications',label:'Applications',icon:FileDown},
  {id:'online-forms',label:'Online Forms',icon:FileDown},
  {id:'reports',label:'Reports',icon:FileDown},
  {id:'analytics-reports',label:'Analytics & Reports',icon:LayoutDashboard},
  {id:'songs-music',label:'Songs & Music',icon:BookOpen},
  {id:'gallery',label:'Gallery',icon:ImagePlus},
  {id:'news-updates',label:'News & Updates',icon:FileDown},
  {id:'downloads',label:'Documents',icon:FileDown},
  {id:'events',label:'Events & Meetings',icon:LayoutDashboard},
  {id:'demo-previews',label:'Demo Previews',icon:LayoutDashboard},
  {id:'cv-builder',label:'CV Builder',icon:FileDown},
  {id:'upload-notes',label:'Upload Notes',icon:FileDown},
  {id:'timetable',label:'Timetable',icon:LayoutDashboard},
  {id:'online-classes',label:'Online Classes',icon:BookOpen},
  {id:'eclass-meetings',label:'E-Class Meetings',icon:BookOpen},
  {id:'student-chat',label:'Student Chat',icon:Users},
  {id:'support-tickets',label:'Support Tickets',icon:Users},
  {id:'send-notification',label:'Send Notification',icon:Bell},
  {id:'broadcast-social',label:'Broadcast & Social',icon:Bell},
  {id:'sms-alerts',label:'SMS Alerts',icon:Bell},
  {id:'birthday-center',label:'Birthday Center',icon:Users},
  {id:'about-us',label:'About Us',icon:LayoutDashboard},
  {id:'campus-history',label:'Campus Life & History',icon:LayoutDashboard},
  {id:'profile',label:'My Profile',icon:UserRound},
  {id:'users',label:'System Users',icon:Users},
  {id:'device-management',label:'Device Management',icon:Settings},
  {id:'admin-access',label:'Admin Access Control',icon:ShieldAlert},
  {id:'customer-accounts',label:'Customer Accounts',icon:Users},
  {id:'maintenance',label:'Maintenance Mode',icon:Settings},
  {id:'ict-portal',label:'ICT Portal',icon:Settings},
  {id:'settings',label:'Settings',icon:Settings},
];

type AdminSubtab = {label:string;target:Section;settingsTab?:'complete'|'site'|'notifications'|'my-profile'|'geography'|'staff-ids';coursesTab?:'catalogue'|'manage'|'edit';learningTab?:'modules'|'bulk'};
const makeTabs = (labels:string[],target:Section):AdminSubtab[] => labels.map(label=>({label,target}));
const sectionSubtabs: Record<Section, AdminSubtab[]> = {
  overview: [],
  courses: [{label:'Course Catalogue',target:'courses',coursesTab:'catalogue'},{label:'Manage Courses',target:'courses',coursesTab:'manage'},{label:'Course Codes & Intakes',target:'courses',coursesTab:'manage'},{label:'Fee Structures',target:'courses'},{label:'Course Modules',target:'learning',learningTab:'modules'}],
  learning: [{label:'View Modules',target:'learning',learningTab:'modules'},{label:'Module Catalogue',target:'learning',learningTab:'modules'},{label:'Lessons & Resources',target:'learning',learningTab:'modules'},{label:'Assignments',target:'learning',learningTab:'modules'},{label:'Tests & Exams',target:'learning',learningTab:'modules'},{label:'Tutor Allocation',target:'learning',learningTab:'modules'},{label:'Bulk Module Import',target:'learning',learningTab:'bulk'},{label:'Assign Modules',target:'learning',learningTab:'modules'},{label:'Auto-Assign Modules',target:'learning',learningTab:'bulk'}],
  school: [{label:'Active Students',target:'school'},{label:'Add New Student',target:'student-directory'},...makeTabs(['Bulk Enrollment','Completed → Graduates','Edit Student Details','Assign Intakes & Years','Detail Edit Requests','Print Basic List','Students List PDF (Filters & Select)','Manage Logins','Deleted Students & Recovery','Enrollment Links','Generate Bulk PDFs','Student Detail PDF'],'school')],
  employees: makeTabs(['Employee Directory','Add Employee','Edit Employee Details','Staff Roles & Departments','Staff Attendance','Employee Documents'],'users'),
  'staff-applications': makeTabs(['All Applications','Pending Review','Approved Applications','Rejected Applications','Application Documents'],'enrollments'),
  'navstar-analytics': makeTabs(['Overview','Student Analytics','Course Analytics','Revenue Analytics','Attendance Analytics'],'navstar-analytics'),
  'ai-intake-advisor': makeTabs(['AI Intake Advisor','Review Recommendations','Intake Forecasts'],'ai-intake-advisor'),
  'enrollment-summary': makeTabs(['Intake Summary','Enrollment by Course','Enrollment by Year','Enrollment Status'],'enrollments'),
  services: makeTabs(['Manage Services','Customer Carts','Service Orders'],'services'),
  pos: [{label:'Dashboards',target:'overview'},{label:'New Sale',target:'pos'},{label:'Packing & Delivery',target:'orders'},{label:'Payment Approvals',target:'finance'},{label:'Sales History',target:'receipts'},{label:'Scan & Sells',target:'pos'},{label:'Print Barcode Labels',target:'pos-tools'},{label:'Generate Missing Barcodes',target:'pos-tools'}],
  finance: makeTabs(['Accounts Overview','Transactions','Payment Receipts','Cashouts','Financial Reports'],'finance'),
  fees: makeTabs(['Collect Fees','Receipts','Fee Statements','Fee Defaulters','Enrollment Fee Offers'],'finance'),
  'marks-tests': makeTabs(['Marks Hub','Exam Management (AI)','Export Exam as PDF','Exam Room (Live Monitor)','Exam Settings','Results Moderation','Results Visibility','Approve Changes'],'marks-tests'),
  'student-projects': makeTabs(['All Projects','Submit Project','Review & Approve Projects','Project Showcase'],'student-projects'),
  scholarships: makeTabs(['Scholarship Register','Discount Applications','Approve Discounts','Award History'],'finance'),
  certificates: makeTabs(['Dashboard','Merit List — Promote to Complete','Graduation List — Complete → Graduate','Graduate Serial Processing','Certificate Management','Document Access Control','Certificate Templates','Academic Documents','Student Records','Examination Records','QR Auth Center','Digital Signatures','Reports & Analytics','Audit Logs','Certificate Settings'],'certificates'),
  alumni: makeTabs(['Alumni Directory','Graduate Records','Alumni Updates','Alumni Events'],'alumni'),
  'report-cards': makeTabs(['Report Card Dashboard','Create Report Cards','Preview & Approve','Transcripts','Print & Export'],'report-cards'),
  'auto-reports': makeTabs(['Document Generator','Report Templates','Bulk Generate','Generated Documents'],'auto-reports'),
  'student-status': makeTabs(['Active Students','Completed','Graduated','Deferred','Suspended','Removed Students'],'student-status'),
  attendance: makeTabs(['Attendance Register','Record Attendance','Attendance Summary','Attendance Reports'],'school'),
  'class-rating': makeTabs(['Rating Forms','Create Rating Form','Responses & Analysis'],'class-rating'),
  fingerprint: makeTabs(['Register Fingerprint','Scan & Verify','Fingerprint Records'],'fingerprint'),
  applications: makeTabs(['All Applications','New Applications','Review Applications','Application Status'],'enrollments'),
  'online-forms': makeTabs(['Form Builder','Published Forms','Form Responses'],'online-forms'),
  reports: makeTabs(['Operational Reports','Student Reports','Finance Reports','Export Reports'],'overview'),
  'analytics-reports': makeTabs(['Analytics Dashboard','Student Trends','Service Performance','Financial Performance'],'analytics-reports'),
  'songs-music': makeTabs(['Music Library','Upload Music','Playlists'],'songs-music'),
  gallery: makeTabs(['Photo Gallery','Upload Images','Manage Albums'],'gallery'),
  'news-updates': makeTabs(['All News','Publish Update','Drafts & Archives'],'downloads'),
  downloads: makeTabs(['Published Documents','Upload Documents','Manage Downloads'],'downloads'),
  events: makeTabs(['Upcoming Events','Add Event','Meetings & Minutes'],'events'),
  'demo-previews': makeTabs(['Available Demos','Preview Gallery','Manage Demo Links'],'demo-previews'),
  'cv-builder': makeTabs(['Create CV','My CV Templates','Export CV'],'cv-builder'),
  'upload-notes': makeTabs(['All Notes','Upload Notes','Organise by Course'],'learning'),
  timetable: makeTabs(['AI Timetable Generator','Academic Almanac','Schedule Calendar','Manual Schedules','Tutors & Daily Timetable PDF'],'school'),
  'online-classes': makeTabs(['Classrooms','Create Online Class','Class Materials'],'learning'),
  'eclass-meetings': makeTabs(['Meetings Dashboard','Schedule Meeting','Meeting History'],'learning'),
  'student-chat': makeTabs(['Student Conversations','New Message','Archived Chats'],'student-chat'),
  'support-tickets': makeTabs(['All Tickets','Open Tickets','Resolved Tickets'],'support-tickets'),
  'student-directory': makeTabs(['Student Directory','Search Students','Export Directory'],'school'),
  'send-notification': makeTabs(['Compose Notification','Notification History','Delivery Status'],'settings'),
  'broadcast-social': makeTabs(['Broadcast Message','Social Posts','Campaign History'],'settings'),
  'sms-alerts': makeTabs(['Send SMS','SMS Templates','SMS Delivery Reports'],'settings'),
  'birthday-center': makeTabs(['Upcoming Birthdays','Birthday Messages','Birthday History'],'birthday-center'),
  'about-us': makeTabs(['About Navstar','Mission & Vision','Contact Details'],'about-us'),
  'campus-history': makeTabs(['Campus Life','Institution History','Photo Highlights'],'gallery'),
  profile: [{label:'Account Details',target:'settings',settingsTab:'my-profile'}],
  users: makeTabs(['User Directory','Create User','Manage Logins','Staff IDs & Roles'],'users'),
  'device-management': makeTabs(['Registered Devices','Device Activation','Device Activity'],'device-management'),
  'admin-access': makeTabs(['Admin Roles','Access Permissions','Access Logs'],'admin-access'),
  'customer-accounts': makeTabs(['Customer Accounts','Account Balances','Payment History'],'users'),
  maintenance: makeTabs(['Maintenance Status','Enable / Disable Maintenance','Maintenance Notices'],'maintenance'),
  'ict-portal': makeTabs(['ICT Service Requests','ICT Services & Pricing','Student Gateway','Tutor Portal','Finance Portal','Principal Portal','Deputy Principal'],'portal-links'),
  settings: [
    {label:"Institute Profile",target:'settings',settingsTab:'complete'},
    {label:"Fee Structures (PDFs)",target:'settings',settingsTab:'complete'},
    {label:"Enrollment Settings",target:'settings',settingsTab:'complete'},
    {label:"Academic Intakes",target:'settings',settingsTab:'complete'},
    {label:"Institution & Campuses",target:'settings',settingsTab:'complete'},
    {label:"Rules & Regulations",target:'settings',settingsTab:'complete'},
    {label:"Marks & Grading",target:'settings',settingsTab:'complete'},
    {label:"Institutional Branding",target:'settings',settingsTab:'complete'},
    {label:"Home Page Content",target:'settings',settingsTab:'complete'},
    {label:"Trusted Platforms",target:'settings',settingsTab:'complete'},
    {label:"News & Announcements",target:'settings',settingsTab:'complete'},
    {label:"Documents & Downloads",target:'settings',settingsTab:'complete'},
    {label:"Report Card Layout",target:'settings',settingsTab:'complete'},
    {label:"ID Card Design Studio",target:'settings',settingsTab:'complete'},
    {label:"ID Cards (Bulk Print)",target:'settings',settingsTab:'complete'},
    {label:"Rubber Stamp Designer",target:'settings',settingsTab:'complete'},
    {label:"Payment Methods",target:'settings',settingsTab:'complete'},
    {label:"Results & Attendance Criteria",target:'settings',settingsTab:'complete'},
    {label:"Completion Criteria",target:'settings',settingsTab:'complete'},
    {label:"System Activity Monitor",target:'settings',settingsTab:'complete'},
    {label:"Audit Logs",target:'settings',settingsTab:'complete'},
    {label:"Theme & Language",target:'settings',settingsTab:'complete'},
    {label:"Maintenance Mode",target:'settings',settingsTab:'complete'},
    {label:"Admissions Progress & Letters",target:'settings',settingsTab:'complete'},
  ],
  orders: makeTabs(['Service Orders','Customer Carts','Order Status'],'orders'),
  receipts: makeTabs(['Payment Receipts','Verified Receipts','Receipt Search'],'receipts'),
};

export function AdminPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState<Section>('overview');
  const [expandedSection, setExpandedSection] = useState<Section>('overview');
  const [selectedSubtab, setSelectedSubtab] = useState('');
  const [coursesSubTab, setCoursesSubTab] = useState<'catalogue' | 'manage' | 'edit'>('catalogue');
  const [learningSubTab, setLearningSubTab] = useState<'modules' | 'bulk'>('modules');
  const [settingsTab, setSettingsTab] = useState<'complete' | 'site' | 'notifications' | 'my-profile' | 'geography' | 'staff-ids'>('complete');
  const [profileSubTab, setProfileSubTab] = useState<'account' | 'personal' | 'employment' | 'location'>('account');
  const [profileSystemDetails, setProfileSystemDetails] = useState<Record<string, unknown>>({});
  const [profileLoadError, setProfileLoadError] = useState('');
  const [profileLoadWarning, setProfileLoadWarning] = useState('');
  const [profileReload, setProfileReload] = useState(0);
  const [profileSaving, setProfileSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const adminPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);
  const [adminPhotoUploading, setAdminPhotoUploading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [services, setServices] = useState(initialServices);
  const [serviceName, setServiceName] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Cyber cafe');
  const [servicePrice, setServicePrice] = useState('');
  const [servicePriceAmount, setServicePriceAmount] = useState('');
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [coursePrice, setCoursePrice] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseDuration, setCourseDuration] = useState('4 Months');
  const [courseCategory, setCourseCategory] = useState<Course['category']>('Professional');
  const [courseLevel, setCourseLevel] = useState<Course['level']>('Beginner');
  const [courseImage, setCourseImage] = useState('');
  const [feeCourseId, setFeeCourseId] = useState('');
  const [feeItems, setFeeItems] = useState<{id:string;itemName:string;amount:number;dueStage:string;required:boolean;sortOrder:number;active:boolean}[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeStudentsMissing, setFeeStudentsMissing] = useState(0);
  const [feeSaving, setFeeSaving] = useState(false);
  const [feeStudentsWithoutAdmissionFee, setFeeStudentsWithoutAdmissionFee] = useState(0);
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
  const [posCustomerName, setPosCustomerName] = useState('');
  const [posPhone, setPosPhone] = useState('');
  const [posSelectedService, setPosSelectedService] = useState('');
  const [posQuantity, setPosQuantity] = useState('1');
  const [posCart, setPosCart] = useState<{serviceId:string;quantity:number}[]>([]);
  const [posPayment, setPosPayment] = useState<{id:string;reference:string;status:string}|null>(null);
  const [posProcessing, setPosProcessing] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState<{id:string;title:string;message:string;read_at:string|null;created_at:string}[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);

  const [learningCourses, setLearningCourses] = useState<LearningCourse[]>([]);
  const [learningTutors, setLearningTutors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [learningCourseId, setLearningCourseId] = useState('');
  const [learningModuleId, setLearningModuleId] = useState('');
  const [learningModuleTitle, setLearningModuleTitle] = useState('');
  const [learningModuleDescription, setLearningModuleDescription] = useState('');
  const [learningModuleEdits, setLearningModuleEdits] = useState<Record<string,{title:string;description:string;status:string}>>({});
  const [learningTutorModuleId, setLearningTutorModuleId] = useState('');
  const [learningModuleTutorAssignments, setLearningModuleTutorAssignments] = useState<{module_id:string;tutor_user_id:string;tutor_name:string;tutor_email:string}[]>([]);
  const [learningViewModuleId, setLearningViewModuleId] = useState('');
  const [moduleImportRows, setModuleImportRows] = useState<{ courseId: string; courseName: string; title: string; description: string; status: string; sortOrder: number }[]>([]);
  const [moduleImportName, setModuleImportName] = useState('');
  const [serviceImportRows, setServiceImportRows] = useState<{ name: string; category: string; price: string; priceAmount: string }[]>([]);
  const [learnerImportRows, setLearnerImportRows] = useState<{ admissionNumber: string; firstName: string; middleName: string; lastName: string; classId: string; gender: string; dateOfBirth: string }[]>([]);
  const [marksImportRows, setMarksImportRows] = useState<{ submissionId: string; pointsAwarded: number; feedback: string }[]>([]);
  const [learningLessonTitle, setLearningLessonTitle] = useState('');
  const [learningLessonContent, setLearningLessonContent] = useState('');
  const [learningLessonMinutes, setLearningLessonMinutes] = useState('15');
  const [learningResourceFile, setLearningResourceFile] = useState<File | null>(null);
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
          const result = await learningResponse.json() as { courses?: LearningCourse[]; tutors?: { id: string; name: string; email: string }[]; moduleTutorAssignments?: {module_id:string;tutor_user_id:string;tutor_name:string;tutor_email:string}[] };
          if (result.courses) setLearningCourses(result.courses);
          if (result.tutors) setLearningTutors(result.tutors);
          if (result.moduleTutorAssignments) setLearningModuleTutorAssignments(result.moduleTutorAssignments);
          if (result.courses?.length) { setLearningCourseId(result.courses[0].id); setLearningViewModuleId(result.courses[0].modules?.[0]?.id || ''); }
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
      setAdminPhotoUrl(String(result.profile.profilePhotoUrl ?? result.profile.profile_photo_url ?? '') || null);
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
      const at = (key: string) => headers.indexOf(key);
      const titleIndex = at('modulename') >= 0 ? at('modulename') : at('title');
      const courseIdIndex = at('courseid');
      const courseNameIndex = at('coursename');
      const courseCodeIndex = at('coursecode');
      if (titleIndex < 0 || (courseIdIndex < 0 && courseNameIndex < 0 && courseCodeIndex < 0)) throw new Error('The CSV must include Course ID, Course Code or Course Name, Module Name and Module Order columns.');
      const descriptionIndex = at('description');
      const statusIndex = at('status');
      const orderIndex = at('moduleorder') >= 0 ? at('moduleorder') : at('sortorder');

      const normalizeCourseName=(value:string)=>value.toLowerCase().normalize('NFKD').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean).filter(word=>!['course','coding','code','level','programme','program','class','training','the','and','in','of'].includes(word)).join(' ');
      const resolveCourse=(idValue:string,nameValue:string,codeValue:string)=>{
        if(idValue){const byId=learningCourses.find(item=>item.id.toLowerCase()===idValue.toLowerCase());if(byId)return byId;}
        if(codeValue){const byCode=learningCourses.find(item=>String(item.course_code||'').trim().toUpperCase()===codeValue);if(byCode)return byCode;}
        const key=normalizeCourseName(nameValue||codeValue||idValue);if(!key)return undefined;
        const exact=learningCourses.find(item=>normalizeCourseName(item.title)===key);if(exact)return exact;
        const wanted=new Set(key.split(' '));let best:typeof learningCourses[number]|undefined,bestScore=0,second=0;
        for(const item of learningCourses){const tokens=new Set(normalizeCourseName(item.title).split(' '));const overlap=[...wanted].filter(token=>tokens.has(token)).length;const score=overlap/Math.max(1,Math.min(wanted.size,tokens.size));if(score>bestScore){second=bestScore;bestScore=score;best=item;}else if(score>second)second=score;}
        return bestScore>=0.66&&bestScore-second>=0.12?best:undefined;
      };
      const rows = parsed.slice(1).map((row, index) => {
        const courseIdValue = courseIdIndex >= 0 ? (row[courseIdIndex] || '').trim() : '';
        const courseNameValue = courseNameIndex >= 0 ? (row[courseNameIndex] || '').trim() : '';
        const courseCodeValue = courseCodeIndex >= 0 ? (row[courseCodeIndex] || '').trim().toUpperCase() : '';
        const course = resolveCourse(courseIdValue,courseNameValue,courseCodeValue);
        return {
          courseId: course?.id || '',
          courseName: course?.title || courseNameValue || courseCodeValue || courseIdValue,
          title: titleIndex >= 0 ? (row[titleIndex] || '').trim() : '',
          description: descriptionIndex >= 0 ? row[descriptionIndex] || '' : '',
          status: statusIndex >= 0 && row[statusIndex]?.toLowerCase() === 'draft' ? 'draft' : 'published',
          sortOrder: orderIndex >= 0 && Number.isFinite(Number(row[orderIndex])) && String(row[orderIndex]||'').trim() ? Number(row[orderIndex]) : index + 1,
        };
      }).filter(row => row.title);
      if (!rows.length) throw new Error('No valid module rows were found in that file.');
      if (rows.length > 100) throw new Error('Upload up to 100 modules at a time.');
      const unresolved = rows.filter(row => !row.courseId);
      if (unresolved.length) throw new Error('Navstar could not confidently identify the course for: ' + unresolved.map(row => row.courseName).slice(0, 3).join(', '));
      setModuleImportRows(rows);
      setModuleImportName(file.name);
      setNotice(`${rows.length} module rows across ${new Set(rows.map(row => row.courseId)).size} courses are ready. Each module will be routed to its selected course in the listed order.`);
    } catch (error) {
      setModuleImportRows([]);
      setModuleImportName('');
      setNotice(error instanceof Error ? error.message : 'The module template could not be read.');
    }
  };

  const importModules = async () => {
    if (!moduleImportRows.length) { setNotice('Choose a completed module CSV first.'); return; }
    const rows = [...moduleImportRows].sort((a,b) => a.courseId.localeCompare(b.courseId) || a.sortOrder-b.sortOrder);
    const saved = await submitLearningAction({ action: 'bulk_create_modules_multi', rows }, 'All module rows imported and routed to their selected courses.');
    if (saved) { const summary=rows.reduce((groups,row)=>{groups.set(row.courseName,[...(groups.get(row.courseName)||[]),row.title]);return groups;},new Map<string,string[]>());setModuleImportRows([]);setModuleImportName('');setNotice('SUCCESS: '+rows.length+' modules saved. '+[...summary.entries()].map(([course,titles])=>course+': '+titles.join(', ')).join(' | ')); }
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

  const readMarksImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('The marks CSV needs a header and at least one row.');
      const headers = parsed[0].map(value => value.toLowerCase().replace(/[^a-z]/g, ''));
      const idIndex = headers.indexOf('submissionid'); const scoreIndex = headers.indexOf('pointsawarded'); const feedbackIndex = headers.indexOf('feedback');
      if (idIndex < 0 || scoreIndex < 0) throw new Error('The marks template needs submissionId and pointsAwarded columns.');
      const rows = parsed.slice(1).map(row => ({ submissionId: row[idIndex] || '', pointsAwarded: Number(row[scoreIndex]), feedback: feedbackIndex >= 0 ? row[feedbackIndex] || '' : '' })).filter(row => row.submissionId.trim());
      if (!rows.length || rows.length > 100 || rows.some(row => !Number.isSafeInteger(row.pointsAwarded) || row.pointsAwarded < 0)) throw new Error('Choose a file with 1–100 valid marks rows. Scores must be whole numbers of zero or more.');
      setMarksImportRows(rows); setNotice(`${rows.length} marks rows ready. The server will validate each score against its assessment maximum.`);
    } catch (error) { setMarksImportRows([]); setNotice(error instanceof Error ? error.message : 'Marks template could not be read.'); }
  };

  const importMarks = async () => {
    if (!marksImportRows.length) return;
    const saved = await submitLearningAction({ action: 'bulk_grade_submissions', rows: marksImportRows }, 'Marks imported and saved successfully.');
    if (saved) setMarksImportRows([]);
  };

  const exportLearningModules = (format: 'excel' | 'word' | 'pdf') => {
    const rows = learningCourses.flatMap(course => course.modules.map(module => ({
      Course: course.title, Title: module.title, Description: module.description, Status: module.status,
      Lessons: module.lessons.length,
    })));
    try { exportBrandedData(format, 'Learning Modules Register', ['Course', 'Title', 'Description', 'Status', 'Lessons'], rows); }
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
      'Submission ID': submission.id, Course: course.title, Assessment: assignment.title, Learner: submission.learner_name,
      Score: submission.points_awarded ?? '', 'Maximum score': assignment.max_points,
      Status: submission.status, Feedback: submission.feedback || '',
    }))));
    try { exportBrandedData(format, 'Assessment and Marks Register', ['Submission ID', 'Course', 'Assessment', 'Learner', 'Score', 'Maximum score', 'Status', 'Feedback'], rows); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Export could not be created.'); }
  };

  const submitLearningAction = async (payload: Record<string, unknown>, success: string) => {
    try {
      const response = await fetch('/api/learning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Learning management action failed.');
      const refresh = await fetch('/api/learning');
      if (refresh.ok) {
        const data = await refresh.json() as { courses?: LearningCourse[]; tutors?: { id: string; name: string; email: string }[]; moduleTutorAssignments?: {module_id:string;tutor_user_id:string;tutor_name:string;tutor_email:string}[] };
        if (data.courses) setLearningCourses(data.courses);
        if (data.tutors) setLearningTutors(data.tutors);
        if (data.moduleTutorAssignments) setLearningModuleTutorAssignments(data.moduleTutorAssignments);
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
    setDocuments((current) => [{ id: result.id!, title: result.title ?? documentFile.name, description: result.description ?? '', originalName: result.originalName ?? documentFile.name, sizeBytes: result.sizeBytes ?? documentFile.size, url: result.url ?? `/api/download/${result.id}` }, ...current]);
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

  const generateAdmissionNumber = async (enrollmentId: string) => {
    try {
      const response = await fetch('/api/admin/admission-number', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId }) });
      const result = await response.json() as { admissionNumber?: string; error?: string };
      if (!response.ok || !result.admissionNumber) throw new Error(result.error || 'Admission number could not be generated.');
      setApplications(current => current.map(item => String(item.id) === enrollmentId ? { ...item, admission_number: result.admissionNumber } : item));
      setNotice('Admission number ' + result.admissionNumber + ' generated and saved. Student notification has been queued.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Admission number could not be generated.'); }
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

  const loadFeeStructure = async (selectedCourseId = feeCourseId) => {
    if (!selectedCourseId) { setNotice('Select a course first.'); return; }
    setFeeLoading(true);
    try {
      const response = await fetch('/api/admin/course-fees?courseId=' + encodeURIComponent(selectedCourseId));
      const result = await response.json() as {items?:{id:string;itemName:string;amount:number;dueStage:string;required:number;sortOrder:number;active:number}[];studentsWithoutAdmissionFee?:number;error?:string};
      if (!response.ok) throw new Error(result.error || 'Fee structure could not be loaded.');
      setFeeItems((result.items||[]).map(item=>({...item,required:Boolean(item.required),active:Boolean(item.active)})));
      setFeeStudentsMissing(Number(result.studentsWithoutAdmissionFee||0));
      setFeeStudentsWithoutAdmissionFee(Number(result.studentsWithoutAdmissionFee||0));
      setNotice('Course fee items loaded. Update the amounts and save when ready.');
    } catch(error) { setNotice(error instanceof Error?error.message:'Fee structure could not be loaded.'); }
    finally { setFeeLoading(false); }
  };
  const saveFeeStructure = async () => {
    if (!feeCourseId || !feeItems.length) { setNotice('Add at least one fee item.'); return; }
    setFeeSaving(true);
    try {
      const response=await fetch('/api/admin/course-fees',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseId:feeCourseId,items:feeItems})});
      const result=await response.json() as {items?:typeof feeItems;error?:string};
      if(!response.ok||!result.items)throw new Error(result.error||'Fee structure could not be saved.');
      setFeeItems(result.items.map(item=>({...item,required:Boolean(item.required),active:Boolean(item.active)})));
      setFeeStudentsMissing(0);
      setNotice('Fee structure saved. The Admission fee is the required first-payment item for new enrolments.');
    } catch(error) { setNotice(error instanceof Error?error.message:'Fee structure could not be saved.'); }
    finally { setFeeSaving(false); }
  };

  const addCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!courseName.trim() || Number(coursePrice) < 1) return;
    const payload = { title: courseName.trim(), courseCode: courseCode.trim().toUpperCase(), description: courseDescription.trim(), duration: courseDuration.trim(), image: courseImage.trim(), category: courseCategory, level: courseLevel, price: Number(coursePrice) };
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
    setCourseCode('');
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
    setCourseCode(String((course as Course & {course_code?:string}).course_code || ''));
    setCoursePrice(String(course.price));
    setCourseDescription(course.description);
    setCourseDuration(course.duration);
    setCourseCategory(course.category);
    setCourseLevel(course.level ?? 'Beginner');
    setCourseImage(course.image);
    setActive('courses');
    setCoursesSubTab('edit');
    setNotice('Editing course. Update the fields above and save your changes.');
  };

  const saveCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCourseId || !courseName.trim() || !Number.isSafeInteger(Number(coursePrice)) || Number(coursePrice) < 0) return;
    const payload = { title: courseName.trim(), courseCode: courseCode.trim().toUpperCase(), description: courseDescription.trim(), duration: courseDuration.trim(), image: courseImage.trim(), category: courseCategory, level: courseLevel, price: Number(coursePrice) };
    if (backendReady) {
      const response = await fetch(`/api/courses/${encodeURIComponent(editingCourseId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) { setNotice(result.error ?? 'Course could not be updated.'); return; }
    }
    setCourses((current) => current.map((course) => course.id === editingCourseId ? { ...course, ...payload } : course));
    setNotice(backendReady ? 'Course updated and published.' : 'Course updated in this preview only.');
    setEditingCourseId(''); setCourseName(''); setCourseCode(''); setCoursePrice(''); setCourseDescription(''); setCourseDuration('4 Months'); setCourseCategory('Professional'); setCourseLevel('Beginner'); setCourseImage('');
  };

  const cancelCourseEdit = () => { setEditingCourseId(''); setCourseName(''); setCourseCode(''); setCoursePrice(''); setCourseDescription(''); setCourseDuration('4 Months'); setCourseCategory('Professional'); setCourseLevel('Beginner'); setCourseImage(''); };

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

  const createStudentRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const password = String(values.password || '');
    const confirmPassword = String(values.confirmPassword || '');
    if (!isPasswordStrong(password)) { setNotice('Use a 6–12 character password with at least three character types: uppercase, lowercase, number or symbol.'); return; }
    if (password !== confirmPassword) { setNotice('The student passwords do not match.'); return; }
    try {
      setNotice('Saving student account and course enrollment…');
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, name: values.fullName, role: 'student', nationalId: values.identityNumber, citizenship: values.nationality || 'Kenyan' }),
      });
      const result = await readApiResponse<{ user?: PortalUser; enrollment?: Record<string, unknown> | null; error?: string }>(response);
      if (!response.ok || !result.user || !result.enrollment) throw new Error(result.error || 'Student registration could not be saved.');
      setPortalUsers(current => [result.user!, ...current]);
      setApplications(current => [result.enrollment!, ...current]);
      form.reset();
      setNotice(`Student registered successfully. Student ID: ${result.user.staffId || 'assigned'} · Application reference: ${String(result.enrollment.reference || result.enrollment.id || '')}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Student registration could not be saved.');
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
          name: newUserName, email: newUserEmail, role: active === 'student-directory' ? 'student' : active === 'employees' && newUserRole === 'student' ? 'tutor' : newUserRole, password: newUserPassword,
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

  const loadAdminNotifications = async () => {
    setNotificationLoading(true);
    try {
      const response = await fetch('/api/admin/notifications', { credentials: 'same-origin' });
      const result = await response.json() as { notifications?: typeof adminNotifications; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not load notifications.');
      setAdminNotifications(result.notifications ?? []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load notifications.');
    } finally { setNotificationLoading(false); }
  };

  const addPosItem = () => {
    const service = services.find(item => item.id === posSelectedService && item.status === 'Active');
    const quantity = Number(posQuantity);
    if (!service || !service.priceAmount || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
      setNotice('Choose an active service with a fixed online price and a valid quantity.');
      return;
    }
    setPosCart(current => {
      const found = current.find(item => item.serviceId === service.id);
      return found ? current.map(item => item.serviceId === service.id ? {...item,quantity:item.quantity+quantity} : item) : [...current,{serviceId:service.id,quantity}];
    });
    setPosQuantity('1');
    setNotice('');
  };

  const startPosSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!posCustomerName.trim() || !posPhone.trim() || !posCart.length) { setNotice('Enter the customer name, phone number and add at least one service.'); return; }
    setPosProcessing(true); setPosPayment(null); setNotice('Creating sale and sending M-Pesa prompt…');
    try {
      const orderResponse = await fetch('/api/service-requests', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:posCustomerName,phone:posPhone,items:posCart})});
      const order = await orderResponse.json() as {id?:string;reference?:string;amount?:number;error?:string};
      if(!orderResponse.ok || !order.id) throw new Error(order.error || 'Could not create the sale.');
      const promptResponse = await fetch('/api/payments/stk-push', {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({purpose:'service',reference:order.id,phone:posPhone})});
      const prompt = await promptResponse.json() as {id?:string;reference?:string;message?:string;error?:string};
      if(!promptResponse.ok || !prompt.id) throw new Error(prompt.error || 'The M-Pesa prompt could not be sent.');
      setPosPayment({id:prompt.id,reference:order.reference || prompt.reference || '',status:'pending'});
      setNotice(prompt.message || 'M-Pesa prompt sent. Waiting for customer confirmation…');
      const paymentId=prompt.id;
      const checkPayment = async (attempt:number):Promise<void> => {
        const statusResponse=await fetch('/api/payments/stk-push?reference='+encodeURIComponent(paymentId),{credentials:'same-origin'});
        const statusResult=await statusResponse.json() as {payment?:{status:string};error?:string};
        if(!statusResponse.ok) throw new Error(statusResult.error || 'Could not verify payment status.');
        const status=statusResult.payment?.status || 'pending';
        setPosPayment({id:paymentId,reference:order.reference || '',status});
        if(status==='paid'){setNotice('Payment verified successfully. Your Navstar receipt is ready.');return;}
        if(status==='failed'){setNotice('M-Pesa payment was not completed. You can retry the sale.');return;}
        if(attempt<40){await new Promise(resolve=>window.setTimeout(resolve,3000));return checkPayment(attempt+1);}
        setNotice('The payment is still pending. Check the status before starting another sale.');
      };
      await checkPayment(1);
    } catch(error) {
      setNotice(error instanceof Error ? error.message : 'The sale could not be completed.');
    } finally { setPosProcessing(false); }
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

  const uploadAdminProfilePhoto = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) { setNotice('Choose a JPG, PNG, WebP or AVIF profile photo.'); return; }
    if (file.size > 3 * 1024 * 1024) { setNotice('Profile photo must be 3 MB or smaller.'); return; }
    setAdminPhotoUploading(true); setNotice('');
    try {
      const body = new FormData(); body.append('file', file);
      const response = await fetch('/api/account/profile-photo', { method: 'POST', body });
      const result = await readApiResponse<{ profilePhotoUrl?: string; error?: string }>(response);
      if (!response.ok || !result.profilePhotoUrl) throw new Error(result.error || 'Profile photo could not be saved.');
      setAdminPhotoUrl(result.profilePhotoUrl);
      setUser(current => current ? { ...current, profilePhotoUrl: result.profilePhotoUrl } : current);
      setNotice('Your Admin profile picture has been saved successfully.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Profile photo could not be saved.'); }
    finally { setAdminPhotoUploading(false); if (adminPhotoInputRef.current) adminPhotoInputRef.current.value = ''; }
  };

  return (
    <main className="h-screen overflow-hidden bg-[#080d19] text-slate-100 navstar-admin">
      <div className={'mx-auto grid h-screen max-w-[1800px] grid-cols-1 overflow-hidden md:grid-rows-1 ' + (sidebarCollapsed ? 'md:grid-cols-[76px_minmax(0,1fr)]' : 'md:grid-cols-[250px_minmax(0,1fr)]')}>
        {mobileNavOpen && <button type="button" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-40 bg-slate-950/70 md:hidden" />}
        <aside className={`navstar-admin-sidebar fixed inset-y-0 left-0 z-50 flex h-screen w-[min(19rem,88vw)] min-w-0 flex-col border-r border-white/10 bg-[#0b2348] text-white shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:z-40 md:w-auto md:translate-x-0 md:shadow-none ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-3 md:px-5 md:py-5">
            <div className={sidebarCollapsed ? "md:hidden" : "flex items-center gap-3"}>
              <div className="relative"><img src="/Navstar_Official_Logo.jpg" alt="Navstar Digital Hub" className="h-10 w-10 rounded-lg bg-white object-contain p-1"/><span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b2348] bg-emerald-400"/></div>
              <div><h1 className="text-base font-extrabold">Admin Portal</h1><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">NAVSTAR DIGITAL HUB</p></div>
            </div>
            <button type="button" onClick={() => setSidebarCollapsed(value => !value)} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-slate-200 transition hover:bg-white/10 hover:text-white md:inline-flex" aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>{sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4"/> : <PanelLeftClose className="h-4 w-4"/>}</button>
          </div>
          <div className="mx-3 mt-3 hidden h-1 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 md:block"/>
          <nav aria-label="Admin sections" className="flex min-w-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto p-2 md:min-h-0 md:space-y-1 md:p-3">
            {sections.map(({id,label,icon:Icon}) => {
              const selected = expandedSection === id;
              const children = sectionSubtabs[id] || [];
              return <div key={id} className="min-w-0 shrink-0 md:w-full">
                <button type="button" onClick={() => { setExpandedSection(id); setActive(id); setSelectedSubtab(children[0]?.label || ''); if(children[0]?.settingsTab)setSettingsTab(children[0].settingsTab); else if(id==='settings')setSettingsTab('complete'); if(children[0]?.coursesTab)setCoursesSubTab(children[0].coursesTab); if(children[0]?.learningTab)setLearningSubTab(children[0].learningTab); setNotice(''); if(children.length===0)setMobileNavOpen(false); }} aria-current={selected ? 'page' : undefined} aria-expanded={selected && !sidebarCollapsed} className={`flex min-h-10 shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition md:w-full ${selected ? 'bg-gradient-to-r from-blue-700/70 to-cyan-700/20 text-white shadow-lg shadow-blue-950/30 ring-1 ring-blue-400/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}>
                  <Icon className="h-4 w-4 shrink-0"/><span className={sidebarCollapsed ? "md:hidden" : "min-w-0 flex-1 truncate"}>{label}</span>
                  {children.length>0 && <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${selected ? 'rotate-180 text-cyan-300' : 'text-slate-500'}`}/>}
                </button>
                {selected && !sidebarCollapsed && children.length>0 && <div className="ml-5 mt-1 space-y-1 border-l border-cyan-400/30 py-1 pl-3">
                  {children.map((tab,index) => {
                    const isCurrent = expandedSection === id && selectedSubtab === tab.label && (tab.label !== 'Add New Student' || active === 'student-directory');
                    return <button key={tab.label} type="button" onClick={() => { setActive(tab.label === 'Add New Student' ? 'student-directory' : expandedSection); setSelectedSubtab(tab.label); if(tab.settingsTab)setSettingsTab(tab.settingsTab); if(tab.coursesTab)setCoursesSubTab(tab.coursesTab); if(tab.learningTab)setLearningSubTab(tab.learningTab); setNotice(''); setMobileNavOpen(false); }} aria-current={isCurrent?'page':undefined} className={`navstar-subtab flex min-h-8 w-full items-center justify-start rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${isCurrent ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/20' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><span className="mr-2 h-1.5 w-1.5 rounded-full bg-current opacity-70"/>{tab.label}</button>;
                  })}
                </div>}
              </div>;
            })}
          </nav>
          <div className="hidden border-t border-white/10 p-3 md:block">
            <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10 hover:text-rose-200"><LogOut className="h-4 w-4"/> {!sidebarCollapsed && 'Logout'}</button>
          </div>
        </aside>

        <section ref={contentRef} className="navstar-admin-content h-full min-h-0 min-w-0 overflow-y-auto">
          <header className="navstar-admin-topbar sticky top-0 z-30 flex min-h-[58px] items-center gap-3 border-b border-white/10 bg-[#0c111e]/95 px-4 py-2 shadow-lg shadow-black/10 backdrop-blur-xl sm:px-5 lg:px-6">
            <button type="button" onClick={() => setSidebarCollapsed(value=>!value)} className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white md:inline-flex" aria-label="Toggle sidebar"><PanelLeftClose className="h-4 w-4"/></button>
            <button type="button" onClick={() => setMobileNavOpen(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-cyan-300 transition hover:bg-white/10 hover:text-white md:hidden" aria-label="Open Admin navigation"><PanelLeftOpen className="h-5 w-5"/></button><button type="button" onClick={() => navigate(-1)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Go back"><ArrowLeft className="h-4 w-4"/></button>
            <img src="/Navstar_Official_Logo.jpg" alt="Navstar" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5"/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-white">Welcome back, <span className="text-cyan-300">{user.name}</span> 👋</p>
              <p className="truncate text-[10px] text-slate-400">{formatEATDateTime(new Date().toISOString())} · <span className="text-blue-300">NAVSTAR DIGITAL HUB</span> · {title}</p>
            </div>
            <div className="hidden w-full max-w-[290px] items-center gap-2 rounded-xl border border-white/10 bg-[#111a2b] px-3 py-2 md:flex">
              <Search className="h-4 w-4 shrink-0 text-slate-500"/>
              <input aria-label="Search admin sections" placeholder="Search students, courses, fees..." className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-slate-500" onKeyDown={event=>{if(event.key==='Enter'){const q=event.currentTarget.value.trim().toLowerCase();const match=sections.find(item=>item.label.toLowerCase().includes(q));if(match){setExpandedSection(match.id);setActive(match.id);setSelectedSubtab('');setNotice('');}}}}/>
            </div>
            <button type="button" onClick={()=>window.location.reload()} title="Refresh workspace" aria-label="Refresh workspace" className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white sm:inline-flex"><RefreshCw className="h-4 w-4"/></button>
            <div className="relative">
              <button type="button" onClick={()=>{const next=!notificationOpen;setNotificationOpen(next);if(next)void loadAdminNotifications();}} title="Notifications" aria-label="Notifications" aria-expanded={notificationOpen} className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"><Bell className="h-4 w-4"/>{adminNotifications.some(item=>!item.read_at)&&<span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-400"/>}</button>
              {notificationOpen&&<div className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700 bg-[#111a2b] shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><p className="text-sm font-extrabold text-white">Notifications</p><p className="text-[10px] text-slate-400">{adminNotifications.filter(item=>!item.read_at).length} unread</p></div><button type="button" onClick={()=>setNotificationOpen(false)} className="text-xs font-semibold text-cyan-300">Close</button></div>
                <div className="max-h-80 overflow-y-auto">{notificationLoading?<p className="p-4 text-xs text-slate-400">Loading notifications…</p>:adminNotifications.length?adminNotifications.slice(0,12).map(item=><article key={item.id} className={`border-b border-white/5 px-4 py-3 ${item.read_at?'':'bg-blue-500/10'}`}><p className="text-xs font-bold text-white">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-300">{item.message}</p><p className="mt-1 text-[10px] text-slate-500">{formatEATDateTime(item.created_at)}</p></article>):<p className="p-5 text-center text-xs text-slate-400">No notifications yet.</p>}</div>
                <Link to="/portals/notifications" className="block border-t border-white/10 px-4 py-3 text-center text-xs font-bold text-cyan-300 hover:bg-white/5">View all notifications</Link>
              </div>}
            </div>
            <button type="button" onClick={()=>{setSettingsTab('my-profile');setActive('settings');setNotice('');}} title="My profile" aria-label="My profile" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-950/30"><UserRound className="h-4 w-4"/></button>
            <div className="hidden min-w-0 max-w-[150px] lg:block"><p className="truncate text-[11px] font-extrabold uppercase text-white">{user.name}</p><p className="text-[9px] font-bold uppercase tracking-wide text-cyan-300">Admin · Secure session</p></div>
            <button type="button" onClick={()=>void signOut()} title="Log out" aria-label="Log out" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><LogOut className="h-4 w-4"/></button>
          </header>

          <div className="px-4 py-4 sm:px-6 lg:px-7">
          {notice && <p role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</p>}

          {selectedSubtab && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/20 bg-gradient-to-r from-[#102344] to-[#111c31] px-4 py-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-cyan-300">{sections.find(item=>item.id===expandedSection)?.label || 'Workspace'}</p><h2 className="mt-1 text-base font-extrabold text-white">{selectedSubtab}</h2></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold text-slate-300">Workspace view</span></div>}

          {active === 'overview' && <AdminDashboard
            metrics={metrics}
            applications={applications as { id?: string; full_name?: string; course_id?: string; status?: string; payment_status?: string; created_at?: string; preferred_intake?: string }[]}
            courses={courses}
            users={portalUsers}
            onNavigate={(section, subtab) => {
              setExpandedSection(section);
              setActive(section);
              setSelectedSubtab(subtab || '');
              if (section === 'settings') setSettingsTab('complete');
              if (section === 'courses' && subtab) setCoursesSubTab('manage');
              if (section === 'learning' && subtab) setLearningSubTab('modules');
              setNotice('');
              contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />}

          {active === 'courses' && selectedSubtab !== 'Fee Structures' && <div className="space-y-5">{(coursesSubTab === 'manage' || (coursesSubTab === 'edit' && Boolean(editingCourseId))) && <form onSubmit={editingCourseId ? saveCourse : addCourse} className="grid gap-3 border bg-white p-4 sm:grid-cols-2 xl:grid-cols-3"><div className="space-y-2 sm:col-span-2 xl:col-span-3"><h3 className="font-bold text-slate-950">{editingCourseId ? 'Edit course details' : 'Add a new course'}</h3><p className="text-xs text-slate-500">All fees are whole Kenyan shillings for M-Pesa payment compatibility.</p></div><div className="space-y-2"><Label htmlFor="new-course">Course title</Label><Input id="new-course" value={courseName} onChange={(event) => setCourseName(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="new-course-code">Course code</Label><Input id="new-course-code" value={courseCode} onChange={(event) => setCourseCode(event.target.value.toUpperCase())} placeholder="e.g. CP003" maxLength={7}/><p className="text-[11px] text-slate-500">Letters plus a three-digit course number. Used in admission numbers.</p></div><div className="space-y-2"><Label htmlFor="new-course-price">Fee (KSh)</Label><Input id="new-course-price" type="number" min="0" step="1" value={coursePrice} onChange={(event) => setCoursePrice(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="course-duration">Duration</Label><Input id="course-duration" value={courseDuration} onChange={(event) => setCourseDuration(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="course-category">Category</Label><select id="course-category" value={courseCategory} onChange={(event) => setCourseCategory(event.target.value as Course['category'])} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option>Professional</option><option>Computer School</option><option>Cyber Services</option></select></div><div className="space-y-2"><Label htmlFor="course-image">Course image URL</Label><Input id="course-image" value={courseImage} onChange={(event) => setCourseImage(event.target.value)} placeholder="https://..." /></div><div className="space-y-2"><Label htmlFor="course-level">Course level</Label><select id="course-level" value={courseLevel} onChange={(event) => setCourseLevel(event.target.value as Course['level'])} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label htmlFor="course-description">Course description</Label><textarea id="course-description" value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" /></div><div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-3"><Button type="submit" className="bg-emerald-800 hover:bg-emerald-900">{editingCourseId ? <><Save className="mr-2 h-4 w-4" />Save course</> : <><Plus className="mr-2 h-4 w-4" />Add course</>}</Button>{editingCourseId && <Button type="button" variant="outline" onClick={cancelCourseEdit}>Cancel edit</Button>}</div></form>}{coursesSubTab === 'edit' && !editingCourseId && <p className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Choose the pencil icon beside a course in Course Catalogue to edit its details.</p>}{coursesSubTab !== 'edit' && <div className="overflow-x-auto border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Course</th><th className="p-3">Category</th><th className="p-3">Duration</th><th className="p-3">Fee</th><th className="p-3">Actions</th></tr></thead><tbody>{courses.map((course) => <tr key={course.id} className="border-b last:border-0"><td className="p-3 font-semibold text-slate-900">{course.title}<p className="mt-1 max-w-md text-xs font-normal text-slate-500">{course.description}</p></td><td className="p-3">{course.category}</td><td className="p-3">{course.duration}</td><td className="p-3">KSh {course.price.toLocaleString()}</td><td className="p-3"><div className="flex items-center gap-3"><button aria-label={`Edit ${course.title}`} className="text-blue-700 hover:text-blue-900" onClick={() => editCourse(course)}><Pencil className="h-4 w-4" /></button><button aria-label={`Archive ${course.title}`} className="text-slate-500 hover:text-red-700" onClick={() => void removeCourse(course.id)}><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}</div>}

          {active === 'courses' && selectedSubtab === 'Fee Structures' && <AdminWorkspaceHub section="fees" subtab="Fee Structures" courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {active === 'school' && <StudentSubtabWorkspace
            students={portalUsers}
            applications={applications}
            courses={courses}
            selectedSubtab={selectedSubtab || 'Active Students'}
            onEditStudent={(student) => { setEditingPortalUser(student); setEditingGeo({ county: student.county || '', subCounty: student.subCounty || '', ward: student.ward || '', location: student.location || '', subLocation: student.subLocation || '' }); }}
            onAddStudent={() => { setActive('student-directory'); setSelectedSubtab('Add New Student'); }}
          />}

                    {active === 'courses' && selectedSubtab === 'Fee Structures' && <section className="space-y-5 rounded-2xl border bg-white p-5 text-slate-900 shadow-sm"><div><p className="text-xs font-black uppercase tracking-widest text-cyan-800">NAVSTAR · COURSE FINANCE</p><h2 className="mt-1 text-xl font-black">Custom course fee structures</h2><p className="mt-2 text-sm text-slate-600">Set Admission fee, tuition, materials, examination and other charges independently for every course. The required Admission fee is the minimum first payment for enrolment.</p></div><div className="flex flex-wrap items-end gap-3"><div className="min-w-[240px] flex-1 space-y-2"><Label>Course</Label><select value={feeCourseId} onChange={e=>{setFeeCourseId(e.target.value);setFeeItems([]);if(e.target.value)void loadFeeStructure(e.target.value);}} className="h-11 w-full rounded-xl border bg-white px-3"><option value="">Select course</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title}</option>)}</select></div></div><div className="space-y-3">{feeItems.some(item=>item.itemName.toLowerCase()==="admission fee"&&item.amount>=100&&item.required&&item.dueStage==="enrollment")?null:<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Set a required Admission fee of at least KSh 100, due at enrolment. It is included in the published course fee total.</p>}{feeStudentsMissing>0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Attention: {feeStudentsMissing} existing student application(s) are linked to a course without a configured Admission fee. Set the Admission fee and review those student accounts.</p>}{feeStudentsWithoutAdmissionFee>0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Legacy records warning: {feeStudentsWithoutAdmissionFee} existing student(s) in this course do not have an Admission fee of at least KSh 100 saved in their individual fee record. Review their accounts before changing their balances.</p>}{feeItems.map((item,index)=><div key={item.id} className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-[1.3fr_1fr_1fr_auto_auto] sm:items-end"><div className="space-y-1"><Label>Fee item</Label><Input value={item.itemName} onChange={e=>setFeeItems(current=>current.map((row,i)=>i===index?{...row,itemName:e.target.value}:row))}/></div><div className="space-y-1"><Label>Amount (KSh)</Label><Input type="number" min={item.itemName.toLowerCase()==="admission fee"?100:0} step="1" value={item.amount} onChange={e=>setFeeItems(current=>current.map((row,i)=>i===index?{...row,amount:Number(e.target.value)}:row))}/></div><div className="space-y-1"><Label>When due</Label><select value={item.dueStage} onChange={e=>setFeeItems(current=>current.map((row,i)=>i===index?{...row,dueStage:e.target.value}:row))} className="h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="enrollment">At enrolment</option><option value="before_term">Before term</option><option value="anytime">Any time</option></select></div><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={item.required} onChange={e=>setFeeItems(current=>current.map((row,i)=>i===index?{...row,required:e.target.checked}:row))}/>Required</label><Button type="button" size="sm" variant="outline" onClick={()=>setFeeItems(current=>current.filter((_,i)=>i!==index))}>Remove</Button></div>)}{!feeItems.length&&<p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Select a course to load its default fee items.</p>}</div><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cyan-50 p-4"><div><p className="text-xs font-semibold text-cyan-900">Configured course fee total</p><p className="text-2xl font-black text-cyan-950">KSh {feeItems.filter(item=>item.active).reduce((sum,item)=>sum+Number(item.amount||0),0).toLocaleString('en-KE')}</p></div><p className="text-xs text-cyan-900">Automatically updates as fee amounts change. Must equal the course catalogue fee.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!feeItems.length||!feeCourseId} onClick={()=>{const courseTitle=courses.find(course=>course.id===feeCourseId)?.title||'Course';try{exportBrandedData('pdf',courseTitle+' · Official Fee Structure',['Fee item','Amount (KSh)','Due stage','Required'],feeItems.filter(item=>item.active).map(item=>({'Fee item':item.itemName,'Amount (KSh)':item.amount,'Due stage':item.dueStage,Required:item.required?'Yes':'No'})));}catch(error){setNotice(error instanceof Error?error.message:'Fee structure PDF could not be generated.');}}}>Generate Fee Structure PDF</Button><Button type="button" variant="outline" onClick={()=>setFeeItems(current=>[...current,{id:crypto.randomUUID(),itemName:'New fee item',amount:0,dueStage:'anytime',required:false,sortOrder:current.length+1,active:true}])}>+ Add fee item</Button><Button type="button" disabled={!feeItems.length||feeSaving} onClick={()=>void saveFeeStructure()} className="bg-cyan-900 text-white">{feeSaving?'Saving…':'Save fee structure'}</Button></div><p className="text-xs text-slate-500">Existing fee and payment history is preserved. Changes affect the selected course fee schedule going forward.</p></section>}
          {active === 'marks-tests' && <MarksHubWorkspace subtab={selectedSubtab || 'Marks Hub'} courses={courses}/ >}
          {active === 'learning' && selectedSubtab === 'Tests & Exams' && <MarksHubWorkspace subtab="Exam Management (AI)" courses={courses}/ >}
          {active === 'learning' && selectedSubtab !== 'Tests & Exams' && <LearningAdminSubtab subtab={selectedSubtab || 'View Modules'} courses={courses}/ >}

          {active === 'student-status' && <StudentStatusWorkspace students={portalUsers} courses={courses} applications={applications} subtab={selectedSubtab || 'Active Students'}/ >}

          {active === 'staff-applications' && <StaffApplicationsWorkspace subtab={selectedSubtab || 'All Applications'}/ >}
          {active === 'staff-applications' && selectedSubtab === 'Legacy Staff Applications' && <section className="space-y-4 rounded-2xl border border-cyan-400/20 bg-[#101d31] p-5 text-white">
            <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-300">Human resources · Staff recruitment</p><h3 className="mt-1 text-xl font-extrabold">{selectedSubtab || 'All Applications'}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">This is the staff recruitment register. It is kept separate from student course-enrollment applications.</p></div>
            <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Staff applications received</p><p className="mt-1 text-2xl font-black">0</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Pending review</p><p className="mt-1 text-2xl font-black">0</p></div><div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-slate-400">Recruitment decisions</p><p className="mt-1 text-2xl font-black">0</p></div></div>
            <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100"><strong>Staff application records are not connected yet.</strong> The current backend has student enrollment applications, but no separate staff-application submission/register API. No student applications are shown here as staff applications, and no sample staff records have been invented.</div>
          </section>}
          {(active === 'enrollments' || active === 'applications' || active === 'enrollment-summary') && <div className="space-y-5">
            {active === 'enrollment-summary' && (!selectedSubtab || selectedSubtab === 'Intake Summary') && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total applications',applications.length],
                ['Submitted',applications.filter(item=>String(item.status||'').toLowerCase()==='submitted').length],
                ['Under review',applications.filter(item=>String(item.status||'').toLowerCase()==='under_review').length],
                ['Accepted',applications.filter(item=>String(item.status||'').toLowerCase()==='accepted').length],
              ].map(([label,value])=><div key={String(label)} className="rounded-xl border border-cyan-400/20 bg-[#111d30] p-4 text-white"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-black">{Number(value).toLocaleString()}</p></div>)}
            </section>}
            {active === 'enrollment-summary' && selectedSubtab === 'Enrollment by Course' && <section className="rounded-xl border border-white/10 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Enrollment by course</h3><div className="mt-3 divide-y divide-white/10">{courses.map(course=>{const count=applications.filter(item=>String(item.course_id||'')===course.id).length;return <div key={course.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{course.title}</span><strong className="text-cyan-200">{count}</strong></div>})}{courses.length===0&&<p className="text-sm text-slate-400">No courses are configured.</p>}</div></section>}
            {active === 'enrollment-summary' && selectedSubtab === 'Enrollment by Year' && <section className="rounded-xl border border-white/10 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Enrollment by intake / year</h3><p className="mt-1 text-xs text-slate-400">Grouped from the preferred intake stored on each application.</p><div className="mt-3 divide-y divide-white/10">{Object.entries(applications.reduce<Record<string,number>>((groups,item)=>{const key=String(item.preferred_intake||'Intake not recorded');groups[key]=(groups[key]||0)+1;return groups;},{})).sort(([a],[b])=>a.localeCompare(b)).map(([intake,count])=><div key={intake} className="flex justify-between gap-3 py-3 text-sm"><span>{intake}</span><strong className="text-cyan-200">{count}</strong></div>)}{applications.length===0&&<p className="text-sm text-slate-400">No application records available.</p>}</div></section>}
           {active === 'enrollment-summary' && selectedSubtab === 'Enrollment Status' && <section className="rounded-xl border border-white/10 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Enrollment status breakdown</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{['submitted','under_review','accepted','rejected'].map(status=><div key={status} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase text-slate-400">{status.replace('_',' ')}</p><p className="mt-1 text-2xl font-black">{applications.filter(item=>String(item.status||'').toLowerCase()===status).length}</p></div>)}</div></section>}
           {active === 'applications' && selectedSubtab === 'Application Status' && <section className="rounded-xl border border-white/10 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Application status summary</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{['submitted','under_review','accepted','rejected'].map(status=><div key={status} className="rounded-lg border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase text-slate-400">{status.replace('_',' ')}</p><p className="mt-1 text-2xl font-black">{applications.filter(item=>String(item.status||'').toLowerCase()===status).length}</p></div>)}</div></section>}
           {active === 'applications' && <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-[#111d30] p-3 text-xs text-slate-300"><span className="font-bold text-cyan-200">Viewing:</span><span>{selectedSubtab || 'All Applications'}</span><span className="ml-auto">{applications.filter(item=>selectedSubtab==='New Applications'?String(item.status||'').toLowerCase()==='submitted':selectedSubtab==='Review Applications'?String(item.status||'').toLowerCase()==='under_review':true).length} records</span></div>}
            <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Applicant</th><th className="p-3">Course</th><th className="p-3">Application</th><th className="p-3">Admission number</th><th className="p-3">Payment</th><th className="p-3">Received (EAT)</th><th className="p-3">Review</th></tr></thead><tbody>{applications.filter(item=>active!=='applications'||(selectedSubtab==='New Applications'?String(item.status||'').toLowerCase()==='submitted':selectedSubtab==='Review Applications'?String(item.status||'').toLowerCase()==='under_review':true)).map(application=><tr key={String(application.id)} className="border-b last:border-0"><td className="p-3"><div className="flex items-center gap-3">{application.profile_photo_url&&<img src={String(application.profile_photo_url)} alt="" className="h-10 w-10 rounded-full border object-cover"/>}<div><p className="font-semibold">{String(application.full_name??'')}</p><p className="text-xs text-slate-500">{String(application.email??'')}</p></div></div></td><td className="p-3">{courses.find(item=>item.id===application.course_id)?.title??String(application.course_id??'')}</td><td className="p-3">{String(application.status??'')}</td><td className="p-3">{application.admission_number?<span className="font-mono text-xs font-bold text-emerald-800">{String(application.admission_number)}</span>:String(application.status)==="accepted"&&(user?.role==="admin"||user?.role==="admissions")?<Button type="button" size="sm" variant="outline" onClick={()=>void generateAdmissionNumber(String(application.id))}>Generate number</Button>:<span className="text-xs text-slate-400">Pending acceptance</span>}</td><td className="p-3">{String(application.payment_status??'')}</td><td className="p-3">{formatEATDateTime(application.created_at as string|null|undefined)}</td><td className="p-3">{(user?.role==='admin'||user?.role==='admissions')?<select aria-label={`Review application for ${String(application.full_name??'learner')}`} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-900" value={String(application.status??'submitted')} onChange={event=>void updateApplicationStatus(String(application.id),event.target.value)}><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="accepted">Accepted — enable LMS</option><option value="rejected">Rejected</option></select>:'Read only'}</td></tr>)}{applications.length===0&&<tr><td className="p-6 text-center text-slate-500" colSpan={7}>{backendReady?'No applications received yet.':'Connect the backend and sign in to view applications.'}</td></tr>}</tbody></table></div>
          </div>}
          {(active === 'users' || active === 'employees') && <div className="space-y-5">{((active === 'users' && selectedSubtab === 'Create User') || (active === 'employees' && selectedSubtab === 'Add Employee')) && <form onSubmit={createPortalUser} className="space-y-5 border bg-white p-4 sm:p-6">
            <div><h3 className="font-bold text-slate-900">{active === 'employees' ? 'Create a staff account' : 'Create a system user'}</h3><p className="mt-1 text-sm text-slate-600">{active === 'employees' ? 'Register tutors, admissions, finance, principal and administrative staff. Student accounts are managed separately in Students.' : 'Create and manage system accounts with role-appropriate access.'} A unique Navstar ID is generated automatically.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="portal-user-name">Full legal name *</Label><Input id="portal-user-name" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-email">Email address *</Label><Input id="portal-user-email" type="email" value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} required /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-role">Portal role *</Label><select id="portal-user-role" value={active === 'employees' && newUserRole === 'student' ? 'tutor' : newUserRole} onChange={(event) => setNewUserRole(event.target.value)} className="h-10 w-full border border-slate-300 bg-white px-3 text-sm">{(active === 'employees' ? ['admin','principal','finance','admissions','tutor'] : ['admin','principal','finance','admissions','tutor','student']).map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></div>
              <div className="space-y-2"><Label htmlFor="portal-user-phone">Phone number</Label><Input id="portal-user-phone" value={newUserPhone} onChange={(event) => setNewUserPhone(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="portal-user-national-id">National ID / identity reference</Label><Input id="portal-user-national-id" value={newUserNationalId} onChange={(event) => setNewUserNationalId(event.target.value)} /></div>
              <ProfileDropdown id="portal-user-citizenship" label="Citizenship" value={newUserCitizenship} options={CITIZENSHIP_OPTIONS} onChange={setNewUserCitizenship}/><ProfileDropdown id="portal-user-gender" label="Gender" value={newUserGender} options={GENDER_OPTIONS} onChange={setNewUserGender}/><div className="space-y-2"><Label htmlFor="portal-user-dob">Date of birth</Label><Input id="portal-user-dob" type="date" value={newUserDateOfBirth} onChange={event=>setNewUserDateOfBirth(event.target.value)}/></div>
               <div className="sm:col-span-2 xl:col-span-3"><GeographyPicker county={newUserCounty} subCounty={newUserSubCounty} ward={newUserWard} location={newUserLocation} subLocation={newUserSubLocation} locations={locationOptions} subLocations={subLocationOptions} onChange={(value) => { setNewUserCounty(value.county); setNewUserSubCounty(value.subCounty); setNewUserWard(value.ward); setNewUserLocation(value.location); setNewUserSubLocation(value.subLocation); }} /></div>
              <ProfileDropdown id="portal-user-department" label="Department" value={newUserDepartment} options={DEPARTMENT_OPTIONS} onChange={setNewUserDepartment}/><ProfileDropdown id="portal-user-title" label="Job title" value={newUserJobTitle} options={JOB_TITLE_OPTIONS} onChange={setNewUserJobTitle}/><ProfileDropdown id="portal-user-employment" label="Employment type" value={newUserEmploymentType} options={EMPLOYMENT_TYPE_OPTIONS} onChange={setNewUserEmploymentType}/><div className="space-y-2 sm:col-span-2 xl:col-span-3"><Label htmlFor="portal-user-address">Full physical / postal address</Label><Input id="portal-user-address" value={newUserAddress} onChange={event=>setNewUserAddress(event.target.value)} placeholder="Building, street, estate or village, town"/></div>
              
              <div className="space-y-2"><Label htmlFor="portal-user-password">Password *</Label><Input id="portal-user-password" type="password" minLength={6} maxLength={12} value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} autoComplete="new-password" required /><p className="text-xs leading-5 text-slate-600">6–12 characters. Meet at least 3: capital letter, small letter, number, special character (! @ #).</p><p className={isPasswordStrong(newUserPassword)?'text-xs font-semibold text-emerald-700':'text-xs text-slate-500'}>{newUserPassword ? (isPasswordStrong(newUserPassword)?'Strong password ✓':'Password does not meet the strength rule yet.') : 'Password strength will be checked as you type.'}</p></div>
              <div className="space-y-2"><Label htmlFor="portal-user-confirm">Confirm password *</Label><Input id="portal-user-confirm" type="password" minLength={6} maxLength={12} value={newUserConfirmPassword} onChange={(event) => setNewUserConfirmPassword(event.target.value)} autoComplete="new-password" required />{newUserConfirmPassword && <p className={newUserPassword === newUserConfirmPassword ? 'text-xs text-emerald-700' : 'text-xs text-red-600'}>{newUserPassword === newUserConfirmPassword ? 'Passwords match ✓' : 'Passwords do not match.'}</p>}</div>
            </div>
            <Button type="submit" disabled={!backendReady || user?.role !== 'admin' || !isPasswordStrong(newUserPassword) || newUserPassword !== newUserConfirmPassword} className="bg-emerald-800 hover:bg-emerald-900"><Plus className="mr-2 h-4 w-4" />Create account and generate ID</Button>
          </form>}
          {((active === 'users' && (!selectedSubtab || selectedSubtab === 'User Directory')) || (active === 'employees' && ['Employee Directory',''].includes(selectedSubtab))) && <div className="divide-y border bg-white">{portalUsers.filter((portalUser) => active === 'employees' ? portalUser.role !== 'student' : true).map((portalUser) => <div key={portalUser.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{portalUser.name}</p><p className="mt-1 text-xs text-slate-500">{portalUser.staffId || 'ID pending'} · {portalUser.email} · {portalUser.role}</p><p className="mt-1 text-xs text-slate-500">{portalUser.nationalId ? 'National ID recorded' : 'National ID not yet provided'}</p></div><div className="flex items-center gap-3"><span className="border px-2 py-1 text-xs">{portalUser.status}</span><Button type="button" size="sm" variant="outline" onClick={() => { setEditingPortalUser(portalUser); setEditingGeo({ county: portalUser.county || '', subCounty: portalUser.subCounty || '', ward: portalUser.ward || '', location: portalUser.location || '', subLocation: portalUser.subLocation || '' }); }}><Pencil className="mr-1 h-3 w-3"/>Edit profile</Button></div></div>)}{portalUsers.filter((portalUser) => active === 'employees' ? portalUser.role !== 'student' : true).length === 0 && <p className="p-5 text-sm text-slate-500">{backendReady ? (active === 'employees' ? 'No staff accounts found.' : 'No accounts found.') : 'Connect Cloudflare Pages Functions and sign in as Admin to manage accounts.'}</p>}</div>}
          {active === 'users' && ['Manage Logins','Staff IDs & Roles'].includes(selectedSubtab) && <AdminWorkspaceHub section="users" subtab={selectedSubtab} courses={courses} users={portalUsers} applications={applications} services={services}/>}
           {active === 'employees' && selectedSubtab === 'Edit Employee Details' && <section className="space-y-3 rounded-xl border bg-white p-5"><div><h3 className="font-bold text-slate-950">Edit employee details</h3><p className="mt-1 text-sm text-slate-600">Select a staff member to open their existing profile record. Student accounts are excluded.</p></div><div className="divide-y rounded-lg border">{portalUsers.filter(person=>person.role!=='student').map(person=><div key={person.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><p className="font-semibold text-slate-900">{person.name}</p><p className="text-xs text-slate-500">{person.staffId||'ID pending'} · {person.role} · {person.email}</p></div><Button type="button" size="sm" variant="outline" onClick={()=>{setEditingPortalUser(person);setEditingGeo({county:person.county||'',subCounty:person.subCounty||'',ward:person.ward||'',location:person.location||'',subLocation:person.subLocation||''});}}>Edit this employee</Button></div>)}{portalUsers.filter(person=>person.role!=='student').length===0&&<p className="p-4 text-sm text-slate-500">No staff accounts are available to edit.</p>}</div></section>}
           {active === 'employees' && selectedSubtab === 'Staff Roles & Departments' && <section className="rounded-xl border bg-white p-5"><h3 className="font-bold text-slate-950">Staff roles and departments</h3><p className="mt-1 text-sm text-slate-600">Live breakdown from registered non-student staff accounts.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{['admin','principal','finance','admissions','tutor'].map(role=><div key={role} className="rounded-lg border bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{role}</p><p className="mt-1 text-2xl font-black text-slate-900">{portalUsers.filter(person=>person.role===role).length}</p></div>)}</div><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Department</th><th className="p-3">Staff count</th></tr></thead><tbody>{Array.from(new Set(portalUsers.filter(person=>person.role!=='student').map(person=>person.department||'Unassigned'))).sort().map(department=><tr key={department} className="border-t"><td className="p-3">{department}</td><td className="p-3 font-bold">{portalUsers.filter(person=>(person.department||'Unassigned')===department&&person.role!=='student').length}</td></tr>)}</tbody></table></div></section>}
          {active === 'employees' && selectedSubtab === 'Staff Attendance' && <section className="rounded-xl border border-amber-300/20 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Staff attendance register</h3><p className="mt-2 text-sm leading-6 text-slate-300">This workspace is reserved for staff attendance. A staff-attendance API and persisted attendance records are not connected yet, so the system will not display invented attendance or allow a false attendance submission.</p><span className="mt-3 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">Backend connection required</span></section>}
          {active === 'employees' && selectedSubtab === 'Employee Documents' && <section className="rounded-xl border border-amber-300/20 bg-[#111d30] p-5 text-white"><h3 className="font-bold">Employee documents</h3><p className="mt-2 text-sm leading-6 text-slate-300">Employee-specific document storage is not yet connected. This area is kept separate from general website downloads; no documents are copied or fabricated.</p><span className="mt-3 inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">Document register not connected</span></section>}
          {editingPortalUser && <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4"><form onSubmit={savePortalUserEdit} className="my-6 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black text-slate-950">Edit account profile</h3><p className="mt-1 text-sm text-slate-600">{editingPortalUser.staffId} · {editingPortalUser.email}</p></div><button type="button" onClick={() => setEditingPortalUser(null)} className="rounded-lg border px-3 py-1 text-sm">Close</button></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Full name</Label><Input name="name" defaultValue={editingPortalUser.name} required/></div><div className="space-y-1"><Label>Portal role</Label><select name="role" defaultValue={editingPortalUser.role} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{['admin','principal','finance','admissions','tutor','student'].map(role=><option key={role} value={role}>{role}</option>)}</select></div><div className="space-y-1"><Label>National ID</Label><Input name="nationalId" defaultValue={editingPortalUser.nationalId || ''}/></div><div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={editingPortalUser.phone || ''}/></div><div className="space-y-1"><Label>Gender</Label><select name="gender" defaultValue={editingPortalUser.gender || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select gender</option>{GENDER_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Citizenship</Label><select name="citizenship" defaultValue={editingPortalUser.citizenship || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select citizenship</option>{CITIZENSHIP_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Date of birth</Label><Input name="dateOfBirth" type="date" defaultValue={editingPortalUser.dateOfBirth || ''}/></div><div className="sm:col-span-2"><GeographyPicker county={editingGeo.county} subCounty={editingGeo.subCounty} ward={editingGeo.ward} location={editingGeo.location} subLocation={editingGeo.subLocation} locations={locationOptions} subLocations={subLocationOptions} onChange={setEditingGeo}/></div><div className="space-y-1"><Label>Department</Label><select name="department" defaultValue={editingPortalUser.department || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select department</option>{DEPARTMENT_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Job title</Label><select name="jobTitle" defaultValue={editingPortalUser.jobTitle || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select job title</option>{JOB_TITLE_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Employment type</Label><select name="employmentType" defaultValue={editingPortalUser.employmentType || ''} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Select employment type</option>{EMPLOYMENT_TYPE_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></div><div className="space-y-1"><Label>Date joined</Label><Input name="joinedOn" type="date" defaultValue={editingPortalUser.joinedOn || ''}/></div><div className="sm:col-span-2"><Label>Full physical / postal address</Label><Input name="address" defaultValue={editingPortalUser.address || ''} placeholder="Building, street, estate or village, town"/></div></div><p className="text-xs text-slate-500">The system-generated Navstar ID is assigned by the system. The primary Admin can set their own ID under Settings → My Profile.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingPortalUser(null)}>Cancel</Button><Button type="submit"><Save className="mr-2 h-4 w-4"/>Save changes</Button></div></form></div>}
          </div>}
          {active === 'student-directory' && <div className="mx-auto max-w-5xl space-y-5">
            <section className="rounded-2xl border border-cyan-200/20 bg-gradient-to-r from-[#0b2854] to-[#123e78] p-5 text-white"><p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200">NAVSTAR DIGITAL HUB · ADMISSIONS</p><h3 className="mt-1 text-xl font-black">New Student Registration</h3><p className="mt-1 text-sm text-blue-100">The same information collected on the public course-enrollment form. Select a course from the official catalogue; course names cannot be typed manually.</p></section>
            <form onSubmit={createStudentRegistration} className="space-y-5">
              <section className="rounded-xl border bg-white p-5 text-slate-900 shadow-sm"><div className="mb-4"><h4 className="font-bold">1. Personal details</h4><p className="mt-1 text-xs text-slate-500">Enter the student's official contact and identity information.</p></div><div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2"><Label>Full legal name *</Label><Input name="fullName" autoComplete="name" required/></div>
                <div className="space-y-1"><Label>Email address *</Label><Input name="email" type="email" autoComplete="email" required/></div>
                <div className="space-y-1"><Label>M-Pesa phone number *</Label><Input name="phone" inputMode="tel" placeholder="07xx xxx xxx" required/></div>
                <div className="space-y-1"><Label>Date of birth *</Label><Input name="dateOfBirth" type="date" required/></div>
                <div className="space-y-1"><Label>National ID or passport</Label><Input name="identityNumber" autoComplete="off"/></div>
                <div className="space-y-1"><Label>Gender</Label><select name="gender" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Another identity</option></select></div>
                <div className="space-y-1"><Label>Nationality</Label><Input name="nationality" defaultValue="Kenyan"/></div>
              </div></section>
              <section className="rounded-xl border bg-white p-5 text-slate-900 shadow-sm"><div className="mb-4"><h4 className="font-bold">2. Course and education</h4><p className="mt-1 text-xs text-slate-500">Choose an existing Navstar course. The course title and fee are taken from the catalogue.</p></div><div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2"><Label>Course to enrol in *</Label><select name="courseId" required defaultValue="" className="h-11 w-full rounded-md border border-blue-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"><option value="" disabled>Select a course from Navstar catalogue</option>{courses.map(course=><option key={course.id} value={course.id}>{course.title} · KSh {Number(course.price).toLocaleString()}</option>)}</select></div>
                <div className="space-y-1"><Label>Study mode *</Label><select name="studyMode" required className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Select mode</option><option>On campus</option><option>Online</option><option>Hybrid</option></select></div>
                <div className="space-y-1"><Label>Highest education level *</Label><select name="educationLevel" required className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="">Select level</option><option>Primary</option><option>Secondary</option><option>Certificate</option><option>Diploma</option><option>Degree or higher</option></select></div>
                <div className="space-y-1"><Label>Preferred intake</Label><Input name="preferredIntake" type="month"/></div>
                <div className="space-y-1 sm:col-span-2"><Label>Relevant experience or learning goals</Label><textarea name="experience" rows={3} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Share anything that will help us support the student's learning."/></div>
              </div></section>
              <section className="rounded-xl border bg-white p-5 text-slate-900 shadow-sm"><div className="mb-4"><h4 className="font-bold">3. Address and emergency contact</h4></div><div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>County *</Label><Input name="county" required/></div><div className="space-y-1"><Label>Town or area *</Label><Input name="town" required/></div>
                <div className="space-y-1 sm:col-span-2"><Label>Postal or physical address</Label><Input name="address" autoComplete="street-address"/></div>
                <div className="space-y-1"><Label>Emergency contact name *</Label><Input name="emergencyContactName" required/></div><div className="space-y-1"><Label>Emergency contact phone *</Label><Input name="emergencyContactPhone" inputMode="tel" required/></div>
                <div className="space-y-1"><Label>Relationship</Label><Input name="emergencyContactRelationship"/></div><div className="space-y-1 sm:col-span-2"><Label>Accessibility or learning support needs</Label><textarea name="supportNeeds" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"/></div>
              </div></section>
              <section className="rounded-xl border bg-white p-5 text-slate-900 shadow-sm"><h4 className="font-bold">4. Student portal account</h4><p className="mt-1 text-xs text-slate-500">Set the student's initial sign-in password. The student can change it after signing in.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label>Initial password *</Label><Input name="password" type="password" minLength={6} maxLength={12} autoComplete="new-password" required/></div><div className="space-y-1"><Label>Confirm password *</Label><Input name="confirmPassword" type="password" minLength={6} maxLength={12} autoComplete="new-password" required/></div></div></section>
              <label className="flex items-start gap-3 rounded-xl border bg-white p-4 text-sm leading-6 text-slate-700"><input type="checkbox" name="consent" required className="mt-1 accent-emerald-800"/><span>The student confirms that the information is accurate and agrees that Navstar Admissions may contact them about this registration.</span></label>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-xs text-slate-500">The account and course application are saved to the existing Navstar student and admissions records. No separate student register is created.</p><Button type="submit" disabled={!backendReady||user?.role!=='admin'} className="bg-emerald-800 hover:bg-emerald-900"><Plus className="mr-2 h-4 w-4"/>Register student and enrol in course</Button></div>
            </form>
          </div>}
          {active === 'portal-links' && <section className="rounded-2xl border border-white/10 bg-[#151d2b] p-6 sm:p-8"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-cyan-300">NAVSTAR DIGITAL HUB · PORTAL ACCESS</p><h3 className="mt-2 text-2xl font-black text-white">Portal login gates</h3><p className="mt-2 text-sm text-slate-400">Open the selected portal's sign-in gate. Each link leads directly to its login card.</p><div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[['Student Gateway','student'],['Tutor Portal','tutor'],['Finance Portal','finance'],['Principal Portal','principal'],['Admissions Portal','admissions'],['Admin Portal','admin']].map(([label,role])=><Link key={role} to={`/login?role=${role}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[.04] px-4 py-4 text-sm font-bold text-white transition hover:border-cyan-300/40 hover:bg-cyan-500/10">{label}<ArrowUpRight className="h-4 w-4 text-cyan-300"/></Link>)}</div></section>}

          {active === 'receipts' && (!selectedSubtab || selectedSubtab === 'Payment Receipts') && <section className="rounded-2xl border bg-white p-6"><div className="flex items-center gap-3"><ReceiptText className="h-6 w-6 text-blue-800"/><div><h3 className="font-bold text-slate-950">Confirmed payment receipts</h3><p className="mt-1 text-sm text-slate-600">View confirmed payments and print or save official Navstar receipts as PDF.</p></div></div><Link to="/admin/receipts" className="mt-5 inline-flex items-center rounded-xl bg-blue-800 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900">Open payment receipt register</Link></section>}

          {(['finance','fees'].includes(active) && selectedSubtab && !['Accounts Overview','Collect Fees'].includes(selectedSubtab)) && <AdminWorkspaceHub section={active} subtab={selectedSubtab} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {((active === 'finance' && (!selectedSubtab || selectedSubtab === 'Accounts Overview')) || (active === 'fees' && (!selectedSubtab || selectedSubtab === 'Collect Fees'))) && <div className="space-y-6"><AdminFinancePanel role={user?.role || ''} ledger={active === 'fees' ? 'fees' : 'business'} /><form onSubmit={startCashout} className="space-y-4 border bg-white p-5"><div><h3 className="font-bold text-slate-950">Request cashout</h3><p className="mt-2 text-sm leading-6 text-slate-600">This creates an approval request only; it does not transfer funds. Never withdraw from the browser.</p></div><div className="space-y-2"><Label htmlFor="cashout-amount">Amount (KSh)</Label><Input id="cashout-amount" type="number" min="1" value={cashoutAmount} onChange={(event) => setCashoutAmount(event.target.value)} required /></div><Button className="bg-emerald-800 hover:bg-emerald-900" type="submit" disabled={!backendReady || !user}><CircleDollarSign className="mr-2 h-4 w-4" />{backendReady ? 'Submit for approval' : 'Backend required'}</Button><div className="divide-y border">{cashoutRequests.map((item) => <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><span>KSh {Number(item.amount).toLocaleString()} · {String(item.status)}</span>{item.status === 'pending_approval' && user?.role === 'admin' && <span className="flex gap-2"><Button size="sm" type="button" variant="outline" onClick={() => reviewCashout(String(item.id), 'approved')}>Approve</Button><Button size="sm" type="button" variant="outline" onClick={() => reviewCashout(String(item.id), 'rejected')}>Reject</Button></span>}</div>)}{cashoutRequests.length === 0 && <p className="p-3 text-xs text-slate-500">No cashout requests.</p>}</div></form></div>}

          {active === 'pos' && selectedSubtab && selectedSubtab !== 'New Sale' && <AdminWorkspaceHub section="pos" subtab={selectedSubtab} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {active === 'pos' && (!selectedSubtab || selectedSubtab === 'New Sale') && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
            <section className="rounded-2xl border border-white/10 bg-[#151d2b] p-5">
              <div className="mb-4"><h3 className="text-lg font-extrabold text-white">Point of Sale</h3><p className="mt-1 text-sm text-slate-400">Select one or more priced services. The total is calculated automatically before sending the customer an M-Pesa prompt.</p></div>
              <form onSubmit={startPosSale} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="pos-customer" className="text-slate-200">Customer name</Label><Input id="pos-customer" value={posCustomerName} onChange={event=>setPosCustomerName(event.target.value)} placeholder="Customer full name" required/></div><div className="space-y-2"><Label htmlFor="pos-phone" className="text-slate-200">M-Pesa phone number</Label><Input id="pos-phone" value={posPhone} onChange={event=>setPosPhone(event.target.value)} placeholder="07XXXXXXXX" required/></div></div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="pos-service" className="text-slate-200">Choose service</Label><select id="pos-service" value={posSelectedService} onChange={event=>setPosSelectedService(event.target.value)} className="h-10 w-full rounded-md border border-slate-600 bg-[#0b1220] px-3 text-sm text-white"><option value="">Select service…</option>{services.filter(item=>item.status==='Active'&&Number(item.priceAmount)>0).map(item=><option key={item.id} value={item.id}>{item.name} — KSh {Number(item.priceAmount).toLocaleString()}</option>)}</select></div><div className="space-y-2"><Label htmlFor="pos-quantity" className="text-slate-200">Quantity</Label><Input id="pos-quantity" type="number" min="1" max="1000" value={posQuantity} onChange={event=>setPosQuantity(event.target.value)}/></div><Button type="button" onClick={addPosItem} className="bg-cyan-700 hover:bg-cyan-800">Add service</Button></div>
                <div className="overflow-hidden rounded-xl border border-white/10"><div className="grid grid-cols-[1fr_80px_100px_40px] gap-2 bg-[#0d1524] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400"><span>Service</span><span>Qty</span><span className="text-right">Total</span><span/></div>{posCart.map(item=>{const service=services.find(entry=>entry.id===item.serviceId);const lineTotal=Number(service?.priceAmount||0)*item.quantity;return <div key={item.serviceId} className="grid grid-cols-[1fr_80px_100px_40px] items-center gap-2 border-t border-white/5 px-3 py-3 text-xs"><span className="font-semibold text-white">{service?.name||'Service'}</span><span className="text-slate-300">{item.quantity}</span><span className="text-right font-bold text-cyan-200">{lineTotal.toLocaleString()}</span><button type="button" onClick={()=>setPosCart(current=>current.filter(entry=>entry.serviceId!==item.serviceId))} className="text-rose-300" aria-label="Remove service"><Trash2 className="h-4 w-4"/></button></div>})}{!posCart.length&&<p className="p-5 text-center text-xs text-slate-500">Your sale is empty. Add a service to begin.</p>}</div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-950/70 p-4"><div><p className="text-xs text-blue-200">Total payable</p><p className="text-2xl font-black text-white">KSh {posCart.reduce((sum,item)=>sum+Number(services.find(entry=>entry.id===item.serviceId)?.priceAmount||0)*item.quantity,0).toLocaleString()}</p></div><Button type="submit" disabled={posProcessing||!backendReady||!posCart.length} className="bg-emerald-600 hover:bg-emerald-700">{posProcessing?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>Processing…</>: 'Send M-Pesa prompt'}</Button></div>
              </form>
            </section>
            <section className="rounded-2xl border border-white/10 bg-[#151d2b] p-5"><h3 className="font-bold text-white">Payment verification</h3><p className="mt-1 text-sm text-slate-400">A receipt is available only after Safaricom confirms payment through the callback.</p>{posPayment?<div className="mt-5 rounded-xl border border-white/10 bg-[#0b1220] p-4"><p className="text-xs text-slate-400">Sale reference</p><p className="mt-1 font-bold text-white">{posPayment.reference}</p><p className="mt-4 text-xs text-slate-400">Payment status</p><p className={`mt-1 text-lg font-extrabold uppercase ${posPayment.status==='paid'?'text-emerald-300':posPayment.status==='failed'?'text-rose-300':'text-amber-300'}`}>{posPayment.status}</p>{posPayment.status==='paid'&&<Link to={`/payment-receipt/${posPayment.id}`} className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"><ReceiptText className="mr-2 h-4 w-4"/>Open verified receipt</Link>}</div>:<div className="mt-5 rounded-xl border border-dashed border-slate-600 p-6 text-center text-sm text-slate-500">No payment has been started yet.</div>}<p className="mt-4 text-xs leading-5 text-slate-500">Never issue a paid receipt manually. The system waits for the M-Pesa callback and verifies the amount and phone number first.</p></section>
          </div>}

          {active === 'orders' && (!selectedSubtab || selectedSubtab === 'Service Orders') && <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h3 className="font-bold text-slate-950">Customer service orders</h3><p className="mt-1 text-sm text-slate-600">Requests submitted from the public Customer Service Desk.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{customerOrders.length} orders</span></div>
            <div className="divide-y">{customerOrders.map((order) => <article key={order.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-950">{order.serviceName}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">{order.status}</span></div><p className="mt-1 text-sm text-slate-600">{order.customerName} · {order.phone}{order.email ? ' · ' + order.email : ''}</p><p className="mt-1 text-xs text-slate-500">Reference: {order.reference} · KSh {Number(order.amount).toLocaleString()} · {formatEATDateTime(order.createdAt)}</p>{order.notes && <p className="mt-2 text-sm text-slate-600">{order.notes}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void updateOrderStatus(order.id, 'in_progress')} className="rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800">In progress</button><button type="button" onClick={() => void updateOrderStatus(order.id, 'ready')} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800">Ready</button><button type="button" onClick={() => void updateOrderStatus(order.id, 'delivered')} className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-800">Delivered</button><button type="button" onClick={() => void updateOrderStatus(order.id, 'completed')} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-800">Completed</button><button type="button" onClick={() => void updateOrderStatus(order.id, 'cancelled')} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Cancel</button></div></article>)}{customerOrders.length === 0 && <p className="p-6 text-sm text-slate-500">No customer orders have been submitted yet.</p>}</div>
          </section>}

          {active === 'downloads' && ['Published Documents','Manage Downloads'].includes(selectedSubtab) && <AdminWorkspaceHub section="downloads" subtab={selectedSubtab} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {(active === 'downloads' || active === 'documents') && (!selectedSubtab || selectedSubtab === 'Upload Documents') && <div className="space-y-5">
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
              <div className="divide-y">{documents.map((doc) => <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold text-slate-900">{doc.title}</p><p className="mt-1 text-xs text-slate-500">{doc.originalName} · {(doc.sizeBytes / 1024).toFixed(0)} KB</p>{doc.description && <p className="mt-1 text-sm text-slate-600">{doc.description}</p>}</div><div className="flex items-center gap-3"><a href={doc.url+'?view=1'} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-700">View file</a><a href={doc.url} className="text-sm font-semibold text-slate-600">Download</a><button type="button" onClick={() => void deleteDocument(doc.id)} className="text-sm font-semibold text-rose-700">Remove</button></div></div>)}{documents.length === 0 && <p className="p-5 text-sm text-slate-500">No documents published yet. Upload your forms and calendar here.</p>}</div>
            </section>
          </div>}

          {active === 'gallery' && <AdminWorkspaceHub section="gallery" subtab={selectedSubtab || 'Photo Gallery'} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {active === 'gallery' && selectedSubtab === 'Legacy Logo Preview' && <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"><section className="space-y-4 border bg-white p-5"><h3 className="font-bold text-slate-950">Logo and site identity</h3><p className="text-sm leading-6 text-slate-600">Choose a local logo preview. It will not be published until secure media storage is connected.</p><Label htmlFor="brand-name">Display name</Label><Input id="brand-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} /><Label htmlFor="logo-upload">Logo image</Label><Input id="logo-upload" type="file" accept="image/*" onChange={(event) => setImage(event, 'logo')} />{logoPreview && <img src={logoPreview} alt="Selected NAVSTAR logo preview" className="h-24 w-24 border object-contain p-2" />}<p className="text-xs text-slate-500">Recommended: transparent PNG or SVG, square format.</p></section><section className="space-y-4 border bg-white p-5"><div><h3 className="font-bold text-slate-950">Gallery</h3><p className="mt-1 text-sm text-slate-600">Preview up to eight images at a time. Storage is not configured.</p></div><Label htmlFor="gallery-upload">Add gallery images</Label><Input id="gallery-upload" type="file" accept="image/*" multiple onChange={(event) => setImage(event, 'gallery')} /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{galleryPreview.map((url, index) => <img key={url} src={url} alt={`Gallery preview ${index + 1}`} className="aspect-square w-full border object-cover" />)}</div></section></div>}

          {(active === 'settings' || active === 'profile') && <div className="space-y-5">
                        {settingsTab === 'complete' && <AdminSettingsCenter activeSectionLabel={selectedSubtab} />}

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
              <section className="flex flex-wrap items-center gap-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4" aria-label="Admin profile photo settings">
                <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-md">
                  {adminPhotoUrl ? <img src={adminPhotoUrl} alt="Current Admin profile picture" className="h-full w-full object-cover"/> : <UserRound className="h-12 w-12 text-slate-500"/>}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <h4 className="font-bold text-slate-950">Admin profile picture</h4>
                  <p className="text-sm text-slate-700">Upload a clear photo. The actual image preview appears here after it has been saved.</p>
                  <p className="text-xs text-slate-600">Accepted formats: JPG, JPEG, PNG, WebP and AVIF. Maximum file size: 3 MB.</p>
                  <input ref={adminPhotoInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif" disabled={adminPhotoUploading} onChange={event=>void uploadAdminProfilePhoto(event.target.files?.[0])} className="block w-full max-w-md rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-800 file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-800"/>
                  {adminPhotoUploading && <p role="status" className="text-sm font-semibold text-blue-800">Uploading and saving your profile picture…</p>}
                  <p className="text-xs text-slate-500">Unsupported formats or files larger than 3 MB will be rejected with an explanation. You can replace this picture at any time.</p>
                </div>
              </section>
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

          {active === 'navstar-analytics' && <AdminWorkspaceHub section="navstar-analytics" subtab={selectedSubtab || 'Overview'} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {active === 'navstar-analytics' && selectedSubtab === 'Legacy Overview' && <div className="space-y-6">
            <section className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-[#071b3a] via-[#102c55] to-[#071827] p-6 text-white shadow-xl">
              <p className="text-[10px] font-black uppercase tracking-[.28em] text-cyan-300">A separate Navstar product</p>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Navstar Analytics</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">A dedicated school-management and analytics platform being prepared for Kenyan schools. It is separate from Navstar Digital Hub's computer-school learners, cyber-service customers, sales and accounts.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Schools','School register'],['Learners','School enrolment'],['Teachers','Staff and deployment'],['Classes','Grades, streams and timetables'],['Assessments','Marks and learning progress'],['Attendance','Daily school attendance'],['Fees','School fee accounts'],['Insights','Performance and trends']].map(([label,detail])=><div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm font-bold">{label}</p><p className="mt-1 text-xs text-blue-200">{detail}</p><p className="mt-3 text-xs font-semibold text-cyan-300">Separate school data workspace</p></div>)}</div>
            </section>
            <section className="rounded-2xl border border-amber-300/20 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Data separation:</strong> This dashboard does not reuse Navstar Digital Hub's cyber customers, computer-course enrolments, POS sales or service receipts. School records will be created in the dedicated Navstar Analytics data model as its modules are implemented. No sample school figures are being presented as real data.</section>
          </div>}
          {active === 'analytics-reports' && <AdminWorkspaceHub section="analytics-reports" subtab={selectedSubtab || 'Analytics Dashboard'} courses={courses} users={portalUsers} applications={applications} services={services}/>}
          {active === 'analytics-reports' && selectedSubtab === 'Legacy Overview' && <section className="space-y-4 rounded-2xl border border-cyan-400/20 bg-[#101d31] p-6 text-white"><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">Navstar Digital Hub reporting</p><h2 className="text-2xl font-black">Analytics & Reports</h2><p className="max-w-3xl text-sm leading-6 text-slate-300">Operational reporting for Navstar Digital Hub's own computer-school activity and cyber-services business. This is kept separate from the future Navstar Analytics school-management product.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{['Computer-school enrolment','Course and module activity','Cyber-service orders','POS sales and verified payments'].map(item=><div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">{item}</div>)}</div></section>}
          {!['overview','navstar-analytics','analytics-reports','courses','learning','marks-tests','school','services','pos','finance','fees','staff-applications','applications','enrollment-summary','users','employees','student-directory','downloads','documents','gallery','settings','profile','orders','receipts','portal-links'].includes(active) && <AdminWorkspaceHub section={active} subtab={selectedSubtab || sections.find(item=>item.id===active)?.label || 'Workspace'} courses={courses} users={portalUsers} applications={applications} services={services}/ >}

          <footer className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Secure Navstar administration · User accounts, student records, uploads and finance operations are protected.</span><span className="font-semibold text-cyan-300">Powered by Navstar Digital Hub</span></footer>
          </div>
        </section>
      </div>
    </main>
  );
}