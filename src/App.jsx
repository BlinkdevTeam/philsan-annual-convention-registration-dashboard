import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import SurveyResults from './pages/SurveyResults';
import QuizResults from './pages/QuizResults';
import Reports from './pages/Reports';
import PortalPage from './pages/PortalPage';
import SurveyPage from './pages/SurveyPage';
import QuizPage from './pages/QuizPage';
import CertificatePage from './pages/CertificatePage';
import VerifyPage from './pages/VerifyPage';

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
                <Route path="/survey-results"           element={<AdminPages><SurveyResults /></AdminPages>} />
                <Route path="/quiz-results"             element={<AdminPages><QuizResults /></AdminPages>} />
                <Route path="/reports"                  element={<AdminPages><Reports /></AdminPages>} />

                {/* Sponsor portal (public) */}
                <Route path="/sponsor/:slug"            element={<SponsorLogin />} />
                <Route path="/sponsor/:slug/status"     element={<SponsorStatus />} />

                {/* Participant portal (public) */}
                <Route path="/portal"                   element={<PortalPage />} />
                <Route path="/portal/quiz"              element={<QuizPage />} />
                <Route path="/portal/survey"            element={<SurveyPage />} />
                <Route path="/certificate/:token"       element={<CertificatePage />} />
                <Route path="/verify/:code"             element={<VerifyPage />} />

                {/* Old links from before the portal */}
                <Route path="/survey"                   element={<Navigate to="/portal" replace />} />
                <Route path="/quiz"                     element={<Navigate to="/portal" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
