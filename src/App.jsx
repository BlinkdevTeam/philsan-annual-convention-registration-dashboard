import { AuthProvider } from './lib/AuthContext';
import RequireAuth from './components/RequireAuth';
import Dashboard from './pages/Dashboard';

export default function App() {
    return (
        <AuthProvider>
            <RequireAuth>
                <Dashboard />
            </RequireAuth>
        </AuthProvider>
    );
}
