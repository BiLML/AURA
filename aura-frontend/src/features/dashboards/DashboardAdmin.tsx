import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaHospital, FaBrain, FaSignOutAlt, FaSearch, 
    FaCheck, FaUsers, FaUserShield, FaBell,
    FaEdit, FaLock, FaUnlock, FaBan, FaTimes, FaSave, 
    FaCogs, FaMoneyBillWave, FaPlus,
    FaChartPie, FaHistory, FaEnvelopeOpenText, FaSpinner
} from 'react-icons/fa';

import { 
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';


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
    anonymize_patient_data: boolean;
    require_training_consent: boolean;
    data_retention_days: number;
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

interface AuditLogEntry {
    id: string;
    actor: string;
    action: string;
    resource: string;
    ip: string;
    time: string;
    changes: any;
}

interface NotificationTemplate {
    code: string; 
    name: string;
    subject: string;
    content: string;
    available_variables: string;
    updated_at: string;
}

// --- CSS STYLES FOR ANIMATIONS ---
const cssStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  /* Animations Keyframes */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Utility Classes */
  .animate-fade-in { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .animate-scale-in { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  
  /* Hover Effects */
  .hover-card { transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
  .hover-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -10px rgba(0, 123, 255, 0.2); }
  
  .hover-row { transition: background-color 0.2s ease; }
  .hover-row:hover { background-color: #f1f5f9 !important; }

  .btn-hover { transition: filter 0.2s ease, transform 0.1s ease; }
  .btn-hover:hover { filter: brightness(1.1); }
  .btn-hover:active { transform: scale(0.98); }

  .nav-item { transition: all 0.2s ease; }
  
  /* Custom Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
`;

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI ---
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback' | 'config' | 'billing' | 'analytics' | 'audit' | 'communication'>('users'); 
    const [clinicViewMode, setClinicViewMode] = useState<'pending' | 'active' | 'suspended'>('pending');
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    // --- STATE DATA ---
    const [userList, setUserList] = useState<User[]>([]);
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);
    const [activeClinics, setActiveClinics] = useState<ClinicRequest[]>([]);
    const [feedbackList, setFeedbackList] = useState<any[]>([]); 
    const [suspendedClinics, setSuspendedClinics] = useState<ClinicRequest[]>([]);
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [packageList, setPackageList] = useState<ServicePackage[]>([]);
    const [showPackageModal, setShowPackageModal] = useState(false);
    
    // New Package Form State
    const [newPackage, setNewPackage] = useState({
        name: '', price: 0, analysis_limit: 10, duration_days: 30, description: '', target_role: 'USER'
    });

    const [globalStats, setGlobalStats] = useState({
        revenue: 0, totalScans: 0, recentTransactions: [], aiAccuracy: 0, validatedCount: 0, revenueChart: [] as any[]
    });

    const [aiConfig, setAiConfig] = useState<AIConfig>({
        confidence_threshold: 0.85, model_version: 'v1.0.0', alert_risk_level: 'SEVERE',
        enable_email_alerts: true, auto_retrain: false, retrain_frequency_days: 30,
        min_new_data_samples: 100, anonymize_patient_data: true, require_training_consent: false,
        data_retention_days: 90,
    });

    const [analyticsData, setAnalyticsData] = useState({
        risk_distribution: [], upload_trends: [], error_rates: []
    });

    // --- STATE MODAL ---
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editForm, setEditForm] = useState({ role: '', status: '' });

    // UI Refs
    const [showUserMenu, setShowUserMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        // (Mock logic for demonstration if API fails or to simulate flow)
        // In real app, keep your fetch logic here.
        // For this UI enhancement demo, I'll assume data fetching works as in your original code.
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
             // 1. Info Admin & Check Role
             const meRes = await fetch('http://127.0.0.1:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });

             if (meRes.ok) {
                 const meData = await meRes.json();
                 const info = meData.user_info || meData; 
                 if (info.role !== 'admin') { alert("⛔ CẢNH BÁO: Bạn không có quyền truy cập trang Quản trị!"); navigate('/'); return; }
                 setAdminName(info.username || 'Admin');
             } else {
                 localStorage.removeItem('token'); navigate('/login'); return;
             }

            // Parallel fetching for speed
            const headers = { 'Authorization': `Bearer ${token}` };
            
            // Using Promise.allSettled to prevent one failure from stopping everything
            await Promise.allSettled([
                fetch('http://127.0.0.1:8000/api/v1/admin/users', { headers }).then(r => r.json()).then(d => setUserList((d.users || d || []).filter((u:User) => u.role !== 'admin'))),
                fetch('http://127.0.0.1:8000/api/v1/clinics/admin/pending', { headers }).then(r => r.json()).then(d => setClinicRequests(d.requests || [])),
                fetch('http://127.0.0.1:8000/api/v1/clinics/', { headers }).then(r => r.json()).then(d => {
                    setActiveClinics(d.filter((c:any) => c.status === 'APPROVED'));
                    setSuspendedClinics(d.filter((c:any) => c.status === 'SUSPENDED'));
                }),
                fetch('http://127.0.0.1:8000/api/v1/admin/reports', { headers }).then(r => r.json()).then(d => setFeedbackList(d.reports || [])),
                fetch('http://127.0.0.1:8000/api/v1/admin/config', { headers }).then(r => r.json()).then(d => setAiConfig(d)),
                fetch('http://127.0.0.1:8000/api/v1/billing/packages', { headers }).then(r => r.json()).then(d => setPackageList(d)),
                fetch('http://127.0.0.1:8000/api/v1/admin/stats/analytics', { headers }).then(r => r.json()).then(d => setAnalyticsData(d)),
                fetch('http://127.0.0.1:8000/api/v1/admin/audit-logs', { headers }).then(r => r.json()).then(d => setAuditLogs(d)),
                fetch('http://127.0.0.1:8000/api/v1/admin/templates', { headers }).then(r => r.json()).then(d => setTemplates(d)),
                fetch('http://127.0.0.1:8000/api/v1/admin/stats/global', { headers }).then(r => r.json()).then(data => {
                    setGlobalStats({
                        revenue: data.total_revenue,
                        totalScans: data.total_scans,
                        recentTransactions: data.recent_transactions,
                        aiAccuracy: data.ai_performance?.accuracy || 0,
                        validatedCount: data.ai_performance?.total_validated || 0,
                        revenueChart: data.revenue_chart || [] 
                    });
                })
            ]);
            
            // Artificial delay to show smooth loading (optional)
            setTimeout(() => setIsLoading(false), 500);

        } catch (error) {
            console.error(error);
            setIsLoading(false);
        }
    }, [navigate]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- ACTION HANDLERS (Giữ nguyên logic cũ) ---
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
                    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ role: editForm.role })
                });
            }
            if (editForm.status !== editingUser.status) {
                await fetch(`http://127.0.0.1:8000/api/v1/admin/users/${editingUser.id}/status`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ status: editForm.status }) 
                });
            }
            alert("Cập nhật thành công!"); setShowUserModal(false); fetchData();
        } catch (e) { alert("Lỗi cập nhật: " + e); }
    };

    const handleToggleLock = async (user: User) => {
        const newStatus = user.status === 'active' ? 'suspended' : 'active';
        const action = user.status === 'active' ? 'KHÓA' : 'MỞ KHÓA';
        if (!window.confirm(`Bạn có chắc muốn ${action} tài khoản ${user.username}?`)) return;
        const token = localStorage.getItem('token');
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/admin/users/${user.id}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }) 
            });
            alert(`Đã ${action} thành công.`); fetchData();
        } catch (e) { alert("Lỗi kết nối."); }
    };

    const handleClinicAction = async (clinicId: string, action: 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'ACTIVE') => {
        if(!window.confirm(`Xác nhận hành động: ${action}?`)) return;
        const token = localStorage.getItem('token');
        try {
            const statusToSend = action === 'ACTIVE' ? 'APPROVED' : action;
            await fetch(`http://127.0.0.1:8000/api/v1/clinics/admin/${clinicId}/status`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: statusToSend })
            });
            alert("Thành công."); fetchData();
        } catch (e) { alert("Lỗi server."); }
    };

    const handleSaveConfig = async () => {
        if(!window.confirm("Lưu các thay đổi cấu hình hệ thống?")) return;
        const token = localStorage.getItem('token');
        try {
            await fetch('http://127.0.0.1:8000/api/v1/admin/config', {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(aiConfig)
            });
            alert("Cập nhật cấu hình thành công!"); fetchData();
        } catch (e) { alert("Lỗi kết nối."); }
    };

    const handleCreatePackage = async () => {
        if (!newPackage.name || newPackage.price < 0) { alert("Vui lòng nhập tên gói và giá hợp lệ!"); return; }
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('http://127.0.0.1:8000/api/v1/billing/packages', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(newPackage)
            });
            if (res.ok) {
                alert("✅ Tạo gói dịch vụ thành công!"); setShowPackageModal(false);
                setNewPackage({ name: '', price: 0, analysis_limit: 10, duration_days: 30, description: '', target_role: 'USER' });
                fetchData();
            } else { alert("Lỗi tạo gói"); }
        } catch (e) { alert("Lỗi kết nối!"); }
    };

    const handleSaveTemplate = async () => {
        if (!selectedTemplate) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/admin/templates/${selectedTemplate.code}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ subject: selectedTemplate.subject, content: selectedTemplate.content })
            });
            if (res.ok) { alert("Đã lưu mẫu thông báo!"); fetchData(); } 
            else { alert("Lỗi khi lưu."); }
        } catch (e) { alert("Lỗi kết nối."); }
    };
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    // --- RENDER ---
    if (isLoading) return (
        <>
            <style>{cssStyles}</style>
            <div style={styles.loadingContainer}>
                <div style={{animation: 'spin 1s linear infinite', color: '#007bff'}}>
                    <FaSpinner size={40} />
                </div>
                <p style={{marginTop: 15, fontWeight: 500}}>Đang tải dữ liệu Admin...</p>
            </div>
        </>
    );

    return (
        <div style={styles.fullScreenContainer}>
            <style>{cssStyles}</style>
            
            {/* HEADER */}
            <header style={styles.topBar}>
                <div style={styles.logoArea}>
                    <div style={{background: 'linear-gradient(135deg, #007bff, #00d4ff)', padding: 8, borderRadius: 8, display:'flex', boxShadow: '0 4px 6px -1px rgba(0, 123, 255, 0.2)'}}>
                        <FaUserShield size={20} color="white"/>
                    </div>
                    <h1 style={styles.headerTitle}>AURA <span style={{fontWeight:'300', opacity: 0.8}}>ADMIN</span></h1>
                </div>
                <div style={styles.headerRight}>
                    <div style={{position:'relative', marginRight:'25px', cursor: 'pointer'}}>
                        <FaBell size={20} color="#64748b" style={{transition: 'color 0.2s'}} />
                        {clinicRequests.length > 0 && 
                            <span style={styles.bellBadge} className="animate-scale-in">{clinicRequests.length}</span>
                        }
                    </div>
                    <div style={{position:'relative'}} ref={profileRef}>
                        <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)} className="hover-card">
                            <div style={styles.avatarCircle}>{adminName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{adminName}</span>
                        </div>
                        {showUserMenu && (
                            <div style={styles.dropdownMenu} className="animate-scale-in">
                                <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout} className="hover-row">
                                    <FaSignOutAlt style={{marginRight:8}}/> Đăng xuất
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main style={styles.mainBody}>
                <div style={styles.contentWrapper} className="animate-fade-in">

                    {/* REVENUE CHART */}
                    <div style={{...styles.chartCard, marginBottom: '24px'}} className="hover-card">
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                            <div>
                                <h3 style={{fontSize:'18px', fontWeight:'700', color:'#0f172a', margin:0, display:'flex', alignItems:'center'}}>
                                    <FaChartPie style={{marginRight:10, color:'#007bff'}}/> 
                                    Xu hướng Doanh thu
                                </h3>
                                <p style={{fontSize:'13px', color:'#64748b', margin:'4px 0 0 0'}}>
                                    Thống kê doanh thu trong 7 ngày gần nhất
                                </p>
                            </div>
                            <div style={{textAlign:'right'}}>
                                <span style={{fontSize:'12px', color:'#64748b', fontWeight:'600', display:'block', textTransform:'uppercase', letterSpacing:'0.5px'}}>Tổng Doanh Thu</span>
                                <span style={{fontSize:'26px', fontWeight:'800', color:'#15803d', letterSpacing:'-0.5px'}}>
                                    {formatCurrency(globalStats.revenue)}
                                </span>
                            </div>
                        </div>

                        <div style={{width: '100%', height: '300px'}}>
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={globalStats.revenueChart} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#007bff" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#007bff" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(value) => new Intl.NumberFormat('vi-VN', { notation: "compact" }).format(value)} />
                                    <RechartsTooltip 
                                        contentStyle={{borderRadius:'12px', border:'none', boxShadow:'0 10px 25px -5px rgba(0,0,0,0.1)'}}
                                        formatter={(value: any) => [formatCurrency(Number(value)), "Doanh thu"]}
                                    />
                                    <Area type="monotone" dataKey="value" stroke="#007bff" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* STATS / TABS NAVIGATION */}
                    <div style={styles.statsGrid}>
                        {[
                            { id: 'users', icon: <FaUsers size={22}/>, label: 'Người dùng', count: `${userList.length} Active` },
                            { id: 'clinics', icon: <FaHospital size={22}/>, label: 'Phòng khám', count: `${activeClinics.length} Active`, alert: clinicRequests.length > 0 },
                            { id: 'feedback', icon: <FaBrain size={22}/>, label: 'RLHF Data', count: `${feedbackList.length} Reports` },
                            { id: 'billing', icon: <FaMoneyBillWave size={22}/>, label: 'Gói Dịch vụ', count: `${packageList.length} Gói` },
                            { id: 'config', icon: <FaCogs size={22}/>, label: 'Cấu hình AI', count: aiConfig.model_version },
                            { id: 'analytics', icon: <FaChartPie size={22}/>, label: 'Phân tích', count: 'Chi tiết' },
                            { id: 'audit', icon: <FaHistory size={22}/>, label: 'Nhật ký', count: 'Giám sát' },
                            { id: 'communication', icon: <FaEnvelopeOpenText size={22}/>, label: 'Thông báo', count: `${templates.length} Mẫu` },
                        ].map((tab) => (
                            <div 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)} 
                                style={activeTab === tab.id ? styles.statCardActive : styles.statCard}
                                className="hover-card nav-item"
                            >
                                <div style={{
                                    ...styles.iconBox, 
                                    background: activeTab === tab.id ? 'linear-gradient(135deg, #007bff, #0056b3)' : '#f1f5f9', 
                                    color: activeTab === tab.id ? 'white' : '#64748b',
                                    transition: 'all 0.3s ease'
                                }}>
                                    {tab.icon}
                                </div>
                                <div style={styles.statInfo}>
                                    <span style={styles.statLabel}>{tab.label}</span>
                                    <span style={styles.statCount}>{tab.count}</span>
                                </div>
                                {tab.alert && <span style={styles.redDot} className="animate-scale-in"></span>}
                            </div>
                        ))}
                    </div>

                    {/* CONTENT TABLE AREA */}
                    <div style={styles.tableCard} className="animate-fade-in">
                        
                        {/* TAB CONTENT HANDLER */}
                        {activeTab === 'users' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}>Quản lý Người dùng</h3>
                                    <div style={styles.searchContainer}>
                                        <FaSearch color="#94a3b8"/>
                                        <input placeholder="Tìm kiếm người dùng..." style={styles.searchInput}/>
                                    </div>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>USER</th>
                                                <th style={styles.th}>THÔNG TIN</th>
                                                <th style={styles.th}>VAI TRÒ</th>
                                                <th style={styles.th}>TRẠNG THÁI</th>
                                                <th style={{...styles.th, textAlign:'center'}}>THAO TÁC</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userList.map((u, i) => (
                                                <tr key={u.id} style={{animationDelay: `${i * 0.05}s`}} className="hover-row animate-fade-in">
                                                    <td style={styles.td}>
                                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                            <div style={{...styles.avatarCircle, background: '#e2e8f0', color:'#475569'}}>{u.username.charAt(0).toUpperCase()}</div>
                                                            <div><b>{u.username}</b><br/><small style={{color:'#64748b'}}>{u.email}</small></div>
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>{u.profile?.full_name || '--'}</td>
                                                    <td style={styles.td}>
                                                        <span style={{
                                                            ...styles.roleBadge, 
                                                            background: u.role==='doctor' ? '#e0f2fe': u.role==='clinic' ? '#f3e8ff' : '#dcfce7',
                                                            color: u.role==='doctor' ? '#0369a1': u.role==='clinic' ? '#7e22ce' : '#15803d'
                                                        }}>{u.role}</span>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{display:'flex', alignItems:'center', gap:5}}>
                                                            <div style={{width:8, height:8, borderRadius:'50%', background: u.status === 'active' ? '#22c55e' : '#ef4444'}}></div>
                                                            <span style={{fontSize:'13px'}}>{u.status}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{...styles.td, textAlign:'center'}}>
                                                        <div style={{display:'flex', justifyContent:'center', gap:'8px'}}>
                                                            <button onClick={() => openEditUser(u)} className="btn-hover" style={styles.iconBtn} title="Chỉnh sửa"><FaEdit/></button>
                                                            <button 
                                                                onClick={() => handleToggleLock(u)} 
                                                                className="btn-hover"
                                                                style={u.status === 'active' ? styles.iconBtnDanger : styles.iconBtnSuccess} 
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

                        {activeTab === 'clinics' && (
                            <>
                                <div style={styles.cardHeader}>
                                    <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                                        <h3 style={styles.cardTitle}>Quản lý Phòng khám</h3>
                                        <div style={styles.tabSwitcher}>
                                            <button onClick={() => setClinicViewMode('pending')} style={clinicViewMode === 'pending' ? styles.subTabActive : styles.subTab}>
                                                Chờ duyệt {clinicRequests.length > 0 && `(${clinicRequests.length})`}
                                            </button>
                                            <button onClick={() => setClinicViewMode('active')} style={clinicViewMode === 'active' ? styles.subTabActive : styles.subTab}>
                                                Hoạt động
                                            </button>
                                            <button onClick={() => setClinicViewMode('suspended')} style={clinicViewMode === 'suspended' ? styles.subTabActive : styles.subTab}>
                                                Đình chỉ
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>PHÒNG KHÁM</th>
                                                <th style={styles.th}>CHỦ SỞ HỮU</th>
                                                <th style={styles.th}>TRẠNG THÁI</th>
                                                <th style={styles.th}>HÀNH ĐỘNG</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                let currentList = clinicViewMode === 'pending' ? clinicRequests : clinicViewMode === 'active' ? activeClinics : suspendedClinics;
                                                if (currentList.length === 0) return <tr><td colSpan={4} style={styles.emptyState}>Không có dữ liệu.</td></tr>;

                                                return currentList.map((item, i) => (
                                                    <tr key={item.id} style={{animationDelay: `${i * 0.05}s`}} className="hover-row animate-fade-in">
                                                        <td style={styles.td}><b>{item.name}</b><br/><small style={{color:'#64748b'}}>{item.address}</small></td>
                                                        <td style={styles.td}>{item.owner_name}</td>
                                                        <td style={styles.td}>
                                                            <span style={clinicViewMode === 'pending' ? styles.badgeWarning : clinicViewMode === 'suspended' ? styles.badgeDanger : styles.badgeSuccess}>
                                                                {clinicViewMode === 'pending' ? 'Chờ duyệt' : clinicViewMode === 'suspended' ? 'Đình chỉ' : 'Active'}
                                                            </span>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{display:'flex', gap:'8px'}}>
                                                                {clinicViewMode === 'pending' && (
                                                                    <>
                                                                        <button onClick={() => handleClinicAction(item.id, 'APPROVED')} className="btn-hover" style={styles.btnApprove}><FaCheck/> Duyệt</button>
                                                                        <button onClick={() => handleClinicAction(item.id, 'REJECTED')} className="btn-hover" style={styles.btnReject}><FaTimes/> Hủy</button>
                                                                    </>
                                                                )}
                                                                {clinicViewMode === 'active' && <button onClick={() => handleClinicAction(item.id, 'SUSPENDED')} className="btn-hover" style={styles.btnReject}><FaBan/> Đình chỉ</button>}
                                                                {clinicViewMode === 'suspended' && <button onClick={() => handleClinicAction(item.id, 'ACTIVE')} className="btn-hover" style={styles.btnApprove}><FaUnlock/> Mở lại</button>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {activeTab === 'config' && (
                            <div style={{padding:'30px'}} className="animate-fade-in">
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}>Cấu hình Hệ thống & Bảo mật</h3>
                                    <button onClick={handleSaveConfig} className="btn-hover" style={styles.btnPrimary}><FaSave/> Lưu thay đổi</button>
                                </div>
                                <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'20px', marginTop:'20px'}}>
                                    
                                    <div style={styles.configBox} className="hover-card">
                                        <h4 style={styles.configTitle}>🤖 Tham số AI</h4>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Phiên bản Model</label>
                                            <input style={styles.input} type="text" value={aiConfig.model_version} onChange={(e)=>setAiConfig({...aiConfig, model_version: e.target.value})} />
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Ngưỡng tin cậy: <span style={{color:'#007bff'}}>{(aiConfig.confidence_threshold * 100).toFixed(0)}%</span></label>
                                            <input type="range" min="0.5" max="0.99" step="0.01" style={{width:'100%', accentColor: '#007bff'}} 
                                                value={aiConfig.confidence_threshold} 
                                                onChange={(e)=>setAiConfig({...aiConfig, confidence_threshold: parseFloat(e.target.value)})} 
                                            />
                                        </div>
                                    </div>

                                    <div style={styles.configBox} className="hover-card">
                                        <h4 style={styles.configTitle}>🔄 Auto-Training</h4>
                                        <div style={{marginBottom:'15px', display:'flex', gap:'10px', alignItems:'center'}}>
                                            <input type="checkbox" id="auto_retrain" style={{width: 16, height: 16}} checked={aiConfig.auto_retrain} onChange={(e)=>setAiConfig({...aiConfig, auto_retrain: e.target.checked})} />
                                            <label htmlFor="auto_retrain" style={{margin:0, fontSize:'14px', fontWeight:'600'}}>Bật tự động huấn luyện</label>
                                        </div>
                                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10}}>
                                            <div style={styles.formGroup}>
                                                <label style={styles.label}>Chu kỳ (Ngày)</label>
                                                <input style={styles.input} type="number" value={aiConfig.retrain_frequency_days} onChange={(e)=>setAiConfig({...aiConfig, retrain_frequency_days: parseInt(e.target.value)})} />
                                            </div>
                                            <div style={styles.formGroup}>
                                                <label style={styles.label}>Min Samples</label>
                                                <input style={styles.input} type="number" value={aiConfig.min_new_data_samples} onChange={(e)=>setAiConfig({...aiConfig, min_new_data_samples: parseInt(e.target.value)})} />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{...styles.configBox, background:'#fff7ed', borderColor:'#fed7aa'}} className="hover-card">
                                        <h4 style={{...styles.configTitle, color:'#c2410c'}}>🛡️ Quyền riêng tư</h4>
                                        <div style={{marginBottom: 10}}>
                                            <label style={{display:'flex', gap: 10, cursor:'pointer'}}>
                                                <input type="checkbox" checked={aiConfig.anonymize_patient_data} onChange={(e)=>setAiConfig({...aiConfig, anonymize_patient_data: e.target.checked})} />
                                                <span style={{fontSize:'13px'}}>Ẩn danh dữ liệu (Anonymize)</span>
                                            </label>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Lưu nhật ký trong (Ngày)</label>
                                            <input style={styles.input} type="number" value={aiConfig.data_retention_days} onChange={(e)=>setAiConfig({...aiConfig, data_retention_days: parseInt(e.target.value)})} />
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}

                        {activeTab === 'analytics' && (
                            <div style={{padding: '30px'}} className="animate-fade-in">
                                <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'30px', marginBottom: 30}}>
                                    <div style={styles.chartCard} className="hover-card">
                                        <h3 style={styles.chartTitle}>📈 Xu hướng Tải lên (7 ngày)</h3>
                                        <div style={{height:'300px', width:'100%'}}>
                                            <ResponsiveContainer>
                                                <AreaChart data={analyticsData.upload_trends}>
                                                    <defs>
                                                        <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                                    <XAxis dataKey="date" style={{fontSize:'12px'}} axisLine={false} tickLine={false} />
                                                    <YAxis style={{fontSize:'12px'}} axisLine={false} tickLine={false} />
                                                    <RechartsTooltip contentStyle={{borderRadius: 8, border:'none', boxShadow:'0 5px 15px rgba(0,0,0,0.1)'}}/>
                                                    <Area type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={3} fill="url(#colorUploads)" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div style={styles.chartCard} className="hover-card">
                                        <h3 style={styles.chartTitle}>🎯 Tỷ lệ Lỗi (RLHF)</h3>
                                        <div style={{height:'300px', width:'100%'}}>
                                            <ResponsiveContainer>
                                                <PieChart>
                                                    <Pie data={analyticsData.error_rates} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                        {analyticsData.error_rates.map((entry:any, index:number) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                                    </Pie>
                                                    <RechartsTooltip />
                                                    <Legend verticalAlign="bottom" />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Other tabs follow similar pattern... (Feedback, Billing, Audit) */}
                        {(activeTab === 'feedback' || activeTab === 'audit' || activeTab === 'billing') && (
                            <div className="animate-fade-in">
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.cardTitle}>
                                        {activeTab === 'feedback' ? 'Dữ liệu RLHF' : activeTab === 'audit' ? 'Nhật ký Hoạt động' : 'Danh sách Gói Dịch vụ'}
                                    </h3>
                                    {activeTab === 'billing' && (
                                        <button onClick={() => setShowPackageModal(true)} className="btn-hover" style={styles.btnPrimary}>
                                            <FaPlus style={{marginRight:5}}/> Tạo gói mới
                                        </button>
                                    )}
                                </div>
                                <div style={styles.tableContainer}>
                                    <table style={styles.table}>
                                        <thead>
                                            {activeTab === 'feedback' && <tr><th>BÁC SĨ</th><th>AI RESULT</th><th>CHẨN ĐOÁN</th><th>ĐÁNH GIÁ</th></tr>}
                                            {activeTab === 'billing' && <tr><th>TÊN GÓI</th><th>GIÁ</th><th>QUYỀN LỢI</th><th>ĐỐI TƯỢNG</th><th>MÔ TẢ</th></tr>}
                                            {activeTab === 'audit' && <tr><th>THỜI GIAN</th><th>NGƯỜI THỰC HIỆN</th><th>HÀNH ĐỘNG</th><th>ĐỐI TƯỢNG</th><th>CHI TIẾT</th><th>IP</th></tr>}
                                        </thead>
                                        <tbody>
                                            {activeTab === 'billing' && packageList.map((pkg, i) => (
                                                <tr key={pkg.id} className="hover-row animate-fade-in" style={{animationDelay: `${i*0.05}s`}}>
                                                    <td style={styles.td}><b>{pkg.name}</b></td>
                                                    <td style={{...styles.td, color:'#059669', fontWeight:'bold'}}>{formatCurrency(pkg.price)}</td>
                                                    <td style={styles.td}><small>⏳ {pkg.duration_days} ngày • 🧠 {pkg.analysis_limit} lượt</small></td>
                                                    <td style={styles.td}><span style={styles.roleBadge}>{pkg.target_role}</span></td>
                                                    <td style={{...styles.td, color:'#64748b'}}>{pkg.description}</td>
                                                </tr>
                                            ))}
                                            {/* (Logic cho feedback/audit tương tự - giữ code logic cũ, thêm className="hover-row") */}
                                            {activeTab === 'audit' && auditLogs.map((log, i) => (
                                                <tr key={log.id} className="hover-row animate-fade-in" style={{animationDelay: `${i*0.05}s`}}>
                                                    <td style={styles.td}>{new Date(log.time).toLocaleString('vi-VN')}</td>
                                                    <td style={styles.td}><b>{log.actor}</b></td>
                                                    <td style={styles.td}><span style={styles.roleBadge}>{log.action}</span></td>
                                                    <td style={styles.td}>{log.resource}</td>
                                                    <td style={{...styles.td, fontSize:'11px', fontFamily:'monospace'}}>{JSON.stringify(log.changes).substring(0,50)}...</td>
                                                    <td style={styles.td}>{log.ip}</td>
                                                </tr>
                                            ))}
                                            {activeTab === 'feedback' && feedbackList.map((item, i) => (
                                                 <tr key={i} className="hover-row animate-fade-in" style={{animationDelay: `${i*0.05}s`}}>
                                                    <td style={styles.td}><b>{item.doctor_name}</b></td>
                                                    <td style={styles.td}>{item.ai_result}</td>
                                                    <td style={styles.td}>{item.doctor_diagnosis}</td>
                                                    <td style={styles.td}>{item.ai_result !== item.doctor_diagnosis ? '⚠️ Sai lệch' : '✅ Chính xác'}</td>
                                                 </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'communication' && (
                             <div style={{display:'flex', height:'600px'}} className="animate-fade-in">
                                <div style={{width:'300px', borderRight:'1px solid #e2e8f0', overflowY:'auto', background:'#f8fafc'}}>
                                    {templates.map(tpl => (
                                        <div key={tpl.code} onClick={() => setSelectedTemplate(tpl)}
                                            style={{
                                                padding:'15px', cursor:'pointer', borderBottom:'1px solid #eee',
                                                background: selectedTemplate?.code === tpl.code ? 'white' : 'transparent',
                                                borderLeft: selectedTemplate?.code === tpl.code ? '4px solid #007bff' : '4px solid transparent',
                                                transition: 'all 0.2s'
                                            }} className="hover-row"
                                        >
                                            <div style={{fontWeight:'600', color:'#334155'}}>{tpl.name}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{flex:1, padding:'25px'}}>
                                    {selectedTemplate ? (
                                        <div className="animate-fade-in">
                                            <div style={{display:'flex', justifyContent:'space-between', marginBottom: 20}}>
                                                <h3 style={{margin:0}}>{selectedTemplate.name}</h3>
                                                <button onClick={handleSaveTemplate} className="btn-hover" style={styles.btnPrimary}><FaSave/> Lưu</button>
                                            </div>
                                            <div style={styles.formGroup}>
                                                <label style={styles.label}>Subject</label>
                                                <input style={styles.input} value={selectedTemplate.subject} onChange={(e)=>setSelectedTemplate({...selectedTemplate, subject: e.target.value})} />
                                            </div>
                                            <div style={styles.formGroup}>
                                                <label style={styles.label}>Content (HTML)</label>
                                                <textarea style={{...styles.input, height:'300px', fontFamily:'monospace'}} value={selectedTemplate.content} onChange={(e)=>setSelectedTemplate({...selectedTemplate, content: e.target.value})} />
                                            </div>
                                        </div>
                                    ) : <div style={styles.emptyState}>Chọn mẫu để chỉnh sửa</div>}
                                </div>
                             </div>
                        )}

                        <div style={{marginTop: '20px', padding: 20, borderTop: '1px solid #f1f5f9'}} className="animate-fade-in">
                            <h3 style={{fontSize: 16, marginBottom: 15}}>Giao dịch gần đây</h3>
                            <table style={styles.table}>
                                <tbody>
                                    {globalStats.recentTransactions.map((tx: any, i) => (
                                        <tr key={i} className="hover-row">
                                            <td style={styles.td}>{tx.user}</td>
                                            <td style={{...styles.td, color:'#15803d', fontWeight:'bold'}}>+{formatCurrency(tx.amount)}</td>
                                            <td style={styles.td}>{new Date(tx.date).toLocaleDateString('vi-VN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                </div>
            </main>

            {/* MODALS WITH ANIMATIONS */}
            {showUserModal && editingUser && (
                <div style={styles.modalOverlay} className="animate-fade-in">
                    <div style={styles.modalContent} className="animate-scale-in">
                        <div style={styles.modalHeader}>
                            <h3>Chỉnh sửa người dùng</h3>
                            <button onClick={() => setShowUserModal(false)} style={styles.closeBtn}><FaTimes/></button>
                        </div>
                        <div style={styles.modalBody}>
                            <p style={{marginBottom:15}}>User: <b>{editingUser.username}</b></p>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Vai trò</label>
                                <select style={styles.select} value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})}>
                                    {['user', 'doctor', 'clinic', 'admin'].map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Trạng thái</label>
                                <select style={styles.select} value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}>
                                    {['active', 'suspended', 'pending'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setShowUserModal(false)} style={styles.btnSecondary} className="btn-hover">Hủy</button>
                            <button onClick={handleSaveUser} style={styles.btnPrimary} className="btn-hover"><FaSave/> Lưu</button>
                        </div>
                    </div>
                </div>
            )}

            {showPackageModal && (
                <div style={styles.modalOverlay} className="animate-fade-in">
                    <div style={styles.modalContent} className="animate-scale-in">
                        <div style={styles.modalHeader}>
                            <h3>💰 Tạo Gói Dịch Vụ</h3>
                            <button onClick={() => setShowPackageModal(false)} style={styles.closeBtn}><FaTimes/></button>
                        </div>
                        <div style={styles.modalBody}>
                            {/* Tên gói */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Tên gói</label>
                                <input style={styles.input} type="text" value={newPackage.name} onChange={(e) => setNewPackage({...newPackage, name: e.target.value})} />
                            </div>

                            {/* Hàng 1: Giá & Đối tượng */}
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Giá (VNĐ)</label>
                                    <input style={styles.input} type="number" value={newPackage.price} onChange={(e) => setNewPackage({...newPackage, price: Number(e.target.value)})} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Đối tượng</label>
                                    <select style={styles.select} value={newPackage.target_role} onChange={(e) => setNewPackage({...newPackage, target_role: e.target.value})}>
                                        <option value="USER">User</option>
                                        <option value="DOCTOR">Doctor</option>
                                        <option value="CLINIC">Clinic</option>
                                    </select>
                                </div>
                            </div>

                            {/* Hàng 2: Số lượt AI & Thời hạn (ĐÃ THÊM LẠI) */}
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Số lượt AI</label>
                                    <input style={styles.input} type="number" value={newPackage.analysis_limit} onChange={(e) => setNewPackage({...newPackage, analysis_limit: Number(e.target.value)})} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Thời hạn (Ngày)</label>
                                    <input style={styles.input} type="number" value={newPackage.duration_days} onChange={(e) => setNewPackage({...newPackage, duration_days: Number(e.target.value)})} />
                                </div>
                            </div>

                            {/* Mô tả */}
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Mô tả</label>
                                <input style={styles.input} type="text" value={newPackage.description} onChange={(e) => setNewPackage({...newPackage, description: e.target.value})} />
                            </div>
                        </div>
                        <div style={styles.modalFooter}>
                            <button onClick={() => setShowPackageModal(false)} style={styles.btnSecondary} className="btn-hover">Hủy</button>
                            <button onClick={handleCreatePackage} style={styles.btnPrimary} className="btn-hover"><FaSave/> Tạo gói</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- ENHANCED STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loadingContainer: { display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', height:'100vh', background: '#f8fafc', color:'#64748b' },
    fullScreenContainer: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f4f6f9', fontFamily: '"Inter", sans-serif', display: 'flex', flexDirection: 'column', zIndex: 9999, overflow: 'hidden' },
    topBar: { height: '64px', backgroundColor: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', flexShrink: 0, zIndex: 50 },
    logoArea: { display:'flex', alignItems:'center', gap:'12px' },
    headerTitle: { fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.5px' },
    headerRight: { display: 'flex', alignItems: 'center' },
    bellBadge: { position:'absolute', top:'-6px', right:'-6px', background:'#ef4444', color:'white', fontSize:'10px', width:'18px', height:'18px', borderRadius:'50%', display:'flex', justifyContent:'center', alignItems:'center', fontWeight: 'bold', border: '2px solid white' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', padding:'6px 12px', borderRadius:'30px', background:'white', border:'1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.03)' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', fontWeight:'600' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    dropdownMenu: { position: 'absolute', top: '55px', right: '0', width: '200px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #e2e8f0', overflow: 'hidden', padding: '5px' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '10px 15px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize:'14px', fontWeight:'500', borderRadius: '8px' },
    mainBody: { flex: 1, overflowY: 'auto', padding: '32px' },
    contentWrapper: { maxWidth: '1400px', margin: '0 auto', width: '100%' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' },
    statCard: { backgroundColor: 'white', borderRadius: '16px', padding: '20px', display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position:'relative' },
    statCardActive: { backgroundColor: 'white', borderRadius: '16px', padding: '20px', display: 'flex', alignItems: 'center', gap:'16px', cursor: 'pointer', border: '2px solid #007bff', boxShadow: '0 8px 16px rgba(0, 123, 255, 0.15)', transform: 'translateY(-2px)', position:'relative' },
    iconBox: { width:'50px', height:'50px', borderRadius:'14px', display:'flex', alignItems:'center', justifyContent:'center', fontSize: '20px', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' },
    statInfo: { display:'flex', flexDirection:'column' },
    statLabel: { fontSize:'14px', fontWeight:'600', color: '#64748b' },
    statCount: { fontSize:'15px', fontWeight:'700', marginTop:'2px', color: '#1e293b' },
    redDot: { position:'absolute', top:'15px', right:'15px', width:'10px', height:'10px', borderRadius:'50%', background:'#ef4444', border: '2px solid white', boxShadow: '0 0 0 2px #fee2e2' },
    tableCard: { backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', minHeight:'400px', overflow:'hidden' },
    cardHeader: { padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' },
    cardTitle: { fontSize: '18px', fontWeight: '700', color: '#0f172a', margin: 0, display:'flex', alignItems:'center', gap: 10 },
    searchContainer: { display: 'flex', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 16px', transition: 'border 0.2s' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', fontSize: '14px', width: '220px', color: '#334155' },
    tableContainer: { width: '100%', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#f8fafc' },
    td: { padding: '16px 20px', verticalAlign: 'middle', color: '#334155', borderBottom: '1px solid #f1f5f9' },
    roleBadge: { padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' },
    badgeSuccess: { backgroundColor: '#dcfce7', color: '#15803d', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' },
    badgeWarning: { backgroundColor: '#fff7ed', color: '#c2410c', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' },
    badgeDanger: { backgroundColor: '#fee2e2', color: '#b91c1c', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' },
    btnApprove: { backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', marginRight:'8px', display:'inline-flex', alignItems:'center', gap:5 },
    btnReject: { backgroundColor: '#ef4444', color: 'white', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display:'inline-flex', alignItems:'center', gap:5 },
    iconBtn: { border:'1px solid #e2e8f0', background:'white', padding:'8px', borderRadius:'8px', cursor:'pointer', color:'#64748b', display:'flex', alignItems:'center' },
    iconBtnDanger: { border:'1px solid #fee2e2', background:'#fff5f5', padding:'8px', borderRadius:'8px', cursor:'pointer', color:'#ef4444' },
    iconBtnSuccess: { border:'1px solid #dcfce7', background:'#f0fdf4', padding:'8px', borderRadius:'8px', cursor:'pointer', color:'#16a34a' },
    tabSwitcher: { background:'#f1f5f9', padding:'4px', borderRadius:'8px', display:'flex', gap:'4px' },
    subTab: { border:'none', background:'transparent', padding:'6px 14px', borderRadius:'6px', fontSize:'13px', color:'#64748b', cursor:'pointer', fontWeight: 500 },
    subTabActive: { border:'none', background:'white', padding:'6px 14px', borderRadius:'6px', fontSize:'13px', color:'#0f172a', cursor:'pointer', fontWeight:'700', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' },
    formGroup: { marginBottom: '16px' },
    label: { display:'block', marginBottom:'6px', fontSize:'13px', fontWeight:'600', color:'#475569' },
    select: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', outline:'none', backgroundColor: 'white', transition: 'border 0.2s' },
    input: { width:'100%', padding:'10px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', outline:'none', marginTop:'0', transition: 'border 0.2s' },
    btnPrimary: { background:'linear-gradient(135deg, #007bff, #0062cc)', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'600', display:'flex', alignItems:'center', gap:'8px', boxShadow: '0 4px 6px -1px rgba(0, 123, 255, 0.3)' },
    btnSecondary: { background:'#f1f5f9', color:'#475569', border:'none', padding:'10px 20px', borderRadius:'8px', cursor:'pointer', fontWeight:'600' },
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:10000 },
    modalContent: { background:'white', borderRadius:'16px', width:'500px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden' },
    modalHeader: { padding:'20px 24px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff' },
    modalBody: { padding:'24px' },
    modalFooter: { padding:'20px 24px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'flex-end', gap:'12px', background:'#f8fafc' },
    closeBtn: { border:'none', background:'transparent', fontSize:'18px', cursor:'pointer', color:'#94a3b8', transition: 'color 0.2s' },
    emptyState: { padding: '60px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' },
    chartCard: { background: 'white', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' },
    chartTitle: { margin: '0 0 24px 0', fontSize: '16px', color: '#1e293b', fontWeight: '700' },
    configBox: { background:'white', padding:'24px', borderRadius:'12px', border:'1px solid #e2e8f0', height: '100%' },
    configTitle: { marginBottom:'20px', color:'#0f172a', borderBottom:'1px solid #f1f5f9', paddingBottom:'12px', fontSize: '15px', fontWeight: '700' }
};

export default DashboardAdmin;