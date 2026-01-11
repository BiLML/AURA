import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaHospital, FaBrain, FaSignOutAlt, FaSearch, 
    FaCheck, FaUsers, FaUserShield, FaBell 
} from 'react-icons/fa';

// --- INTERFACES ---
interface User {
    id: string;
    username: string;
    email: string;
    role: string;
    status: string;
    assigned_doctor_id: string | null;
    profile?: {
        full_name: string | null;
        phone: string | null;
        medical_info: any | null; // Vì model là JSONB
    };
}

interface ClinicRequest {
    id: string;
    name: string;
    owner_name: string;
    owner_id: string;
    phone: string;
    address: string;
    license_number: string;
    images: { front: string | null; back: string | null };
    created_at: string;
}

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback'>('users'); 
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]); 
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);
    const [feedbackList, setFeedbackList] = useState<any[]>([]); 

    // UI Dropdown
    const [showUserMenu, setShowUserMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
  const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            // 1. Lấy thông tin Admin
            const meRes = await fetch('http://127.0.0.1:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
            if (meRes.ok) {
                const meData = await meRes.json();
                //
    // --- FETCH DATA ---
   FIX LỖI: Kiểm tra cả 2 trường hợp dữ liệu (phẳng hoặc lồng)
                const info = meData.user_info || meData; 
                setAdminName(info.username || info.userName || 'Admin');
            }

            // 2. Lấy danh sách Users
            const userRes = await fetch('http://127.0.0.1:8000/api/v1/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (userRes.ok) {
                const data = await userRes.json();
                // Backend trả về { users: [...] } hoặc list trực tiếp
                const users = data.users || data || []; 
                setUserList(users.filter((u: User) => u.role !== 'admin'));
                setDoctorList(users.filter((u: User) => u.role === 'doctor'));
            }

            // 3. Lấy danh sách Phòng khám chờ duyệt
            const clinicRes = await fetch('http://127.0.0.1:8000/api/v1/clinics/admin/pending', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (clinicRes.ok) {
                const data = await clinicRes.json();
                setClinicRequests(data.requests || []);
            }

            // 4. Lấy báo cáo (Nếu chưa có API này thì bỏ qua hoặc try-catch riêng để không chặn code)
            try {
                const reportRes = await fetch('http://127.0.0.1:8000/api/v1/admin/reports', { headers: { 'Authorization': `Bearer ${token}` } });
                if (reportRes.ok) {
                    const data = await reportRes.json();
                    setFeedbackList(data.reports || []);
                }
            } catch (e) { console.warn("Chưa có API reports"); }

        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);
    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login', { replace: true });
    };

    const handleClinicAction = async (clinicId: string, action: 'APPROVED' | 'REJECTED') => {
        if(!window.confirm(action === 'APPROVED' ? "Duyệt phòng khám này?" : "Từ chối yêu cầu này?")) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/clinics/admin/${clinicId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: action })
            });
            if (res.ok) {
                alert("Đã xử lý thành công.");
                fetchData(); 
            } else {
                alert("Có lỗi xảy ra.");
            }
        } catch (e) { alert("Lỗi server."); }
    };

    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu Admin...</div>;

    return (
        <div style={styles.fullScreenContainer}>
            {/* --- TOP HEADER --- */}
            <header style={styles.topBar}>
                <div style={styles.logoArea}>
                    <img src="/logo.svg" alt="Logo" style={{width:'35px'}} />
                    <h1 style={styles.headerTitle}>AURA <span style={{fontWeight:'400'}}>ADMIN</span></h1>
                </div>
                
                <div style={styles.headerRight}>
                    <div style={{position:'relative', marginRight:'25px', cursor:'pointer'}}>
                        <FaBell size={20} color="#64748b" />
                        {clinicRequests.length > 0 && <span style={styles.bellBadge}>{clinicRequests.length}</span>}
                    </div>

                    <div style={{position:'relative'}} ref={profileRef}>
                        <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                            <div style={styles.avatarCircle}>{adminName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{adminName}</span>
                        </div>
                        {showUserMenu && (
                            <div style={styles.dropdownMenu}>
                                <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}>
                                    <FaSignOutAlt style={{marginRight:8}}/> Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
