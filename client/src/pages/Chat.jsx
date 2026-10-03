import { useAuth } from '../context/AuthContext.jsx';

// Placeholder: the real chat UI arrives in phase 2.
export default function Chat() {
  const { user, logout } = useAuth();
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <div className="font-serif text-5xl text-saffron-600" aria-hidden>ॐ</div>
        <h1 className="mt-2 font-serif text-2xl text-maroon-700">Namaste, {user.name}</h1>
        <p className="text-maroon-700/70">Chat is coming in the next phase.</p>
        <button onClick={logout} className="mt-5 rounded-lg border border-saffron-500 px-4 py-2 text-saffron-700 hover:bg-cream-100">
          Log out
        </button>
      </div>
    </main>
  );
}
