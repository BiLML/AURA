import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaSignOutAlt, FaUserMd, FaRobot, FaSpinner,
    FaBoxOpen, FaChartLine, FaExclamationTriangle,
    FaClipboardList, FaUserCircle, FaUserPlus, FaStethoscope,
    FaHistory, FaCamera, FaTimes, FaCheck, FaCreditCard,
    FaCog, FaToggleOn, FaToggleOff, FaUserShield, FaBell,
    FaFileExport, FaFileCsv, FaSearch
} from 'react-icons/fa';

import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from 'recharts';

// --- INTERFACES ---
interface Patient {
    id: string;
    username: string;
    full_name: string;
    phone: string;
    email?: string;
    latest_scan?: {
        ai_result: string;
        ai_analysis_status: string;
        upload_date: string;
    } | null;
    assigned_doctor?: string;
    assigned_doctor_id?: string;
}

interface Doctor {
    id: string;
    username: string;
    full_name: string;
    email: string;
    phone: string;
    patient_count: number;
    status: string;
}

interface ServicePackage {
    id: string;
    name: string;
    price: number;
    analysis_limit: number;
    duration_days: number;
    description: string;
    target_role: string;
}

interface UserSubscription {
    active: boolean;
    credits: number;
    plan_name: string;
    expiry: string | null;
}

interface Transaction {
    id: string;
    package_name: string;
    amount: number;
    status: string;
    created_at: string;
}

const ClinicDashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI ---
    const [activeMenu, setActiveMenu] = useState('accounts');
    const [showUserMenu, setShowUserMenu] = useState(false);
    
    // --- STATE DATA ---
    const [clinicName, setClinicName] = useState('Phòng khám AURA');
    const [adminName, setAdminName] = useState('Clinic Admin'); 
    const [patients, setPatients] = useState<Patient[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);

    // --- STATE MOCK SERVICES (Billing) ---
    const [packages, setPackages] = useState<ServicePackage[]>([]);
    const [mySub, setMySub] = useState<UserSubscription>({ active: false, credits: 0, plan_name: 'Free', expiry: null });
    const [isBuying, setIsBuying] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // --- STATE AI ANALYSIS & UPLOAD ---
    const [aiSubTab, setAiSubTab] = useState<'clinic' | 'patient'>('clinic');
    const [clinicHistory, setClinicHistory] = useState<any[]>([]);
    const [patientHistory, setPatientHistory] = useState<any[]>([]);
    
    // --- STATE MODALS QUẢN LÝ ---
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [targetDoctorId, setTargetDoctorId] = useState('');

    const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
    const [searchDocTerm, setSearchDocTerm] = useState('');
    const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);
    
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [searchPatientTerm, setSearchPatientTerm] = useState('');
    const [availablePatients, setAvailablePatients] = useState<any[]>([]);

    // --- STATE PRIVACY ---
    const [privacyConsent, setPrivacyConsent] = useState(false);

    // Refs
    const userMenuRef = useRef<HTMLDivElement>(null);

    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const notificationRef = useRef<HTMLDivElement>(null);

    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [reportData, setReportData] = useState<any>(null);
    const [loadingReport, setLoadingReport] = useState(false);

    // --- FETCH DATA ---
    const fetchDashboardData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }

        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/dashboard-data', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClinicName(data.clinic?.name || "Phòng khám AURA");
                setAdminName(data.admin_name || "Clinic Admin");
                setPatients(data.patients || []);
                setDoctors(data.doctors || []);
            }

            const meRes = await fetch('https://aurahealth.name.vn/api/v1/users/me', { 
                headers: { 'Authorization': `Bearer ${token}` } 
            });
            if (meRes.ok) {
                const meData = await meRes.json();
                setPrivacyConsent(meData.consent_for_training || false);
            }

        } catch (error) { console.error("Lỗi tải dashboard:", error); } finally { setLoading(false); }
    }, [navigate]);

    const fetchAiHistory = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/medical-records/clinic-history-split', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                const mapData = (list: any[]) => list.map((item: any) => ({
                    id: item.id,
                    date: item.created_at ? new Date(item.created_at).toLocaleDateString('vi-VN') : "N/A",
                    time: item.created_at ? new Date(item.created_at).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : "",
                    patient_name: item.patient_name,
                    image_url: item.image_url,
                    result: item.ai_result || "Đang xử lý...", 
                    status: item.ai_analysis_status || "PENDING",
                    uploader: item.uploader_name
                }));
                setClinicHistory(mapData(data.clinic_uploads || []));
                setPatientHistory(mapData(data.patient_uploads || []));
            }
        } catch (error) { console.error("Lỗi tải lịch sử AI:", error); }
    }, []);

    const fetchBillingData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const pkgRes = await fetch('https://aurahealth.name.vn/api/v1/billing/packages', { headers: { 'Authorization': `Bearer ${token}` } });
            if (pkgRes.ok) {
                const data = await pkgRes.json();
                setPackages(data.filter((p: any) => p.target_role === 'CLINIC'));
            }
            const subRes = await fetch('https://aurahealth.name.vn/api/v1/billing/my-usage', { headers: { 'Authorization': `Bearer ${token}` } });
            if (subRes.ok) {
                const subData = await subRes.json();
                setMySub({
                    active: subData.active || false,
                    credits: subData.credits || subData.credits_left || 0,
                    plan_name: subData.plan_name || 'Free',
                    expiry: subData.expiry || subData.expires_at || null
                });
            }
            const txRes = await fetch('https://aurahealth.name.vn/api/v1/billing/my-transactions', { headers: { 'Authorization': `Bearer ${token}` } });
            if (txRes.ok) setTransactions(await txRes.json());
        } catch (error) { console.error("Lỗi billing:", error); }
    }, []);

    const fetchNotifications = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/users/me/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (e) { console.error(e); }
    }, []);

    const fetchReport = async () => {
        setLoadingReport(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/clinics/reports/campaign?start_date=${dateRange.start}T00:00:00&end_date=${dateRange.end}T23:59:59`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setReportData(await res.json());
        } catch (e) { console.error(e); }
        finally { setLoadingReport(false); }
    };

    // --- EFFECTS ---
    useEffect(() => {
        fetchDashboardData();
        fetchAiHistory();
        fetchBillingData();
        fetchNotifications();
    }, [fetchDashboardData, fetchAiHistory, fetchBillingData, fetchNotifications]);

    useEffect(() => {
        const interval = setInterval(() => fetchNotifications(), 10000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- ACTION HANDLERS ---
    const searchDoctors = async (query: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/clinics/doctors/available?query=${query}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { 
                const data = await res.json(); 
                const foundDoctors = data.doctors || [];
                setAvailableDoctors(foundDoctors.filter((d: any) => !doctors.some(existingDoc => existingDoc.id === d.id))); 
            }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (showAddDoctorModal) { setSearchDocTerm(''); searchDoctors(''); } }, [showAddDoctorModal]);

    const handleAddExistingDoctor = async (doctorId: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/add-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ user_id: doctorId })
            });
            if (res.ok) {
                setAvailableDoctors(prev => prev.filter(d => d.id !== doctorId));
                fetchDashboardData(); 
            } else {
                // [MỚI] Thêm phần hiển thị lỗi nếu không thành công
                const errData = await res.json();
                alert("Lỗi thêm bác sĩ: " + (errData.detail || "Không xác định"));
            }
        } catch (error) { console.error(error); 
            console.error(error); 
            alert("Lỗi kết nối server");
        }
    };

    const searchPatients = async (query: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/clinics/patients/available?query=${query}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) { 
                const data = await res.json(); 
                setAvailablePatients((data.patients || []).filter((p: any) => !patients.some(existingPatient => existingPatient.id === p.id))); 
            }
        } catch (error) { console.error(error); }
    };

    useEffect(() => { if (showAddPatientModal) { setSearchPatientTerm(''); searchPatients(''); } }, [showAddPatientModal]);

    const handleAddExistingPatient = async (patientId: string) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/add-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ user_id: patientId })
            });
            if (res.ok) {
                setAvailablePatients(prev => prev.filter(p => p.id !== patientId));
                fetchDashboardData(); 
            } else {
                // [MỚI] Thêm phần hiển thị lỗi nếu không thành công
                const errData = await res.json();
                alert("Lỗi thêm bệnh nhân: " + (errData.detail || "Không xác định"));
            }
        } catch (error) { console.error(error); 
            console.error(error); 
            alert("Lỗi kết nối server");
        }
    };

    const submitAssignment = async () => {
        if (!selectedPatient || !targetDoctorId) return;
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/assign-patient', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ patient_id: selectedPatient.id, doctor_id: targetDoctorId })
            });
            if (res.ok) { setShowAssignModal(false); fetchDashboardData(); } 
            else alert("Lỗi phân công.");
        } catch(e) { alert("Lỗi kết nối."); }
    };

    const handleBuyPackage = async (pkg: ServicePackage) => {
        if (!window.confirm(`Xác nhận đăng ký gói "${pkg.name}" với giá ${pkg.price.toLocaleString('vi-VN')} đ?`)) return;
        setIsBuying(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/billing/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ package_id: pkg.id })
            });
            const data = await res.json();
            if (res.ok) {
                alert(`✅ Đăng ký thành công! Bạn có thêm ${data.credits_left || pkg.analysis_limit} lượt.`);
                fetchBillingData(); 
            } else {
                alert("❌ Lỗi: " + (data.detail || "Không thể mua gói"));
            }
        } catch (e) {
        alert("Lỗi kết nối server");
        } finally {
            setIsBuying(false);
        }
    };

    const handleDownloadCSV = async () => {
        const token = localStorage.getItem('token');
        const url = `https://aurahealth.name.vn/api/v1/clinics/reports/export/research?start_date=${dateRange.start}T00:00:00&end_date=${dateRange.end}T23:59:59`;
        try {
            const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `research_data_${dateRange.start}_${dateRange.end}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else alert("Lỗi khi tải báo cáo CSV");
        } catch (e) { console.error(e); alert("Lỗi kết nối"); }
    };

    const handleTogglePrivacy = async () => {
        const newValue = !privacyConsent;
        setPrivacyConsent(newValue);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/users/me/privacy', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ consent_for_training: newValue })
            });
            if (!res.ok) { setPrivacyConsent(!newValue); alert("Hiện tại không có dữ liệu để đóng góp!"); }
        } catch (e) { setPrivacyConsent(!newValue); alert("Lỗi kết nối server"); }
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    const getStatusColor = (result: string) => {
        if (!result) return 'black';
        const r = result.toLowerCase();
        if (r.includes('nặng') || r.includes('severe') || r.includes('pdr')) return '#dc3545';
        if (r.includes('vừa') || r.includes('moderate')) return '#fd7e14';
        if (r.includes('bình thường') || r.includes('normal') || r.includes('không')) return '#16a34a';
        return '#007bff';
    };

    const warningPatients = patients.filter(p => {
        const res = (p.latest_scan?.ai_result || "").toLowerCase();
        return res.includes('nặng') || res.includes('severe') || res.includes('pdr');
    });

    if (loading) return <div style={styles.loading}><FaSpinner className="spin" size={40} color="#007bff"/></div>;

    return (
        <div style={styles.container} className="fade-in">
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <FaUserMd size={26} color="#007bff"/>
                        <span style={styles.logoText}>AURA CLINIC</span>
                    </div>
                    <div style={styles.clinicName}>{clinicName}</div>
                </div>
                
                <nav style={styles.nav}>
                    {[
                        { id: 'accounts', icon: FaClipboardList, label: 'Quản lý Tổng hợp' },
                        { id: 'ai', icon: FaHistory, label: 'Lịch sử Phân tích' },
                        { id: 'stats', icon: FaChartLine, label: 'Thống kê & Cảnh báo', badge: warningPatients.length },
                        { id: 'billing', icon: FaCreditCard, label: 'Gói cước & Thanh toán' },
                        { id: 'settings', icon: FaCog, label: 'Cài đặt' },
                        { id: 'reports', icon: FaFileExport, label: 'Báo cáo Chiến dịch' }
                    ].map(item => (
                        <div 
                            key={item.id}
                            className={`sidebar-item ${activeMenu === item.id ? 'active' : ''}`}
                            onClick={() => setActiveMenu(item.id)}
                        >
                            <item.icon style={styles.menuIcon} /> 
                            {item.label}
                            {item.badge && item.badge > 0 && <span style={styles.badgeWarn}>{item.badge}</span>}
                        </div>
                    ))}
                </nav>

                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn} className="btn-secondary-hover">
                        <FaSignOutAlt style={{marginRight:'8px'}}/> Đăng xuất
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.headerRight}>
                        {/* Notifications */}
                        <div style={{position:'relative'}} ref={notificationRef}>
                             <button className="btn-icon-hover" style={styles.iconBtn} onClick={()=>setShowNotifications(!showNotifications)}>
                                <FaBell color="#64748b" size={20}/>
                                {notifications.some((n:any) => !n.is_read) && <span style={styles.bellBadge}></span>}
                             </button>
                             {showNotifications && (
                                <div style={styles.notificationDropdown} className="pop-in">
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    <div style={{maxHeight:'300px', overflowY:'auto'}}>
                                        {notifications.length > 0 ? notifications.map((n:any)=>(
                                            <div key={n.id} className="notification-item-hover" style={styles.notifItem}>
                                                <div style={{fontWeight:'600', fontSize:'13px', marginBottom:'4px', color:'#334155'}}>{n.title}</div>
                                                <div style={{fontSize:'12px', color:'#64748b'}}>{n.content}</div>
                                                <div style={{fontSize:'10px', color:'#94a3b8', marginTop:'5px'}}>{new Date(n.created_at).toLocaleString('vi-VN')}</div>
                                            </div>
                                        )) : <div style={{padding:'15px', fontSize:'13px', color:'#999'}}>Không có thông báo mới</div>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Profile */}
                        <div style={{position:'relative'}} ref={userMenuRef}>
                            <div style={styles.profileBox} className="hover-lift" onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>C</div>
                                <span style={styles.userNameText}>{adminName}</span>
                            </div>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    
                    {/* --- TAB 1: ACCOUNTS --- */}
                    {activeMenu === 'accounts' && (
                        <div className="fade-in" style={{display: 'flex', flexDirection: 'column', gap: '30px'}}>
                            
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaRobot style={{marginRight: 10, color:'#007bff'}}/>Phân tích AI</h2>
                                    <button onClick={() => navigate('/upload')} className="btn-primary-hover pulse-on-active" style={styles.primaryBtnSm}>
                                        <FaCamera style={{marginRight:6}}/> Phân tích Mới
                                    </button>
                                </div>
                            </div>

                            {/* Doctors */}
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaUserMd style={{marginRight: 10, color:'#007bff'}}/>Danh sách Bác sĩ</h2>
                                    <button onClick={() => setShowAddDoctorModal(true)} style={styles.primaryBtnSm} className="btn-primary-hover">
                                        <FaUserPlus style={{marginRight: 5}}/> Thêm bác sĩ
                                    </button>
                                </div>
                                <table style={styles.table} className="table-hover">
                                    <thead><tr><th style={styles.th}>BÁC SĨ</th><th style={styles.th}>LIÊN HỆ</th><th style={styles.th}>TRẠNG THÁI</th><th style={styles.th}>SỐ BỆNH NHÂN</th></tr></thead>
                                    <tbody>
                                        {doctors.length === 0 ? <tr><td colSpan={4} style={styles.emptyCell}>Chưa có bác sĩ nào.</td></tr> : doctors.map(d => (
                                            <tr key={d.id} style={styles.tr}>
                                                <td style={styles.td}><b>{d.full_name}</b><br/><small style={{color:'#64748b'}}>@{d.username}</small></td>
                                                <td style={styles.td}>{d.email}<br/>{d.phone}</td>
                                                <td style={styles.td}><span style={styles.statusActive}>Hoạt động</span></td>
                                                <td style={styles.td}><span style={styles.badge}>{d.patient_count} BN</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Patients */}
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaUserCircle style={{marginRight: 10, color:'#10b981'}}/>Danh sách Bệnh nhân</h2>
                                    <button onClick={() => setShowAddPatientModal(true)} style={styles.primaryBtnSm} className="btn-primary-hover">
                                        <FaUserPlus style={{marginRight:5}}/> Thêm Bệnh nhân
                                    </button>
                                </div>
                                <table style={styles.table} className="table-hover">
                                    <thead><tr><th style={styles.th}>BỆNH NHÂN</th><th style={styles.th}>LIÊN HỆ</th><th style={styles.th}>BÁC SĨ PHỤ TRÁCH</th><th style={styles.th}>KẾT QUẢ GẦN NHẤT</th><th style={styles.th}>THAO TÁC</th></tr></thead>
                                    <tbody>
                                        {patients.length === 0 ? <tr><td colSpan={5} style={styles.emptyCell}>Chưa có bệnh nhân nào.</td></tr> : patients.map(p => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><b>{p.full_name}</b><br/><small style={{color:'#64748b'}}>@{p.username}</small></td>
                                                <td style={styles.td}>{p.email}<br/><small>{p.phone}</small></td>
                                                <td style={styles.td}>{p.assigned_doctor_id ? <span style={styles.doctorTagActive}><FaStethoscope style={{marginRight:5}}/> {p.assigned_doctor}</span> : <span style={styles.doctorTagWarning}>Chưa phân công</span>}</td>
                                                <td style={styles.td}>
                                                    {p.latest_scan ? (
                                                        <span style={{fontWeight:'700', color: getStatusColor(p.latest_scan.ai_result)}}>
                                                            {p.latest_scan.ai_result}
                                                        </span>
                                                    ) : <span style={{color:'#94a3b8'}}>--</span>}
                                                </td>
                                                <td style={styles.td}>
                                                    <button onClick={() => {setSelectedPatient(p); setTargetDoctorId(p.assigned_doctor_id||''); setShowAssignModal(true)}} className="btn-secondary-hover" style={styles.actionBtn}>Phân công</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 2: AI --- */}
                    {activeMenu === 'ai' && (
                        <div style={styles.card} className="slide-up-card">
                            <div style={styles.cardHeader}>
                                <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                                    <h2 style={styles.pageTitle}>Lịch sử Phân tích</h2>
                                    <div style={{display:'flex', background:'#f1f5f9', padding:'4px', borderRadius:'8px'}}>
                                        <button onClick={() => setAiSubTab('clinic')} style={aiSubTab === 'clinic' ? styles.tabActive : styles.tabInactive}>Phòng khám ({clinicHistory.length})</button>
                                        <button onClick={() => setAiSubTab('patient')} style={aiSubTab === 'patient' ? styles.tabActive : styles.tabInactive}>Bệnh nhân ({patientHistory.length})</button>
                                    </div>
                                </div>
                            </div>
                            <table style={styles.table} className="table-hover">
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Thời gian</th>
                                        <th style={styles.th}>Bệnh nhân</th>
                                        {aiSubTab === 'clinic' && <th style={styles.th}>Người thực hiện</th>}
                                        <th style={styles.th}>Hình ảnh</th>
                                        <th style={styles.th}>Kết quả AI</th>
                                        <th style={styles.th}>Trạng thái</th>
                                        <th style={styles.th}>Chi tiết</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(aiSubTab === 'clinic' ? clinicHistory : patientHistory).length === 0 ? (
                                        <tr><td colSpan={7} style={styles.emptyCell}>Chưa có dữ liệu.</td></tr>
                                    ) : (
                                        (aiSubTab === 'clinic' ? clinicHistory : patientHistory).map((item) => (
                                            <tr key={item.id} style={styles.tr}>
                                                <td style={styles.td}>{item.date}<br/><small style={{color:'#94a3b8'}}>{item.time}</small></td>
                                                <td style={styles.td}><b>{item.patient_name}</b></td>
                                                {aiSubTab === 'clinic' && <td style={styles.td}><span style={{background:'#eff6ff', color:'#1d4ed8', padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600}}>{item.uploader}</span></td>}
                                                <td style={styles.td}><img src={item.image_url} alt="Scan" className="hover-lift" style={{width:'40px', height:'40px', objectFit:'cover', borderRadius:'6px', border:'1px solid #e2e8f0'}} /></td>
                                                <td style={styles.td}><span style={{color: getStatusColor(item.result), fontWeight: '700'}}>{item.result}</span></td>
                                                <td style={styles.td}>{item.status === 'COMPLETED' ? <span style={styles.statusActive}>Hoàn tất</span> : <span style={styles.statusPending}><FaSpinner className="spin" style={{marginRight:4}}/> Đang xử lý</span>}</td>
                                                <td style={styles.td}><button onClick={() => navigate(`/clinic/analysis/${item.id}`)} className="btn-secondary-hover" style={styles.actionBtn}>Xem</button></td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* --- TAB 3: STATS --- */}
                    {activeMenu === 'stats' && (
                        <div className="fade-in">
                            <div style={{...styles.card, borderLeft: '4px solid #ef4444'}} className="slide-up-card">
                                <div style={styles.cardHeader}>
                                    <h2 style={{...styles.pageTitle, color: '#ef4444'}}><FaExclamationTriangle style={{marginRight: 10}}/>Cảnh báo Bệnh nhân Nặng</h2>
                                    <span style={{background: '#fef2f2', color: '#ef4444', padding:'4px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700'}}>{warningPatients.length} Trường hợp</span>
                                </div>
                                <table style={styles.table} className="table-hover">
                                    <thead><tr><th style={styles.th}>Bệnh nhân</th><th style={styles.th}>SĐT</th><th style={styles.th}>Kết quả gần nhất</th><th style={styles.th}>Hành động</th></tr></thead>
                                    <tbody>
                                        {warningPatients.length === 0 ? <tr><td colSpan={4} style={styles.emptyCell}>Tuyệt vời! Không có cảnh báo nguy hiểm.</td></tr> : warningPatients.map(p => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><b style={{color:'#ef4444'}}>{p.full_name}</b></td>
                                                <td style={styles.td}>{p.phone}</td>
                                                <td style={styles.td}><span style={{fontWeight:'700', color:'#ef4444'}}>{p.latest_scan?.ai_result}</span></td>
                                                <td style={styles.td}><button className="btn-primary-hover" style={{...styles.primaryBtnSm, background:'#ef4444'}}>Liên hệ gấp</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 4: BILLING --- */}
                    {activeMenu === 'billing' && (
                        <div className="fade-in" style={{display:'flex', flexDirection:'column', gap:'30px'}}>
                            {/* Card 1: Thông tin ví */}
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaCreditCard style={{marginRight:10, color:'#007bff'}}/>Thông tin Ví & Dịch vụ</h2></div>
                                <div style={{padding:'30px', background:'linear-gradient(135deg, #66c7e7 30%, #0c00ef 100%)', margin:'20px', borderRadius:'16px', color:'white', boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)'}}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
                                        <div>
                                            <p style={{margin:0, opacity:0.9, fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Gói Doanh nghiệp</p>
                                            <h2 style={{margin:'5px 0', fontSize:'32px', fontWeight:'800'}}>{mySub.plan_name}</h2>
                                            {mySub.expiry && <small style={{opacity:0.9, background:'rgba(255,255,255,0.2)', padding:'4px 10px', borderRadius:'20px'}}>Hết hạn: {new Date(mySub.expiry).toLocaleDateString('vi-VN')}</small>}
                                        </div>
                                        <div style={{textAlign:'right'}}>
                                            <p style={{margin:0, opacity:0.9, fontSize:'13px', textTransform:'uppercase', letterSpacing:'1px'}}>Số lượt khả dụng</p>
                                            <h1 style={{margin:0, fontSize:'56px', fontWeight:'800', lineHeight:'1'}}>{mySub.credits}</h1>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Card 2: Mua thêm gói */}
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaBoxOpen style={{marginRight:10, color:'#f59e0b'}}/>Mua thêm gói dịch vụ</h2></div>
                                <div style={{padding:'25px'}}>
                                    {packages.length === 0 ? <div style={styles.emptyCell}>Chưa có gói dịch vụ nào.</div> : (
                                        <div style={styles.pricingGrid}>
                                            {packages.map(pkg => (
                                                <div key={pkg.id} style={styles.pricingCard} className="hover-lift">
                                                    <div style={styles.pricingHeader}>
                                                        <h4 style={{margin:0, fontSize:'18px', color:'#334155', fontWeight:'700'}}>{pkg.name}</h4>
                                                        <div style={styles.priceTag}>{pkg.price === 0 ? 'Liên hệ' : `${pkg.price.toLocaleString('vi-VN')} đ`}</div>
                                                    </div>
                                                    <div style={styles.pricingBody}>
                                                        <p style={{fontSize:'13px', color:'#64748b', minHeight:'40px'}}>{pkg.description}</p>
                                                        <ul style={{paddingLeft:'0', margin:'20px 0', color:'#334155', fontSize:'14px', listStyle:'none'}}>
                                                            <li style={{marginBottom:'8px', display:'flex', alignItems:'center'}}><FaCheck style={{color:'#22c55e', marginRight:'8px'}}/> Thời hạn: <b>{pkg.duration_days} ngày</b></li>
                                                            <li style={{marginBottom:'8px', display:'flex', alignItems:'center'}}><FaRobot style={{color:'#007bff', marginRight:'8px'}}/> Số lượt AI: <b>{pkg.analysis_limit}</b></li>
                                                        </ul>
                                                        <button onClick={() => handleBuyPackage(pkg)} disabled={isBuying} className="btn-primary-hover pulse-on-active" style={{...styles.primaryBtn, width:'100%', justifyContent:'center'}}>{isBuying ? 'Đang xử lý...' : 'Mua ngay'}</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card 3: Lịch sử thanh toán (Đã khôi phục) */}
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}>
                                    <h2 style={styles.pageTitle}><FaHistory style={{marginRight:10, color:'#007bff'}}/>Lịch sử thanh toán</h2>
                                </div>
                                <table style={styles.table} className="table-hover">
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Thời gian</th>
                                            <th style={styles.th}>Nội dung</th>
                                            <th style={styles.th}>Số tiền</th>
                                            <th style={styles.th}>Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.length === 0 ? (
                                            <tr><td colSpan={4} style={styles.emptyCell}>Chưa có giao dịch nào.</td></tr>
                                        ) : (
                                            transactions.map(tx => (
                                                <tr key={tx.id} style={styles.tr}>
                                                    <td style={styles.td}>
                                                        {new Date(tx.created_at).toLocaleDateString('vi-VN')} <br/>
                                                        <small style={{color:'#94a3b8'}}>{new Date(tx.created_at).toLocaleTimeString('vi-VN')}</small>
                                                    </td>
                                                    <td style={styles.td}>Đăng ký <b>{tx.package_name}</b></td>
                                                    <td style={{...styles.td, color: '#007bff', fontWeight:'bold'}}>
                                                        {new Intl.NumberFormat('vi-VN').format(tx.amount)} đ
                                                    </td>
                                                    <td style={styles.td}>
                                                        <span style={styles.statusActive}>{tx.status}</span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 5: SETTINGS --- */}
                    {activeMenu === 'settings' && (
                        <div className="fade-in" style={styles.card}>
                            <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaUserShield style={{marginRight:10, color:'#007bff'}}/> Thiết lập Tài khoản</h2></div>
                            <div style={{padding:'30px'}}>
                                <h4 style={{marginBottom:'15px', color:'#334155', borderBottom:'1px solid #e2e8f0', paddingBottom:'10px'}}>Dữ liệu Y tế (Dành cho Chủ phòng khám)</h4>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'25px', border:'1px solid #e2e8f0', borderRadius:'16px', background: privacyConsent ? '#f0fdf4' : '#fff'}} className="hover-lift">
                                    <div style={{maxWidth:'80%'}}>
                                        <h4 style={{margin:'0 0 5px 0', fontSize:'16px', color:'#1e293b'}}>Đóng góp dữ liệu nghiên cứu</h4>
                                        <p style={{margin:0, fontSize:'14px', color:'#64748b'}}>Nếu bạn (Chủ tài khoản) sử dụng hệ thống để lưu trữ hồ sơ cá nhân, bạn có đồng ý chia sẻ dữ liệu ẩn danh để huấn luyện AI không?</p>
                                    </div>
                                    <div onClick={handleTogglePrivacy} style={{cursor:'pointer', fontSize:'35px', color: privacyConsent ? '#16a34a' : '#cbd5e1', display:'flex', alignItems:'center'}}>
                                        {privacyConsent ? <FaToggleOn size={45}/> : <FaToggleOff size={45}/>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 6: REPORTS --- */}
                    {activeMenu === 'reports' && (
                        <div className="fade-in" style={{display:'flex', flexDirection:'column', gap:'30px'}}>
                            <div style={styles.card} className="slide-up-card">
                                <div style={styles.cardHeader}><h2 style={styles.pageTitle}><FaFileExport style={{marginRight:10, color:'#007bff'}}/>Báo cáo Chiến dịch</h2></div>
                                <div style={{padding:'25px', display:'flex', gap:'20px', alignItems:'flex-end', borderBottom:'1px solid #f1f5f9', background:'#f8fafc'}}>
                                    <div><label style={styles.formLabel}>Từ ngày</label><input type="date" className="input-focus" style={styles.dateInput} value={dateRange.start} onChange={e=>setDateRange({...dateRange, start: e.target.value})} /></div>
                                    <div><label style={styles.formLabel}>Đến ngày</label><input type="date" className="input-focus" style={styles.dateInput} value={dateRange.end} onChange={e=>setDateRange({...dateRange, end: e.target.value})} /></div>
                                    <button onClick={fetchReport} className="btn-primary-hover" style={styles.primaryBtn}>{loadingReport ? 'Đang tạo...' : 'Xem thống kê'}</button>
                                    <button onClick={handleDownloadCSV} className="btn-primary-hover" style={{...styles.primaryBtn, background:'#15803d', border:'none', marginLeft:'auto'}}><FaFileCsv style={{marginRight:5}}/> Xuất CSV</button>
                                </div>

                                {reportData && (
                                    <div style={{padding:'30px'}}>
                                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'25px', marginBottom:'30px'}}>
                                            <div style={{padding:'25px', background:'#eff6ff', borderRadius:'12px', textAlign:'center', border:'1px solid #dbeafe'}}>
                                                <h3 style={{margin:0, color:'#1d4ed8', fontSize:'36px', fontWeight:'800'}}>{reportData.summary.total_scans}</h3>
                                                <p style={{margin:0, color:'#1e40af', fontSize:'14px', fontWeight:'600'}}>Tổng ca sàng lọc</p>
                                            </div>
                                            <div style={{padding:'25px', background:'#fef2f2', borderRadius:'12px', textAlign:'center', border:'1px solid #fee2e2'}}>
                                                <h3 style={{margin:0, color:'#b91c1c', fontSize:'36px', fontWeight:'800'}}>{reportData.summary.high_risk_count}</h3>
                                                <p style={{margin:0, color:'#991b1b', fontSize:'14px', fontWeight:'600'}}>Ca nguy cơ cao</p>
                                            </div>
                                        </div>
                                        <div style={{height:'350px', marginBottom:'30px'}}>
                                            <h4 style={{textAlign:'center', marginBottom:'20px', color:'#334155'}}>Phân bố Kết quả Sàng lọc</h4>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={reportData.chart_data}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="name" tick={{fontSize: 12}} />
                                                    <YAxis />
                                                    <RechartsTooltip cursor={{fill: '#f1f5f9'}} />
                                                    <Bar dataKey="value" name="Số lượng" radius={[4, 4, 0, 0]}>
                                                        {reportData.chart_data.map((entry:any, index:number) => (
                                                            <Cell key={`cell-${index}`} fill={entry.name.includes('SEVERE') || entry.name.includes('PDR') ? '#ef4444' : '#3b82f6'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* MODALS */}
            {showAssignModal && selectedPatient && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent} className="pop-in">
                        <div style={styles.modalHeader}><h3>Phân công Bác sĩ</h3><button onClick={()=>setShowAssignModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <div style={{padding:'25px'}}>
                            <p style={{marginBottom:'15px', color:'#334155'}}>Bệnh nhân: <b>{selectedPatient.full_name}</b></p>
                            <select className="input-focus" style={styles.selectInput} value={targetDoctorId} onChange={(e) => setTargetDoctorId(e.target.value)}>
                                <option value="">-- Chọn bác sĩ --</option>
                                {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.patient_count} BN)</option>)}
                            </select>
                            <div style={styles.modalActions}>
                                <button onClick={() => setShowAssignModal(false)} className="btn-secondary-hover" style={styles.secondaryBtn}>Đóng</button>
                                <button onClick={submitAssignment} className="btn-primary-hover" style={styles.primaryBtn}>Lưu phân công</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        
            {showAddPatientModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}} className="pop-in"> 
                        <div style={styles.modalHeader}><h3>Thêm Bệnh nhân</h3><button onClick={()=>setShowAddPatientModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <div style={{padding:'25px'}}>
                            <div style={styles.searchBox}>
                                <FaSearch color="#94a3b8"/>
                                <input className="input-focus" type="text" placeholder="Nhập tên, email hoặc SĐT..." style={styles.searchInput} value={searchPatientTerm} onChange={(e)=>{setSearchPatientTerm(e.target.value); searchPatients(e.target.value)}}/>
                            </div>
                            <div style={{maxHeight:'300px', overflowY:'auto', marginTop:'20px'}}>
                                <table style={styles.table} className="table-hover">
                                    <tbody>{availablePatients.map(p=>(<tr key={p.id} style={styles.tr}><td style={{padding:'12px'}}>{p.full_name}<br/><small style={{color:'#64748b'}}>{p.email}</small></td><td style={{textAlign:'right'}}><button onClick={()=>handleAddExistingPatient(p.id)} style={styles.primaryBtnSm} className="btn-primary-hover">Thêm</button></td></tr>))}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showAddDoctorModal && (
                <div style={styles.modalOverlay}>
                    <div style={{...styles.modalContent, width: '600px'}} className="pop-in"> 
                        <div style={styles.modalHeader}><h3>Thêm Bác sĩ</h3><button onClick={()=>setShowAddDoctorModal(false)} style={styles.closeBtn}><FaTimes/></button></div>
                        <div style={{padding:'25px'}}>
                            <div style={styles.searchBox}>
                                <FaSearch color="#94a3b8"/>
                                <input className="input-focus" type="text" placeholder="Tìm kiếm bác sĩ..." style={styles.searchInput} value={searchDocTerm} onChange={(e)=>{setSearchDocTerm(e.target.value); searchDoctors(e.target.value)}}/>
                            </div>
                            <div style={{maxHeight:'300px', overflowY:'auto', marginTop:'20px'}}>
                                <table style={styles.table} className="table-hover">
                                    <tbody>{availableDoctors.map(d=>(<tr key={d.id} style={styles.tr}><td style={{padding:'12px'}}>{d.full_name}<br/><small style={{color:'#64748b'}}>{d.email}</small></td><td style={{textAlign:'right'}}><button onClick={()=>handleAddExistingDoctor(d.id)} style={styles.primaryBtnSm} className="btn-primary-hover">Thêm</button></td></tr>))}</tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES (SOFT UI STANDARD) ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#64748b', fontSize:'16px', backgroundColor: '#f4f6f9' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
    // Sidebar
    sidebar: { width: '270px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '4px 0 15px rgba(0,0,0,0.02)', zIndex: 10 },
    sidebarHeader: { padding: '25px', borderBottom: '1px solid #f1f5f9' },
    logoRow: { display:'flex', alignItems:'center', gap:'12px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '20px', color: '#1e293b', letterSpacing: '-0.5px' },
    clinicName: { fontSize:'13px', color:'#64748b', marginLeft:'42px', fontWeight: 500 },
    nav: { flex: 1, padding: '25px 0', overflowY: 'auto', overflowX:'hidden' },
    menuIcon: { marginRight: '14px', fontSize: '18px' },
    badgeWarn: { marginLeft: 'auto', backgroundColor: '#ef4444', color: 'white', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' },
    sidebarFooter: { padding: '25px', borderTop: '1px solid #f1f5f9' },
    logoutBtn: { width: '100%', padding: '12px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '10px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' },

    // Main
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '75px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 40px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '25px' },
    
    profileBox: { display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', padding: '6px 12px', borderRadius: '30px', transition: 'background 0.2s' },
    avatarCircle: { width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff, #0056b3)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '15px', fontWeight:'600', boxShadow: '0 4px 8px rgba(0,123,255,0.2)' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    iconBtn: { background:'none', border:'none', cursor:'pointer', position:'relative', padding:'8px', borderRadius: '50%', transition: 'background 0.2s' },
    bellBadge: { position: 'absolute', top: '5px', right: '5px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid #fff' },

    contentBody: { padding: '30px 40px', flex: 1, overflowY: 'auto' },
    
    // Cards & Tables
    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', overflow:'hidden', marginBottom:'25px', transition: 'transform 0.3s' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background: '#fff' },
    pageTitle: { fontSize: '18px', margin: 0, display:'flex', alignItems:'center', color: '#1e293b', fontWeight: '700' },
    badge: { background:'#eef2ff', color:'#007bff', padding:'4px 10px', borderRadius:'20px', fontSize:'12px', fontWeight:'600', border:'1px solid #dbeafe' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '15px 25px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize:'12px', textTransform:'uppercase', fontWeight:'700', background:'#f8fafc', letterSpacing: '0.5px' },
    tr: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' },
    td: { padding: '18px 25px', verticalAlign: 'middle', color:'#334155' },
    emptyCell: { textAlign: 'center', padding: '50px', color: '#94a3b8', fontStyle: 'italic' },
    
    // Buttons & Status
    statusActive: { background: '#dcfce7', color: '#166534', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
    statusPending: { background: '#fff7ed', color: '#c2410c', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', display:'flex', alignItems:'center', gap:'5px', width:'fit-content' },
    doctorTagActive: { background: '#eff6ff', color: '#1d4ed8', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', display:'inline-flex', alignItems:'center', fontWeight:500 },
    doctorTagWarning: { background: '#fff1f2', color: '#be123c', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontStyle:'italic' },
    
    primaryBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight:'600', boxShadow: '0 4px 12px rgba(0,123,255,0.2)', transition: 'all 0.2s', fontSize: '14px' },
    primaryBtnSm: { background: '#007bff', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center', fontWeight: '600', transition: 'background 0.2s' },
    secondaryBtn: { padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', fontWeight:'600', fontSize:'14px' },
    actionBtn: { background: '#fff', border: '1px solid #e2e8f0', color: '#007bff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s' },
    
    // Forms & Inputs
    formLabel: { display:'block', marginBottom:'8px', fontSize:'14px', fontWeight:'600', color:'#334155' },
    selectInput: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background:'#fff', marginBottom:'20px', boxSizing: 'border-box' },
    dateInput: { padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', background:'#fff', color:'#334155' },
    searchBox: { display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '10px 15px', border: '1px solid #e2e8f0' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '10px', width: '100%', fontSize:'14px', color:'#333' },

    // Modals & Dropdowns
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.4)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000, backdropFilter: 'blur(3px)' },
    modalContent: { background:'white', padding:'0', borderRadius:'16px', width:'450px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)', overflow:'hidden' },
    modalHeader: { padding:'20px 25px', background:'#fff', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' },
    modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop:'25px' },
    closeBtn: { border:'none', background:'transparent', fontSize:'18px', cursor:'pointer', color:'#94a3b8', padding:'5px' },
    
    notificationDropdown: { position: 'absolute', top: '55px', right: '-10px', width: '320px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1100, border:'1px solid #f1f5f9', overflow: 'hidden' },
    dropdownMenu: { position: 'absolute', top: '65px', right: '0', width: '220px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #f1f5f9', overflow: 'hidden' },
    dropdownHeader: { padding: '15px', background:'#f8fafc', fontSize:'14px', fontWeight:'700', borderBottom:'1px solid #f1f5f9', color:'#334155' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', fontSize:'14px', transition: 'background 0.2s' },
    notifItem: { padding: '15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' },

    // Tabs & Pricing
    tabActive: { padding: '8px 20px', background: '#fff', color: '#007bff', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '13px', fontWeight: '700', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    tabInactive: { padding: '8px 20px', background: 'transparent', color: '#64748b', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600' },
    pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '25px' },
    pricingCard: { backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e1e4e8', overflow: 'hidden', transition: 'transform 0.2s', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', display:'flex', flexDirection:'column' },
    pricingHeader: { padding: '25px', backgroundColor: '#f8fbff', borderBottom: '1px solid #f1f5f9', textAlign: 'center' },
    priceTag: { fontSize: '28px', fontWeight: '800', color: '#007bff', marginTop: '10px' },
    pricingBody: { padding: '25px', flex: 1, display:'flex', flexDirection:'column', justifyContent:'space-between' },
};

// --- GLOBAL CSS (Inject) ---
const cssGlobal = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(25px); } to { opacity: 1; transform: translateY(0); } }
@keyframes popIn { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
@keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); } 70% { transform: scale(1.03); box-shadow: 0 0 0 10px rgba(0, 123, 255, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); } }

.spin { animation: spin 1s linear infinite; }
.fade-in { animation: fadeIn 0.5s ease-out forwards; }
.slide-up-card { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
.pop-in { animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* --- SIDEBAR CSS --- */
.sidebar-item {
    padding: 12px 25px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500;
    color: #64748b;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
    border-left: 4px solid transparent;
    margin: 4px 0;
    border-radius: 0 25px 25px 0;
    width: 100%; 
    box-sizing: border-box;
}

.sidebar-item:not(.active):hover {
    background-color: #f8fafc;
    color: #007bff;
}

.sidebar-item.active {
    background-color: #eff6ff;
    color: #007bff;
    border-left-color: #007bff;
    font-weight: 600;
    box-shadow: 2px 2px 5px rgba(0,123,255,0.05);
}

.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,123,255,0.25) !important; filter: brightness(1.05); }
.btn-primary-hover:active { transform: translateY(0); }
.btn-secondary-hover:hover { background-color: #e2e8f0 !important; color: #1e293b !important; }
.btn-icon-hover:hover { background-color: #f1f5f9 !important; }
.pulse-on-active:active { animation: pulse 0.4s; }

.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1) !important; background-color: #fff !important; }

.hover-lift:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.06) !important; }
.notification-item-hover:hover { background-color: #f8fbff !important; }
.table-hover tbody tr:hover { background-color: #f8fbff !important; }

::-webkit-scrollbar { width: 4px; } 
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default ClinicDashboard;