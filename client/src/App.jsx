import { useEffect, useState } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Backdrop from './components/Backdrop.jsx';
import Loader from './components/Loader.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import Shastrarth from './pages/Shastrarth.jsx';

export default function App() {
  const { loading, booted } = useAuth();
  const [loaderGone, setLoaderGone] = useState(false);

  // The loader fades out when the page is ready, then is removed.
  useEffect(() => {
    if (!booted) return;
    const t = setTimeout(() => setLoaderGone(true), 800);
    return () => clearTimeout(t);
  }, [booted]);

  return (
    <>
      <Backdrop />
      {/* Pages mount once we know whether you are logged in (so a private page never flashes the login page). */}
      {!loading && (
        <Routes>
          {/* Public: the home page loads first, nobody is asked to log in just for looking. */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Needs an account: visitors are sent to the login page and brought back afterwards. */}
          <Route element={<ProtectedRoute />}>
            {/* "/chat" and "/chat/c/:id" share one Chat instance so state survives when a new chat gets its id. */}
            <Route path="/chat" element={<Chat />}>
              <Route path="c/:id" />
            </Route>
            {/* The dedicated battle arena; "/shastrarth/c/:id" reopens a saved session (same instance, like the chat). */}
            <Route path="/shastrarth" element={<Shastrarth />}>
              <Route path="c/:id" />
            </Route>
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      {!loaderGone && <Loader leaving={booted} />}
    </>
  );
}
