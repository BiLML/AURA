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

// --- HÀM HỖ TRỢ ĐỌC ROLE TỪ LOCAL STORAGE (GIỮ NGUYÊN) ---
const getUserRoleFromStorage = () => {
    try {
        const userInfoString = localStorage.getItem('user_info');
        if (userInfoString) {
            const userInfo = JSON.parse(userInfoString);
            // Trả về vai trò ở dạng chữ thường
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

// ⭐ COMPONENT ĐIỀU HƯỚNG MẶC ĐỊNH ĐƯỢC ĐƯA RA NGOÀI ⭐
const DefaultRedirect: React.FC = () => {
    const isAuthenticated = !!localStorage.getItem('token');
    const role = getUserRoleFromStorage();
    
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    
    if (role === 'admin') {
        return <Navigate to="/admin" replace />;
    }
    
    if (role === 'doctor') {
        return <Navigate to="/dashboarddr" replace />;
    }

    if (role === 'clinic_owner') {
        return <Navigate to="/clinic-dashboard" replace />;
    }
    
    // Mặc định là USER hoặc Guest (nếu chưa đăng ký)
    return <Navigate to="/dashboard" replace />;
};

const App: React.FC = () => {
    return (
        <Router>
            <div className="app-container">
                <Routes>
                    {/* 1. Các trang Công khai */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    {/* 2. Các trang Bảo mật (Protected Routes) */}
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/admin" element={<DashboardAdmin />} />
                    <Route path="/clinic-dashboard" element={<ClinicDashboard />} />
                    <Route path="/dashboarddr" element={<ProtectedRoute element={<DashboardDr />} />} />
                    <Route path="/doctor/analysis/:id" element={<DoctorAnalysis />} />
                    <Route path="/profile-dr" element={<ProtectedRoute element={<ProfileDr />} />} />
                    <Route path="/upload" element={<ProtectedRoute element={<Upload />} />} />
                    <Route path="/analysis-result/:id" element={<ProtectedRoute element={<Analysis />} />} />
                    <Route path="/set-username" element={<ProtectedRoute element={<SetUsername />} />} />
                    <Route path="/profile" element={<ProtectedRoute element={<ProfilePage />} />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    {/* ROUTE CHO ADMIN DASHBOARD */}
                    <Route path="/admin" element={<DashboardAdmin />} />
                    
                    {/* 3. Trang mặc định: Sử dụng component DefaultRedirect độc lập */}
                    <Route 
                        path="/" 
                        element={<DefaultRedirect />} 
                    />

                    {/* 4. Trang 404 */}
                    <Route path="*" element={
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <h1>404</h1>
                            <p>Không tìm thấy trang. <a href="/">Quay về trang chính</a></p>
                        </div>
                    } />
                </Routes>
            </div>
        </Router>
    );
};

export default App;