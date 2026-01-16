import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaHospital, FaBrain, FaSignOutAlt, FaSearch, 
    FaCheck, FaUsers, FaUserShield, FaBell,
    FaEdit, FaLock, FaUnlock, FaBan, FaTimes, FaSave, 
    FaCogs, FaRobot, FaMoneyBillWave, FaPlus // ✅ Đã thêm icon cho Config
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
        medical_info: any | null;
    };
    is_active: boolean;
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
    status?: string;
}

// Interface cho cấu hình AI
interface AIConfig {
    confidence_threshold: number;
    model_version: string;
    alert_risk_level: string;
    enable_email_alerts: boolean;
    auto_retrain: boolean;
    retrain_frequency_days: number;
    min_new_data_samples: number;
}

interface ServicePackage {
    id: string;
    name: string;
    price: number;
    analysis_limit: number;
    duration_days: number;
    description: string;
    target_role: string;
    is_active?: boolean;
}

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI ---
    // Thêm tab 'config' vào danh sách tabs
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback' | 'config' | 'billing'>('users'); 
    const [clinicViewMode, setClinicViewMode] = useState<'pending' | 'active'>('pending');
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    // --- STATE DATA ---
    const [userList, setUserList] = useState<User[]>([]);
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);
    const [activeClinics, setActiveClinics] = useState<ClinicRequest[]>([]);
    const [feedbackList, setFeedbackList] = useState<any[]>([]); 
    
    // state cho Billing & Packages
    const [packageList, setPackageList] = useState<ServicePackage[]>([]);
    const [showPackageModal, setShowPackageModal] = useState(false);
    const [newPackage, setNewPackage] = useState({
        name: '',
        price: 0,
        analysis_limit: 10,
        duration_days: 30,
        description: '',
        target_role: 'USER' // Mặc định bán cho User
    });

    // State cho Config AI (Mặc định)
    const [aiConfig, setAiConfig] = useState<AIConfig>({
        confidence_threshold: 0.85,
        model_version: 'v1.0.0',
        alert_risk_level: 'SEVERE',
        enable_email_alerts: true,
        auto_retrain: false,
        retrain_frequency_days: 30,
        min_new_data_samples: 100
    });

    // --- STATE MODAL (SỬA USER) ---
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editForm, setEditForm] = useState({ role: '', status: '' });

    // UI Refs
    const [showUserMenu, setShowUserMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            // 1. Info Admin & Check Role
            const meRes = await fetch('http://127.0.0.1:8000/api/v1/users/me', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });

            if (meRes.ok) {
                const meData = await meRes.json();
                const info = meData.user_info || meData; 
                
                if (info.role !== 'admin') {
                    alert("⛔ CẢNH BÁO: Bạn không có quyền truy cập trang Quản trị!");
                    navigate('/'); 
                    return; 
                }

                setAdminName(info.username || 'Admin');
            } else {
                localStorage.removeItem('token');
                navigate('/login');
                return;
            }

            // 2. Users List
            const userRes = await fetch('http://127.0.0.1:8000/api/v1/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
            if (userRes.ok) {
                const data = await userRes.json();
                const users = data.users || data || []; 
                setUserList(users.filter((u: User) => u.role !== 'admin'));
            }

            // 3. Pending Clinics
            const clinicRes = await fetch('http://127.0.0.1:8000/api/v1/clinics/admin/pending', { headers: { 'Authorization': `Bearer ${token}` } });
            if (clinicRes.ok) {
                const data = await clinicRes.json();
                setClinicRequests(data.requests || []);
            }

            // 4. Active Clinics
            const allClinicsRes = await fetch('http://127.0.0.1:8000/api/v1/clinics/', { headers: { 'Authorization': `Bearer ${token}` } });
            if (allClinicsRes.ok) {
                const allClinics = await allClinicsRes.json();
                const active = allClinics.filter((c: any) => c.status === 'APPROVED' || c.status === 'SUSPENDED');
                setActiveClinics(active);
            }

            // 5. Reports/Feedback
            try {
                const reportRes = await fetch('http://127.0.0.1:8000/api/v1/admin/reports', { headers: { 'Authorization': `Bearer ${token}` } });
                if (reportRes.ok) {
                    const data = await reportRes.json();
                    setFeedbackList(data.reports || []);
                }
            } catch (e) { }

            // 6. AI Config (FR-33)
            try {
                const configRes = await fetch('http://127.0.0.1:8000/api/v1/admin/config', { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                if (configRes.ok) {
                    const configData = await configRes.json();
                    setAiConfig(configData);
                }
            } catch (e) { }

            // 👇 7. THÊM: GET PACKAGES
            try {
                const pkgRes = await fetch('http://127.0.0.1:8000/api/v1/billing/packages', { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                if (pkgRes.ok) {
                    const pkgData = await pkgRes.json();
                    setPackageList(pkgData);
                }
            } catch (e) { console.error("Lỗi fetch gói:", e); }

            setIsLoading(false);

        } catch (error) {
            console.error(error);
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- HANDLERS: USER ACTIONS ---
    const openEditUser = (user: User) => {
        setEditingUser(user);
        setEditForm({ role: user.role, status: user.status });
        setShowUserModal(true);
    };

    const handleSaveUser = async () => {
        if (!editingUser) return;
        const token = localStorage.getItem('token');
        try {
            if (editForm.role !== editingUser.role) {
                await fetch(`http://127.0.0.1:8000/api/v1/admin/users/${editingUser.id}/role`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ role: editForm.role })
                });
            }
            if (editForm.status !== editingUser.status) {
                await fetch(`http://127.0.0.1:8000/api/v1/admin/users/${editingUser.id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ status: editForm.status }) 
                });
            }
            alert("Cập nhật thành công!");
            setShowUserModal(false);
            fetchData();
        } catch (e) {
            alert("Lỗi cập nhật: " + e);
        }
    };

    const handleToggleLock = async (user: User) => {
        const newStatus = user.status === 'active' ? 'suspended' : 'active';
        const action = user.status === 'active' ? 'KHÓA' : 'MỞ KHÓA';
        if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản ${user.username}?`)) return;
        
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/admin/users/${user.id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }) 
            });
            if (res.ok) {
                alert(`Đã ${action} thành công.`);
                fetchData();
            } else {
                alert("Lỗi API");
            }
        } catch (e) { alert("Lỗi kết nối."); }
    };

    // --- HANDLERS: CLINIC ACTIONS ---
    const handleClinicAction = async (clinicId: string, action: 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ACTIVE') => {
        if(!window.confirm(`Xác nhận hành động: ${action}?`)) return;
        const token = localStorage.getItem('token');
        try {
            const statusToSend = action === 'ACTIVE' ? 'APPROVED' : action;
            const res = await fetch(`http://127.0.0.1:8000/api/v1/clinics/admin/${clinicId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: statusToSend })
            });
            if (res.ok) { alert("Thành công."); fetchData(); } 
            else { alert("Lỗi API."); }
        } catch (e) { alert("Lỗi server."); }
    };

    // --- HANDLER: AI CONFIG ---
    const handleSaveConfig = async () => {
        if(!window.confirm("Lưu các thay đổi cấu hình hệ thống?")) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/v1/admin/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(aiConfig)
            });
            if (res.ok) {
                alert("Cập nhật cấu hình thành công!");
                fetchData();
            } else {
                alert("Lỗi khi lưu cấu hình.");
            }
        } catch (e) { alert("Lỗi kết nối."); }
    };

    const handleCreatePackage = async () => {
        if (!newPackage.name || newPackage.price < 0) {
            alert("Vui lòng nhập tên gói và giá hợp lệ!");
            return;
        }

        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/v1/billing/packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newPackage)
            });

            if (res.ok) {
                alert("✅ Tạo gói dịch vụ thành công!");
                setShowPackageModal(false);
                // Reset form
                setNewPackage({ name: '', price: 0, analysis_limit: 10, duration_days: 30, description: '', target_role: 'USER' });
                fetchData(); // Load lại list
            } else {
                const err = await res.json();
                alert("❌ Lỗi: " + (err.detail || "Không thể tạo gói"));
            }
        } catch (e) {
            alert("Lỗi kết nối server");
        }
    };
    
    // Hàm helper format tiền VND
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu Admin...</div>;

    return (
        <div style={styles.fullScreenContainer}>
            {/* HEADER */}
            <header style={styles.topBar}>
                <div style={styles.logoArea}>
                    <FaUserShield size={24} color="#007bff"/>
                    <h1 style={styles.headerTitle}>AURA <span style={{fontWeight:'400'}}>ADMIN</span></h1>
                </div>
                <div style={styles.headerRight}>
                    <div style={{position:'relative', marginRight:'25px'}}>
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

            {/* MAIN CONTENT */}
            <main style={styles.mainBody}>
                <div style={styles.contentWrapper}>
                    {/* STATS / TABS */}
                    <div style={styles.statsGrid}>
                        {/* Users Tab */}
                        <div onClick={() => setActiveTab('users')} style={activeTab === 'users' ? styles.statCardActive : styles.statCard}>
                            <div style={{...styles.iconBox, background: activeTab === 'users' ? '#e7f1ff' : '#f1f5f9', color: activeTab === 'users' ? '#007bff' : '#64748b'}}>
                                <FaUsers size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={styles.statLabel}>Người dùng</span>
                                <span style={styles.statCount}>{userList.length} Active</span>
                            </div>
                        </div>

                        {/* Clinics Tab */}
                        <div onClick={() => setActiveTab('clinics')} style={activeTab === 'clinics' ? styles.statCardActive : styles.statCard}>
                            <div style={{...styles.iconBox, background: activeTab === 'clinics' ? '#e7f1ff' : '#f1f5f9', color: activeTab === 'clinics' ? '#007bff' : '#64748b'}}>
                                <FaHospital size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={styles.statLabel}>Phòng khám</span>
                                <span style={styles.statCount}>{activeClinics.length} Active</span>
                            </div>
                            {clinicRequests.length > 0 && <span style={styles.redDot}></span>}
                        </div>

                        {/* Feedback Tab */}
                        <div onClick={() => setActiveTab('feedback')} style={activeTab === 'feedback' ? styles.statCardActive : styles.statCard}>
                            <div style={{...styles.iconBox, background: activeTab === 'feedback' ? '#e7f1ff' : '#f1f5f9', color: activeTab === 'feedback' ? '#007bff' : '#64748b'}}>
                                <FaBrain size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={styles.statLabel}>Feedback</span>
                                <span style={styles.statCount}>{feedbackList.length} Reports</span>
                            </div>
                        </div>

                        {/* Billing / Packages Tab (Mới) */}
                        <div onClick={() => setActiveTab('billing')} style={activeTab === 'billing' ? styles.statCardActive : styles.statCard}>
                            <div style={{...styles.iconBox, background: activeTab === 'billing' ? '#e7f1ff' : '#f1f5f9', color: activeTab === 'billing' ? '#007bff' : '#64748b'}}>
                                <FaMoneyBillWave size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={styles.statLabel}>Gói Dịch vụ</span>
                                <span style={styles.statCount}>{packageList.length} Gói</span>
                            </div>
                        </div>

                        {/* AI Config Tab (Mới) */}
                        <div onClick={() => setActiveTab('config')} style={activeTab === 'config' ? styles.statCardActive : styles.statCard}>
                            <div style={{...styles.iconBox, background: activeTab === 'config' ? '#e7f1ff' : '#f1f5f9', color: activeTab === 'config' ? '#007bff' : '#64748b'}}>
                                <FaCogs size={24}/>
                            </div>
                            <div style={styles.statInfo}>
                                <span style={styles.statLabel}>Cấu hình AI</span>
                                <span style={styles.statCount}>{aiConfig.model_version}</span>
                            </div>
                        </div>


                    </div>

                    {/* CONTENT TABLE */}
                    <div style={styles.tableCard}>
                        
                        {/* TAB 1: USERS */}
                        {activeTab === 'users' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaUserShield style={{marginRight:10, color:'#007bff'}}/>Quản lý Người dùng</h3>
                                    <div style={styles.searchContainer}>
                                        <FaSearch color="#94a3b8"/>
                                        <input placeholder="Tìm kiếm..." style={styles.searchInput}/>
                                    </div>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>USERNAME</th>
                                                <th style={styles.th}>HỌ TÊN</th>
                                                <th style={styles.th}>VAI TRÒ</th>
                                                <th style={styles.th}>TRẠNG THÁI</th>
                                                <th style={{...styles.th, textAlign:'center'}}>THAO TÁC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userList.map(u => (
                                                <tr key={u.id} style={styles.tr}>
                                                    <td style={styles.td}><b>{u.username}</b><br/><small style={{color:'#64748b'}}>{u.email}</small></td>
                                                    <td style={styles.td}>{u.profile?.full_name || '--'}</td>
                                                    <td style={styles.td}>
                                                        <span style={{
                                                            ...styles.roleBadge, 
                                                            background: u.role==='doctor' ? '#e0f2fe': u.role==='clinic' ? '#f3e8ff' : '#dcfce7',
                                                            color: u.role==='doctor' ? '#0369a1': u.role==='clinic' ? '#7e22ce' : '#15803d'
                                                        }}>{u.role}</span>
                                                    </td>
                                                    <td style={styles.td}>
                                                        {u.status === 'active' ? 
                                                            <span style={{color:'#16a34a', fontWeight:'600', fontSize:'12px'}}>● Active</span> : 
                                                            <span style={{color:'#dc2626', fontWeight:'600', fontSize:'12px'}}>● Locked ({u.status})</span>
                                                        }
                                                    </td>
                                                    <td style={{...styles.td, textAlign:'center'}}>
                                                        <div style={{display:'flex', justifyContent:'center', gap:'10px'}}>
                                                            <button onClick={() => openEditUser(u)} style={styles.iconBtn} title="Chỉnh sửa"><FaEdit/></button>
                                                            <button 
                                                                onClick={() => handleToggleLock(u)} 
                                                                style={u.status === 'active' ? styles.iconBtnDanger : styles.iconBtnSuccess} 
                                                                title={u.status === 'active' ? "Khóa" : "Mở khóa"}
                                                            >
                                                                {u.status === 'active' ? <FaLock/> : <FaUnlock/>}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* TAB 2: CLINICS */}
                        {activeTab === 'clinics' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                                        <h3 style={styles.cardTitle}><FaHospital style={{marginRight:10, color:'#007bff'}}/>Quản lý Phòng khám</h3>
                                        <div style={styles.tabSwitcher}>
                                            <button 
                                                onClick={() => setClinicViewMode('pending')}
                                                style={clinicViewMode === 'pending' ? styles.subTabActive : styles.subTab}
                                            >Chờ duyệt ({clinicRequests.length})</button>
                                            <button 
                                                onClick={() => setClinicViewMode('active')}
                                                style={clinicViewMode === 'active' ? styles.subTabActive : styles.subTab}
                                            >Hoạt động ({activeClinics.length})</button>
                                        </div>
                                    </div>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>TÊN PHÒNG KHÁM</th>
                                                <th style={styles.th}>CHỦ SỞ HỮU</th>
                                                <th style={styles.th}>TRẠNG THÁI</th>
                                                <th style={styles.th}>THAO TÁC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(clinicViewMode === 'pending' ? clinicRequests : activeClinics).length === 0 ? (
                                                <tr><td colSpan={4} style={styles.emptyState}>Không có dữ liệu.</td></tr>
                                            ) : (
                                                (clinicViewMode === 'pending' ? clinicRequests : activeClinics).map(item => (
                                                    <tr key={item.id} style={styles.tr}>
                                                        <td style={styles.td}><b>{item.name}</b><br/><small>{item.address}</small></td>
                                                        <td style={styles.td}>{item.owner_name}</td>
                                                        <td style={styles.td}>
                                                            {clinicViewMode === 'pending' ? <span style={styles.badgeWarning}>Chờ duyệt</span> :
                                                                item.status === 'SUSPENDED' ? <span style={styles.badgeDanger}>Đình chỉ</span> : <span style={styles.badgeSuccess}>Hoạt động</span>
                                                            }
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{display:'flex', gap:'8px'}}>
                                                                {clinicViewMode === 'pending' ? (
                                                                    <>
                                                                        <button onClick={() => handleClinicAction(item.id, 'APPROVED')} style={styles.btnApprove}><FaCheck/> Duyệt</button>
                                                                        <button onClick={() => handleClinicAction(item.id, 'REJECTED')} style={styles.btnReject}><FaTimes/> Hủy</button>
                                                                    </>
                                                                ) : (
                                                                    item.status === 'SUSPENDED' ?
                                                                    <button onClick={() => handleClinicAction(item.id, 'ACTIVE')} style={styles.btnApprove}><FaUnlock/> Mở lại</button> :
                                                                    <button onClick={() => handleClinicAction(item.id, 'SUSPENDED')} style={styles.btnReject}><FaBan/> Đình chỉ</button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* TAB 3: FEEDBACK */}
                        {activeTab === 'feedback' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaBrain style={{marginRight:10, color:'#007bff'}}/>Dữ liệu RLHF</h3>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>BÁC SĨ</th>
                                                <th style={styles.th}>AI</th>
                                                <th style={styles.th}>BÁC SĨ CHẨN ĐOÁN</th>
                                                <th style={styles.th}>ĐÁNH GIÁ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {feedbackList.map((item, index) => (
                                                <tr key={index} style={styles.tr}>
                                                    <td style={styles.td}><b>{item.doctor_name || 'Unknown'}</b></td>
                                                    <td style={styles.td}>{item.ai_result}</td>
                                                    <td style={styles.td}><b style={{color:'#16a34a'}}>{item.doctor_diagnosis}</b></td>
                                                    <td style={styles.td}>
                                                        {item.ai_result !== item.doctor_diagnosis ? 
                                                            <span style={styles.badgeWarning}>AI Sai lệch</span> : 
                                                            <span style={styles.badgeSuccess}>Chính xác</span>
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* TAB 4: AI CONFIG (ĐÃ SỬA LỖI STYLE) */}
                        {activeTab === 'config' && (
                            <div style={{padding:'30px'}}>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaRobot style={{marginRight:10, color:'#007bff'}}/>Tham số AI & Chính sách</h3>
                                    <button onClick={handleSaveConfig} style={styles.btnPrimary}><FaSave/> Lưu cấu hình</button>
                                </div>
                                
                                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'30px', marginTop:'20px'}}>
                                    
                                    {/* CỘT 1: THAM SỐ CƠ BẢN */}
                                    <div style={{background:'#f8fafc', padding:'20px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                                        <h4 style={{marginBottom:'15px', color:'#334155'}}>⚙️ Tham số AI & Cảnh báo</h4>
                                        
                                        <label style={styles.label}>Phiên bản Model:</label>
                                        <input style={styles.input} type="text" value={aiConfig.model_version} onChange={(e)=>setAiConfig({...aiConfig, model_version: e.target.value})} />

                                        <label style={styles.label}>Ngưỡng tin cậy (Confidence Threshold): {(aiConfig.confidence_threshold * 100).toFixed(0)}%</label>
                                        <input type="range" min="0.5" max="0.99" step="0.01" style={{width:'100%'}} 
                                            value={aiConfig.confidence_threshold} 
                                            onChange={(e)=>setAiConfig({...aiConfig, confidence_threshold: parseFloat(e.target.value)})} 
                                        />
                                        <p style={{fontSize:'12px', color:'#64748b', marginTop:'5px'}}>* Nếu độ tin cậy thấp hơn mức này, AI sẽ đánh dấu là "Không chắc chắn".</p>

                                        <label style={{...styles.label, marginTop:'15px'}}>Mức cảnh báo Email:</label>
                                        <select style={styles.select} value={aiConfig.alert_risk_level} onChange={(e)=>setAiConfig({...aiConfig, alert_risk_level: e.target.value})}>
                                            <option value="MODERATE">Moderate (Trung bình)</option>
                                            <option value="SEVERE">Severe (Nghiêm trọng)</option>
                                            <option value="PDR">PDR (Rất nghiêm trọng)</option>
                                        </select>

                                        <div style={{marginTop:'15px', display:'flex', alignItems:'center', gap:'10px'}}>
                                            <input type="checkbox" checked={aiConfig.enable_email_alerts} onChange={(e)=>setAiConfig({...aiConfig, enable_email_alerts: e.target.checked})} />
                                            <span style={{fontSize:'14px', fontWeight:'600'}}>Bật gửi Email cảnh báo bác sĩ</span>
                                        </div>
                                    </div>

                                    {/* CỘT 2: HUẤN LUYỆN LẠI (Đã sửa lỗi tại đây) */}
                                    <div style={{background:'#f8fafc', padding:'20px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                                        <h4 style={{marginBottom:'15px', color:'#334155'}}>🔄 Chính sách Huấn luyện lại (Retraining)</h4>
                                        
                                        <div style={{marginBottom:'15px', display:'flex', alignItems:'center', gap:'10px'}}>
                                            <input type="checkbox" checked={aiConfig.auto_retrain} onChange={(e)=>setAiConfig({...aiConfig, auto_retrain: e.target.checked})} />
                                            <span style={{fontSize:'14px', fontWeight:'600'}}>Bật tự động huấn luyện (Auto-Retrain)</span>
                                        </div>

                                        <label style={styles.label}>Tần suất huấn luyện (Ngày):</label>
                                        <input style={styles.input} type="number" value={aiConfig.retrain_frequency_days} onChange={(e)=>setAiConfig({...aiConfig, retrain_frequency_days: parseInt(e.target.value)})} />

                                        {/* 👇 ĐÂY LÀ DÒNG ĐÃ SỬA LỖI: Gộp 2 style lại thành 1 */}
                                        <label style={{...styles.label, marginTop:'15px'}}>Dữ liệu mới tối thiểu (Samples):</label>
                                        
                                        <input style={styles.input} type="number" value={aiConfig.min_new_data_samples} onChange={(e)=>setAiConfig({...aiConfig, min_new_data_samples: parseInt(e.target.value)})} />
                                        
                                        <div style={{marginTop:'20px', padding:'10px', background:'#e0f2fe', borderRadius:'6px', fontSize:'13px', color:'#0369a1'}}>
                                            ℹ️ <b>Ghi chú:</b> Hệ thống sẽ quét dữ liệu nhãn mới từ Feedback của bác sĩ để tinh chỉnh Model theo chu kỳ trên.
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB 5: BILLING (QUẢN LÝ GÓI) */}
                        {activeTab === 'billing' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}><FaMoneyBillWave style={{marginRight:10, color:'#007bff'}}/>Danh sách Gói Dịch vụ</h3>
                                    <button onClick={() => setShowPackageModal(true)} style={styles.btnPrimary}>
                                        <FaPlus style={{marginRight:5}}/> Tạo gói mới
                                    </button>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>TÊN GÓI</th>
                                                <th style={styles.th}>GIÁ (VND)</th>
                                                <th style={styles.th}>QUYỀN LỢI</th>
                                                <th style={styles.th}>ĐỐI TƯỢNG</th>
                                                <th style={styles.th}>MÔ TẢ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {packageList.length === 0 ? (
                                                <tr><td colSpan={5} style={styles.emptyState}>Chưa có gói dịch vụ nào.</td></tr>
                                            ) : (
                                                packageList.map(pkg => (
                                                    <tr key={pkg.id} style={styles.tr}>
                                                        <td style={styles.td}>
                                                            <b style={{color:'#0f172a', fontSize:'14px'}}>{pkg.name}</b>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <span style={{fontWeight:'bold', color:'#059669'}}>{formatCurrency(pkg.price)}</span>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
                                                                <span style={{fontSize:'12px'}}>⏳ {pkg.duration_days} ngày</span>
                                                                <span style={{fontSize:'12px'}}>🧠 {pkg.analysis_limit} lượt AI</span>
                                                            </div>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <span style={{
                                                                ...styles.roleBadge, 
                                                                background: pkg.target_role === 'USER' ? '#dcfce7' : '#e0f2fe',
                                                                color: pkg.target_role === 'USER' ? '#15803d' : '#0369a1'
                                                            }}>{pkg.target_role}</span>
                                                        </td>
                                                        <td style={{...styles.td, maxWidth:'250px', color:'#64748b'}}>
                                                            {pkg.description || '--'}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                    </div>
                </div>
            </main>

            {/* MODAL SỬA USER */}
            {showUserModal && editingUser && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}>
                            <h3>Chỉnh sửa người dùng</h3>
                            <button onClick={() => setShowUserModal(false)} style={styles.closeBtn}><FaTimes/></button>
                        </div>
                        <div style={styles.modalBody}>
                            <p>Đang chỉnh sửa: <b>{editingUser.username}</b></p>
                            
                            <label style={styles.label}>Vai trò (Role):</label>
                            <select style={styles.select} value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})}>
                                <option value="user">User</option>
                                <option value="doctor">Doctor</option>
                                <option value="clinic">Clinic</option>
                                <option value="admin">Admin</option>
                            </select>

                            <label style={styles.label}>Trạng thái:</label>
                            <select style={styles.select} value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}>
                                <option value="active">Active</option>
                                <option value="suspended">Bị khóa (Suspended)</option>
                                <option value="pending">Chờ duyệt (Pending)</option>
                            </select>
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setShowUserModal(false)} style={styles.btnSecondary}>Hủy</button>
                            <button onClick={handleSaveUser} style={styles.btnPrimary}><FaSave/> Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL TẠO GÓI DỊCH VỤ */}
            {showPackageModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}>
                            <h3>💰 Tạo Gói Dịch Vụ Mới</h3>
                            <button onClick={() => setShowPackageModal(false)} style={styles.closeBtn}><FaTimes/></button>
                        </div>
                        <div style={styles.modalBody}>
                            <label style={styles.label}>Tên gói:</label>
                            <input style={styles.input} type="text" placeholder="Ví dụ: Gói Cơ Bản" 
                                value={newPackage.name} onChange={(e) => setNewPackage({...newPackage, name: e.target.value})} 
                            />

                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                                <div>
                                    <label style={styles.label}>Giá tiền (VNĐ):</label>
                                    <input style={styles.input} type="number" 
                                        value={newPackage.price} onChange={(e) => setNewPackage({...newPackage, price: Number(e.target.value)})} 
                                    />
                                </div>
                                <div>
                                    <label style={styles.label}>Đối tượng:</label>
                                    <select style={styles.select} value={newPackage.target_role} onChange={(e) => setNewPackage({...newPackage, target_role: e.target.value})}>
                                        <option value="USER">Người dùng cá nhân</option>
                                        <option value="DOCTOR">Bác sĩ</option>
                                        <option value="CLINIC">Phòng khám</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                                <div>
                                    <label style={styles.label}>Số lượt AI:</label>
                                    <input style={styles.input} type="number" 
                                        value={newPackage.analysis_limit} onChange={(e) => setNewPackage({...newPackage, analysis_limit: Number(e.target.value)})} 
                                    />
                                </div>
                                <div>
                                    <label style={styles.label}>Thời hạn (Ngày):</label>
                                    <input style={styles.input} type="number" 
                                        value={newPackage.duration_days} onChange={(e) => setNewPackage({...newPackage, duration_days: Number(e.target.value)})} 
                                    />
                                </div>
                            </div>

                            <label style={styles.label}>Mô tả ngắn:</label>
                            <input style={styles.input} type="text" placeholder="Mô tả quyền lợi..." 
                                value={newPackage.description} onChange={(e) => setNewPackage({...newPackage, description: e.target.value})} 
                            />

                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setShowPackageModal(false)} style={styles.btnSecondary}>Hủy</button>
                            <button onClick={handleCreatePackage} style={styles.btnPrimary}><FaSave/> Tạo gói</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    fullScreenContainer: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f4f6f9', fontFamily: '"Inter", sans-serif', display: 'flex', flexDirection: 'column', zIndex: 9999, overflow: 'hidden' },
    topBar: { height: '64px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', flexShrink: 0 },
    logoArea: { display:'flex', alignItems:'center', gap:'12px' },
    headerTitle: { fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 },
    headerRight: { display: 'flex', alignItems: 'center' },
    bellBadge: { position:'absolute', top:'-6px', right:'-6px', background:'#ef4444', color:'white', fontSize:'10px', width:'16px', height:'16px', borderRadius:'50%', display:'flex', justifyContent:'center', alignItems:'center' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', padding:'6px 12px', borderRadius:'6px', background:'#f8fafc', border:'1px solid #e2e8f0' },
    avatarCircle: { width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'600' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    dropdownMenu: { position: 'absolute', top: '50px', right: '0', width: '180px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #e2e8f0' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize:'14px', fontWeight:'500' },
    mainBody: { flex: 1, overflowY: 'auto', padding: '32px' },
    contentWrapper: { maxWidth: '1400px', margin: '0 auto', width: '100%' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '24px' },
    statCard: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', border: '1px solid #e2e8f0', transition: 'all 0.2s' },
    statCardActive: { backgroundColor: 'white', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', border: '2px solid #007bff', boxShadow: '0 4px 12px rgba(0, 123, 255, 0.15)', transform: 'translateY(-2px)' },
    iconBox: { width:'50px', height:'50px', borderRadius:'10px', display:'flex', alignItems:'center', justifyContent:'center' },
    statInfo: { display:'flex', flexDirection:'column' },
    statLabel: { fontSize:'14px', fontWeight:'600' },
    statCount: { fontSize:'14px', fontWeight:'400', marginTop:'2px' },
    redDot: { position:'absolute', top:'15px', right:'15px', width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444' },
    tableCard: { backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.05)', minHeight:'400px', overflow:'hidden' },
    cardHeader: { padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0, display:'flex', alignItems:'center' },
    searchContainer: { display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 12px' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '8px', fontSize: '14px', width: '200px' },
    tableContainer: { width: '100%', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '13px' },
    th: { textAlign: 'left', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px', fontWeight: '600', backgroundColor: '#f8fafc' },
    tr: { transition: 'background 0.2s' },
    td: { padding: '12px 16px', verticalAlign: 'middle', color: '#334155', borderBottom: '1px solid #f1f5f9' },
    roleBadge: { padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' },
    badgeSuccess: { backgroundColor: '#dcfce7', color: '#15803d', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' },
    badgeWarning: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' },
    badgeDanger: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' },
    btnApprove: { backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight:'5px' },
    btnReject: { backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
    iconBtn: { border:'1px solid #e2e8f0', background:'white', padding:'6px', borderRadius:'4px', cursor:'pointer', color:'#64748b' },
    iconBtnDanger: { border:'1px solid #fee2e2', background:'#fff5f5', padding:'6px', borderRadius:'4px', cursor:'pointer', color:'#ef4444' },
    iconBtnSuccess: { border:'1px solid #dcfce7', background:'#f0fdf4', padding:'6px', borderRadius:'4px', cursor:'pointer', color:'#16a34a' },
    tabSwitcher: { background:'#f1f5f9', padding:'3px', borderRadius:'6px', display:'flex', gap:'5px' },
    subTab: { border:'none', background:'transparent', padding:'6px 12px', borderRadius:'4px', fontSize:'13px', color:'#64748b', cursor:'pointer' },
    subTabActive: { border:'none', background:'white', padding:'6px 12px', borderRadius:'4px', fontSize:'13px', color:'#0f172a', cursor:'pointer', fontWeight:'600', boxShadow:'0 1px 2px rgba(0,0,0,0.05)' },
    // Form Styles
    label: { display:'block', marginBottom:'8px', fontSize:'13px', fontWeight:'600', color:'#334155', marginTop:'15px' },
    select: { width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'14px', outline:'none' },
    input: { width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #cbd5e1', fontSize:'14px', outline:'none', marginTop:'5px' },
    btnPrimary: { background:'#007bff', color:'white', border:'none', padding:'10px 20px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px' },
    btnSecondary: { background:'#e2e8f0', color:'#334155', border:'none', padding:'10px 20px', borderRadius:'6px', cursor:'pointer', fontWeight:'600' },
    // Modal
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:10000 },
    modalContent: { background:'white', borderRadius:'12px', width:'450px', overflow:'hidden' },
    modalHeader: { padding:'15px 20px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc' },
    modalBody: { padding:'20px' },
    modalFooter: { padding:'15px 20px', borderTop:'1px solid #eee', display:'flex', justifyContent:'flex-end', gap:'10px', background:'#f8fafc' },
    closeBtn: { border:'none', background:'transparent', fontSize:'16px', cursor:'pointer', color:'#64748b' },
    emptyState: { padding: '40px', textAlign: 'center', color: '#94a3b8' },
};

export default DashboardAdmin;