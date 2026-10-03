import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Loader from './Loader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api/client.js';
import Brand from './Brand.jsx';
import { HeroBackdrop } from './Hero.jsx';

// Shared form for the Login and Signup pages.
export default function AuthForm({ mode }) {
  const isSignup = mode === 'signup';
  const { user, loading, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/chat'; // where the visitor was heading before being asked to log in
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loader />;
  if (user) return <Navigate to={from} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await (isSignup ? signup(form) : login({ email: form.email, password: form.password }));
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input =
    'mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2.5 text-parchment outline-none placeholder:text-parchment/30 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20';

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-8">
      <HeroBackdrop />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-gold-500/40 bg-ink-900/85 p-6 shadow-2xl backdrop-blur sm:p-8">
        <Link to="/" aria-label="Back to the VedaSutra home page" className="block rounded-xl transition hover:opacity-90">
          <Brand size="lg" />
        </Link>
        <h1 className="mb-5 mt-4 text-center font-serif text-2xl text-parchment">
          {isSignup ? 'Begin your journey' : 'Welcome back'}
        </h1>

        <form onSubmit={onSubmit} className="space-y-4">
          {isSignup && (
            <label className="block text-sm font-medium text-parchment/90">
              Name
              <input className={input} value={form.name} onChange={set('name')} required autoComplete="name" />
            </label>
          )}
          <label className="block text-sm font-medium text-parchment/90">
            Email
            <input type="email" className={input} value={form.email} onChange={set('email')} required autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-parchment/90">
            Password
            <input
              type="password"
              className={input}
              value={form.password}
              onChange={set('password')}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
            {isSignup && <span className="text-xs font-normal text-parchment/50">At least 8 characters</span>}
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            disabled={busy}
            className="w-full rounded-xl border border-gold-300/60 bg-gradient-to-b from-gold-500/55 to-gold-600/40 py-2.5 font-medium text-gold-200 transition hover:from-gold-500/70 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-parchment/70">
          {isSignup ? 'Already have an account? ' : 'New here? '}
          <Link className="font-medium text-gold-300 underline underline-offset-2" to={isSignup ? '/login' : '/signup'} state={location.state}>
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </main>
  );
}
