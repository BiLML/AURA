import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// --- 1. IMPORT ĐÚNG TỪ CẤU TRÚC FOLDER MỚI ---
// Auth
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import ForgotPassword from './features/auth/ForgotPassword';
import ResetPassword from './features/auth/ResetPassword';

// Dashboards
import Dashboard from './features/dashboards/dashboard';
import DashboardDr from './features/dashboards/dashboarddr';
import DashboardAdmin from './features/dashboards/DashboardAdmin'; 
import ClinicDashboard from './features/dashboards/ClinicDashboard';

// Analysis
import Upload from './features/analysis/Upload';
import Analysis from './features/analysis/Analysis'; 
import DoctorAnalysis from './features/analysis/DoctorAnalysis';
import DoctorReport from './features/analysis/DoctorReport';
import ClinicAnalysisResult from './features/analysis/ClinicAnalysisResult';
import AnalysisBatchResult from './features/analysis/AnalysisBatchResult';

// Profile
import SetUsername from './features/profile/setUsername'; 
import ProfilePage from './features/profile/ProfilePage';
import ProfileDr from './features/profile/ProfileDr';

// Styles
import './styles/App.css'; 

// --- (CÁC PHẦN LOGIC BÊN DƯỚI GIỮ NGUYÊN) ---
const getUserRoleFromStorage = () => {
    try {
        const userInfoString = localStorage.getItem('user_info');
        if (userInfoString) {
            const userInfo = JSON.parse(userInfoString);
            return userInfo.role ? userInfo.role.toLowerCase() : null;
        }
    } catch (e) {
        console.error("Lỗi khi đọc user_info từ localStorage", e);
    }
    return null;
};

const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
    const isAuthenticated = !!localStorage.getItem('token');
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return element;
};

const DefaultRedirect: React.FC = () => {
    const isAuthenticated = !!localStorage.getItem('token');
    const role = getUserRoleFromStorage();
    
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (role === 'admin') return <Navigate to="/admin" replace />;
    if (role === 'doctor') return <Navigate to="/dashboarddr" replace />;
    if (role === 'clinic') return <Navigate to="/clinic-dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
};

const App: React.FC = () => {
    return (
        <Router>
            <div className="app-container">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/admin" element={<DashboardAdmin />} />
                    <Route path="/clinic-dashboard" element={<ClinicDashboard />} />
                    <Route path="/dashboarddr" element={<ProtectedRoute element={<DashboardDr />} />} />

                    <Route path="/upload" element={<ProtectedRoute element={<Upload />} />} />
                    <Route path="/analysis-result-batch" element={<AnalysisBatchResult />} />
                    <Route path="/analysis-result/:id" element={<ProtectedRoute element={<Analysis />} />} />
                    <Route path="/clinic/analysis/:id" element={<ProtectedRoute element={<ClinicAnalysisResult />} />} />
                    <Route path="/doctor/analysis/:id" element={<DoctorAnalysis />} />
                    <Route path="/doctor/report/:id" element={<DoctorReport />} />

                    <Route path="/profile-dr" element={<ProtectedRoute element={<ProfileDr />} />} />
                    <Route path="/set-username" element={<ProtectedRoute element={<SetUsername />} />} />
                    <Route path="/profile" element={<ProtectedRoute element={<ProfilePage />} />} />

                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="*" element={<div style={{ padding: '20px', textAlign: 'center' }}><h1>404</h1><p>Page Not Found</p></div>} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;