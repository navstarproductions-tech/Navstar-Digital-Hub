
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiResponse } from '@/lib/api';

export function BootstrapPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password requirements
  const passwordRules = [
    /[A-Z]/.test(password),       // Capital letter
    /[a-z]/.test(password),       // Small letter
    /[0-9]/.test(password),       // Number
    /[^A-Za-z0-9]/.test(password) // Special character
  ];

  const passwordTypes = passwordRules.filter(Boolean).length;

  const passwordValid =
    password.length >= 6 && passwordTypes >= 3;

  const passwordStrength =
    !passwordValid
      ? 'Weak'
      : password.length >= 10 && passwordTypes === 4
        ? 'Strong'
        : 'Good';

  const passwordsMatch =
    password.length > 0 && password === confirmPassword;

  const createAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordValid) {
      setStatus(
        'Password must have at least 6 characters and meet at least 3 of the 4 character requirements.'
      );
      return;
    }

    if (!passwordsMatch) {
      setStatus('Your passwords do not match. Please confirm your password correctly.');
      return;
    }

    const data = new FormData(event.currentTarget);

    setLoading(true);
    setStatus('');

    try {
      const response = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer ' + String(data.get('setupToken') ?? '')
        },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          password,
          confirmPassword
        })
      });

      const result = await readApiResponse<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(result.error || 'Admin setup failed.');
      }

      navigate('/login?role=admin', {
        replace: true,
        state: {
          notice:
            'Your new Admin account is ready. Sign in using your new email and password.'
        }
      });
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Admin setup failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-950 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-7 shadow-2xl sm:p-9">

        <Link
          to="/login?role=admin"
          className="inline-flex items-center gap-2 text-sm text-slate-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin sign in
        </Link>

        <ShieldCheck className="mt-7 h-8 w-8 text-blue-700" />

        <p className="mt-5 text-xs font-extrabold uppercase tracking-[.2em] text-blue-700">
          NAVSTAR DIGITAL HUB / SECURE ADMIN SETUP
        </p>

        <h1 className="mt-2 text-2xl font-black text-slate-950">
          Create your Admin login
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Create fresh Admin sign-in details. Your existing Navstar records
          are retained. Only one active Admin account is allowed. This setup
          requires the private key stored in Cloudflare Production secrets.
        </p>

        <form onSubmit={createAdmin} className="mt-6 space-y-4">

          {/* Private setup key */}
          <div className="space-y-2">
            <Label htmlFor="setup-token">
              Private Admin setup key
            </Label>
            <Input
              id="setup-token"
              name="setupToken"
              type="password"
              autoComplete="off"
              minLength={32}
              required
            />
          </div>

          {/* Admin name */}
          <div className="space-y-2">
            <Label htmlFor="admin-name">
              Full name
            </Label>
            <Input
              id="admin-name"
              name="name"
              autoComplete="name"
              minLength={2}
              required
            />
          </div>

          {/* Admin email */}
          <div className="space-y-2">
            <Label htmlFor="admin-email">
              New Admin email
            </Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="admin-password">
              Create password
            </Label>

            <Input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setStatus('');
              }}
            />

            <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs">

              <p className="font-semibold text-slate-700">
                Minimum 6 characters. Meet at least 3 of these 4 requirements:
              </p>

              <p className={passwordRules[0] ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRules[0] ? '✓' : '○'} Capital letter (A–Z)
              </p>

              <p className={passwordRules[1] ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRules[1] ? '✓' : '○'} Small letter (a–z)
              </p>

              <p className={passwordRules[2] ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRules[2] ? '✓' : '○'} Number (0–9)
              </p>

              <p className={passwordRules[3] ? 'text-emerald-700' : 'text-slate-500'}>
                {passwordRules[3] ? '✓' : '○'} Special character (!@#$%)
              </p>

              <p className={
                passwordStrength === 'Strong'
                  ? 'font-bold text-emerald-700'
                  : passwordStrength === 'Good'
                    ? 'font-bold text-blue-700'
                    : 'font-bold text-rose-700'
              }>
                Password strength: {passwordStrength}
              </p>

              <p className="text-slate-500">
                Strong: 10 or more characters with all 4 requirements.
              </p>
            </div>
          </div>

          {/* Confirm password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">
              Confirm password
            </Label>

            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setStatus('');
              }}
            />

            <p className={
              confirmPassword.length === 0
                ? 'text-xs text-slate-500'
                : passwordsMatch
                  ? 'text-xs text-emerald-700'
                  : 'text-xs text-rose-700'
            }>
              {confirmPassword.length === 0
                ? 'Enter the password again.'
                : passwordsMatch
                  ? '✓ Passwords match.'
                  : '✗ Passwords do not match.'}
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={loading || !passwordsMatch || !passwordValid}
            className="w-full bg-blue-800 hover:bg-blue-900"
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {loading ? 'Creating Admin login…' : 'Create Admin login'}
          </Button>

          {status && (
            <p
              role="alert"
              className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
            >
              {status}
            </p>
          )}

        </form>
      </section>
    </main>
  );
}
