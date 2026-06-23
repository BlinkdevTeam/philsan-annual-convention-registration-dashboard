import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import RequireAuth from './components/RequireAuth';
import AdminLayout from './components/AdminLayout';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import Sponsors from './pages/Sponsors';
import SponsorDetail from './pages/SponsorDetail';
import ParticipantDetail from './pages/ParticipantDetail';
import SponsorLogin from './pages/SponsorLogin';
import SponsorStatus from './pages/SponsorStatus';

function AdminPages({ children }) {
    return (
        <AuthProvider>
            <RequireAuth>
                <AdminLayout>
                    {children}
                </AdminLayout>
            </RequireAuth>
        </AuthProvider>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/"                     element={<AdminPages><Overview /></AdminPages>} />
                <Route path="/participants"          element={<AdminPages><Dashboard /></AdminPages>} />
                <Route path="/participants/:id"      element={<AdminPages><ParticipantDetail /></AdminPages>} />
                <Route path="/sponsors"             element={<AdminPages><Sponsors /></AdminPages>} />
                <Route path="/sponsors/:slug"       element={<AdminPages><SponsorDetail /></AdminPages>} />
                <Route path="/sponsor/:slug"        element={<SponsorLogin />} />
                <Route path="/sponsor/:slug/status" element={<SponsorStatus />} />
            </Routes>
        </BrowserRouter>
    );
}
