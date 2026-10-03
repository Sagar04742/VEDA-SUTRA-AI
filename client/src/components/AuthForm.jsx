import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';

// Shared form for the Login and Signup pages.
export default function AuthForm({ mode }) {
  const isSignup = mode === 'signup';
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await (isSignup ? signup(form) : login({ email: form.email, password: form.password }));
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-lg border border-cream-200 bg-white px-3 py-2.5 outline-none focus:border-saffron-500 focus:ring-2 focus:ring-saffron-400/30';

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-cream-100 to-cream-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-cream-200 bg-white/80 p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="font-serif text-4xl text-saffron-600" aria-hidden>ॐ</div>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-maroon-700">Vedic Math &amp; Ancient Science</h1>
          <p className="text-sm text-maroon-700/70">{isSignup ? 'Create your account' : 'Welcome back'}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {isSignup && (
            <label className="block text-sm font-medium">
              Name
              <input className={`${input} mt-1`} value={form.name} onChange={set('name')} required autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input type="email" className={`${input} mt-1`} value={form.email} onChange={set('email')} required autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              className={`${input} mt-1`}
              value={form.password}
              onChange={set('password')}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            {isSignup && <span className="text-xs font-normal text-maroon-700/60">At least 8 characters</span>}
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            disabled={busy}
            className="w-full rounded-lg bg-saffron-500 py-2.5 font-medium text-white transition hover:bg-saffron-600 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm">
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <Link className="font-medium text-saffron-700 underline" to={isSignup ? '/login' : '/signup'}>
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </main>
  );
}
