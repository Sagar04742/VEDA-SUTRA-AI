import { Route, Routes, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';

export default function App() {
  return (
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
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
