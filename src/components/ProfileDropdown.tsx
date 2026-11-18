import type { ChangeEvent } from 'react';

export const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
export const CITIZENSHIP_OPTIONS = ['Kenyan', 'Ugandan', 'Tanzanian', 'Rwandan', 'Burundian', 'South Sudanese', 'Somali', 'Ethiopian', 'Congolese', 'Nigerian', 'Ghanaian', 'South African', 'British', 'American', 'Other'];
export const DEPARTMENT_OPTIONS = ['Administration', 'Academic & Training', 'Admissions & Registry', 'Finance & Accounts', 'ICT & Systems', 'Student Affairs', 'Human Resources', 'Marketing & Communications', 'Cyber Services', 'Library & Resource Centre', 'Quality Assurance', 'Operations', 'Customer Support', 'Other'];
export const JOB_TITLE_OPTIONS = ['Chief Executive Officer', 'Managing Director', 'Administrator', 'Principal', 'Deputy Principal', 'Head of Department', 'Lecturer', 'Tutor', 'Teacher', 'ICT Officer', 'Systems Administrator', 'Software Developer', 'Finance Officer', 'Accountant', 'Admissions Officer', 'Registry Officer', 'Human Resources Officer', 'Cyber Technician', 'Customer Support Officer', 'Intern', 'Other'];
export const EMPLOYMENT_TYPE_OPTIONS = ['Permanent', 'Contract', 'Part-time', 'Casual', 'Internship', 'Volunteer', 'Consultant', 'Self-employed', 'Not applicable'];

type Props = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
};

export function ProfileDropdown({ id, label, value, options, onChange, required = false, placeholder = 'Select an option' }: Props) {
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium text-slate-800">{label}{required ? ' *' : ''}</label>
    <select id={id} value={value} required={required} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600">
      <option value="">{placeholder}</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  </div>;
}
