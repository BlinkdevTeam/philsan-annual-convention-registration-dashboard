import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import RequireAuth from './components/RequireAuth';
import AdminLayout from './components/AdminLayout';
import Overview from './pages/Overview';
import Dashboard from './pages/Dashboard';
import Sponsors from './pages/Sponsors';
import SponsorDetail from './pages/SponsorDetail';
import ParticipantDetail from './pages/ParticipantDetail';
import Attendance from './pages/Attendance';
import WalkInRegistration from './pages/WalkInRegistration';
import ParticipantQR from './pages/ParticipantQR';
import SponsorLogin from './pages/SponsorLogin';
import SponsorStatus from './pages/SponsorStatus';

function AuthOnly({ children }) {
    return (
        <AuthProvider>
            <RequireAuth>
                {children}
            </RequireAuth>
        </AuthProvider>
    );
}

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
                <Route path="/"                         element={<AdminPages><Overview /></AdminPages>} />
                <Route path="/participants"             element={<AdminPages><Dashboard /></AdminPages>} />
                <Route path="/participants/:id"         element={<AdminPages><ParticipantDetail /></AdminPages>} />
                <Route path="/participants/:id/qr"      element={<AuthOnly><ParticipantQR /></AuthOnly>} />
                <Route path="/sponsors"                 element={<AdminPages><Sponsors /></AdminPages>} />
                <Route path="/sponsors/:slug"           element={<AdminPages><SponsorDetail /></AdminPages>} />
                <Route path="/attendance"               element={<AdminPages><Attendance /></AdminPages>} />
                <Route path="/walk-in"                  element={<AdminPages><WalkInRegistration /></AdminPages>} />
                <Route path="/sponsor/:slug"            element={<SponsorLogin />} />
                <Route path="/sponsor/:slug/status"     element={<SponsorStatus />} />
            </Routes>
        </BrowserRouter>
    );
}