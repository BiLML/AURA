import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './dashboard';
import DashboardDr from './dashboarddr';
import DashboardAdmin from './DashboardAdmin'; 
import ClinicDashboard from './ClinicDashboard';
import './App.css';
import Register from './Register';
import Upload from './Upload';
import Analysis from './Analysis'; 
import SetUsername from './setUsername'; 
import ProfilePage from './ProfilePage';
import ProfileDr from './ProfileDr';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import DoctorAnalysis from './DoctorAnalysis';
import DoctorReport from './DoctorReport';
import ClinicAnalysisResult from './ClinicAnalysisResult';
import AnalysisBatchResult from './AnalysisBatchResult';

// --- HÀM HỖ TRỢ ĐỌC ROLE TỪ LOCAL STORAGE ---
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

// 🛡️ Component Bảo Vệ Tuyến Đường
const ProtectedRoute: React.FC<{ element: React.ReactElement }> = ({ element }) => {
    const isAuthenticated = !!localStorage.getItem('token');
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return element;
};

// ⭐ COMPONENT ĐIỀU HƯỚNG MẶC ĐỊNH ⭐
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
                    {/* --- CÁC ROUTE CÔNG KHAI --- */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* --- DASHBOARDS --- */}
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/admin" element={<DashboardAdmin />} />
                    <Route path="/clinic-dashboard" element={<ClinicDashboard />} />
                    <Route path="/dashboarddr" element={<ProtectedRoute element={<DashboardDr />} />} />

                    {/* --- CÁC ROUTE XỬ LÝ ẢNH & PHÂN TÍCH (QUAN TRỌNG) --- */}
                    
                    {/* 1. Trang Upload & Batch Result (Dùng chung) */}
                    <Route path="/upload" element={<ProtectedRoute element={<Upload />} />} />
                    <Route path="/analysis-result-batch" element={<AnalysisBatchResult />} />

                    {/* 2. Trang Chi tiết dành cho USER THƯỜNG */}
                    <Route path="/analysis-result/:id" element={<ProtectedRoute element={<Analysis />} />} />

                    {/* 3. Trang Chi tiết dành cho PHÒNG KHÁM (CLINIC) */}
                    <Route path="/clinic/analysis/:id" element={<ProtectedRoute element={<ClinicAnalysisResult />} />} />

                    {/* 4. Trang dành cho BÁC SĨ (DOCTOR) */}
                    <Route path="/doctor/analysis/:id" element={<DoctorAnalysis />} />
                    <Route path="/doctor/report/:id" element={<DoctorReport />} />


                    {/* --- USER PROFILE --- */}
                    <Route path="/profile-dr" element={<ProtectedRoute element={<ProfileDr />} />} />
                    <Route path="/set-username" element={<ProtectedRoute element={<SetUsername />} />} />
                    <Route path="/profile" element={<ProtectedRoute element={<ProfilePage />} />} />

                    {/* --- DEFAULT & 404 --- */}
                    <Route path="/" element={<DefaultRedirect />} />
                    <Route path="*" element={<div style={{ padding: '20px', textAlign: 'center' }}><h1>404</h1><p>Page Not Found</p></div>} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;