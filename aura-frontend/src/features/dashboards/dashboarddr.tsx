import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaUserMd, FaUsers, FaClipboardList, FaCommentDots, 
    FaSearch, FaTimes, FaSignOutAlt, FaBell, FaChartBar, FaStethoscope,
    FaFileAlt, FaExclamationTriangle, FaCheck, FaCheckDouble, FaRobot 
} from 'react-icons/fa';
// Thêm thư viện animation cho nội dung chính
import { motion, AnimatePresence } from 'framer-motion';

// --- INTERFACES ---
interface MyReport {
    id: string;
    image_url: string | null;
    ai_result: string;
    doctor_confirm: string;
    report_content: string;
    admin_feedback: string | null;
    status: string;
    created_at: string;
}

// --- ANIMATION VARIANTS ---
const pageVariants = {
    initial: { opacity: 0, y: 10 },
    in: { opacity: 1, y: 0 },
    out: { opacity: 0, y: -10 }
};

const pageTransition = {
    type: "tween",
    ease: "anticipate",
    duration: 0.4
} as const;

const modalVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } }
};

// --- COMPONENT CHÍNH ---
const DashboardDr: React.FC = () => {
    const navigate = useNavigate();

    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('doctor');
    const [userName, setUserName] = useState<string>('');   
    const [full_name, setFullName] = useState<string>(''); 
    const [isLoading, setIsLoading] = useState(true);
    
    // DỮ LIỆU API
    const [patientsData, setPatientsData] = useState<any[]>([]); 
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // STATE UI
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    
    // STATE MODAL & FILTER
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyRecords, setHistoryRecords] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedPatientName, setSelectedPatientName] = useState('');

    const [searchTerm, setSearchTerm] = useState('');
    const [riskFilter, setRiskFilter] = useState('ALL');

    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // --- STATE BÁO CÁO [FR-19] ---
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportForm, setReportForm] = useState({
        patientId: '',
        aiResult: 'Nguy cơ cao', 
        doctorDiagnosis: '',
        accuracy: 'CORRECT',
        notes: ''
    });

    const [myReports, setMyReports] = useState<MyReport[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const [alerts, setAlerts] = useState<any[]>([]);

    const [stats, setStats] = useState({
        patient_count: 0,
        reviewed_count: 0,
        ai_agreement_rate: 0,
        chart_data: { safe: 0, mild: 0, moderate: 0, severe: 0, pdr: 0 }
    });

    // --- LOGIC API ---

    const fetchMyReports = useCallback(async () => {
        setLoadingReports(true);
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/doctor/reports/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMyReports(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error("Lỗi tải báo cáo:", error);
        } finally {
            setLoadingReports(false);
        }
    }, []);

    const submitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) { alert("Vui lòng đăng nhập lại"); return; }

        const selectedP = patientsData.find(p => String(p.id) === String(reportForm.patientId));
        const recordId = selectedP?.latest_scan?.record_id;

        if (!recordId) {
            alert("Bệnh nhân này chưa có hồ sơ khám bệnh để chẩn đoán!");
            return;
        }

        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/doctor/records/${recordId}/diagnose`, { 
                method: 'PUT', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    doctor_diagnosis: reportForm.doctorDiagnosis,
                    doctor_notes: reportForm.notes,
                    feedback_for_ai: reportForm.notes,
                    is_correct: reportForm.accuracy === 'CORRECT'
                })
            });

            if (res.ok) {
                alert("Đã cập nhật chẩn đoán thành công!");
                setShowReportModal(false);
                setReportForm({ ...reportForm, doctorDiagnosis: '', notes: '' });
                // Refresh data
                const patientsRes = await fetch('https://aurahealth.name.vn/api/v1/doctor/my-patients', { headers: { 'Authorization': `Bearer ${token}` } });
                if (patientsRes.ok) { 
                    const data = await patientsRes.json(); 
                    setPatientsData(data.patients || []); 
                }
            } else {
                const err = await res.json();
                alert("Lỗi: " + (err.detail || "Không thể lưu chẩn đoán"));
            }
        } catch (error) {
            console.error(error);
            alert("Lỗi kết nối server!");
        }
    };

    const fetchChatData = useCallback(async (token: string) => {
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats || [];
                
                const enrichedChats = serverChats.map((sChat: any) => {
                    const patient = patientsData.find(p => p.id === sChat.id);
                    return {
                        ...sChat,
                        display_name: sChat.full_name || patient?.full_name || patient?.userName || sChat.sender 
                    };
                });

                setChatData(prevChats => {
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    const mergedChats = enrichedChats.map((sChat: any) => {
                        const pChat: any = prevMap.get(sChat.id);
                        if (pChat && pChat.time === "Vừa xong" && sChat.preview !== pChat.preview) return pChat; 
                        return sChat;
                    });
                    return mergedChats.sort((a: any, b: any) => {
                        if (a.time === "Vừa xong") return -1;
                        if (b.time === "Vừa xong") return 1;
                        return (b.time || "").localeCompare(a.time || ""); 
                    });
                });
            }
        } catch (error) { console.error("Lỗi chat:", error); }
    }, [patientsData]);

    const handleViewHistory = async (patientId: string, name: string) => {
        setShowHistoryModal(true);
        setSelectedPatientName(name);
        setHistoryLoading(true);
        setHistoryRecords([]);
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/doctor/patients/${patientId}/history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const records = (Array.isArray(data) ? data : []).map((r: any) => {
                    let displayResult = "Đang phân tích...";
                    if (r.analysis_result) {
                        if (r.analysis_result.doctor_diagnosis) {
                             displayResult = r.analysis_result.doctor_diagnosis;
                        } 
                        else if (r.analysis_result.risk_level) {
                            displayResult = r.analysis_result.risk_level;
                        }
                    }
                    return {
                        id: r.id,
                        date: r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : 'N/A',
                        result: displayResult,
                        status: r.analysis_result ? "COMPLETED" : "PENDING"
                    };
                });
                setHistoryRecords(records); 
            }
        } catch (error) { console.error(error); } finally { setHistoryLoading(false); }
    };

    const fetchMessageHistory = async (partnerId: string) => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const res = await fetch(`https://aurahealth.name.vn/api/v1/chats/history/${partnerId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            return data.messages || [];
        } catch (err) { return []; }
    };

    const openChat = async (partnerId: string) => {
        setSelectedChatId(partnerId);
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        const token = localStorage.getItem('token');
        if (token) {
            setChatData(prev => prev.map(c => c.id === partnerId ? { ...c, unread: false } : c));
            await fetch(`https://aurahealth.name.vn/api/v1/chats/read/${partnerId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }});
            fetchChatData(token);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;
        const textToSend = newMessageText;
        setNewMessageText(''); 
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: timeString,
            is_read: false
        };
        setCurrentMessages(prev => [...prev, tempMsg]);
        setChatData(prevList => {
            const newList = [...prevList];
            const chatIndex = newList.findIndex(c => c.id === selectedChatId);
            if (chatIndex > -1) {
                const updatedChat = { ...newList[chatIndex], preview: "Bạn: " + textToSend, time: "Vừa xong", unread: false };
                newList.splice(chatIndex, 1);
                newList.unshift(updatedChat);
            }
            return newList;
        });
        try {
            const token = localStorage.getItem('token');
            await fetch('https://aurahealth.name.vn/api/v1/chats/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
            });
        } catch (err) { alert("Lỗi gửi tin!"); }
    };

    const fetchAlerts = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('https://aurahealth.name.vn/api/v1/doctor/alerts/critical', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) setAlerts(await res.json());
};

    // --- EFFECTS ---
    useEffect(() => {
        if (activeTab === 'reports') {
            fetchMyReports();
        }
    }, [activeTab, fetchMyReports]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [currentMessages]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const interval = setInterval(async () => {
             if (activeTab === 'chat') fetchChatData(token); 
             if (selectedChatId) {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                if (serverMsgs && serverMsgs.length >= currentMessages.length) setCurrentMessages(serverMsgs);
             }
        }, 3000); 
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData, currentMessages.length, activeTab]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }
        const initData = async () => {
            try {
                const userRes = await fetch('https://aurahealth.name.vn/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!userRes.ok) throw new Error("Token lỗi");
                
                const userData = await userRes.json();
                const info = userData.user_info || userData;
                const userProfile = info.profile || userData.profile || {}

                if (info.role !== 'doctor') { 
                    alert("Tài khoản không có quyền Bác sĩ"); 
                    handleLogout(); 
                    return; 
                }

                setUserName(info.username || info.userName);
                setFullName(userProfile.full_name || info.full_name || '');
                setUserRole(info.role);

                const patientsRes = await fetch('https://aurahealth.name.vn/api/v1/doctor/my-patients', { headers: { 'Authorization': `Bearer ${token}` } });
                if (patientsRes.ok) { 
                    const data = await patientsRes.json(); 
                    setPatientsData(data.patients || []); 
                }

                const statsRes = await fetch('https://aurahealth.name.vn/api/v1/doctor/stats', { 
                    headers: { 'Authorization': `Bearer ${token}` } 
                });
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    setStats(statsData);
                }

                await fetchChatData(token); 
            } catch (error) { console.error(error); } finally { setIsLoading(false); }
        };
        initData();
        fetchAlerts();
    }, []); 

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };

    // --- COMPUTED DATA (MEMOIZED) ---
    const unreadMessagesCount = useMemo(() => chatData.filter(chat => chat.unread).length, [chatData]);
    
    const pendingRecords = useMemo(() => patientsData
        .filter(p => {
            if (!p.latest_scan) return false;
            const res = (p.latest_scan.ai_result || "").toLowerCase();
            const status = (p.latest_scan.ai_analysis_status || "").toUpperCase();
            
            const isHighRisk = res.includes('nặng') || res.includes('Servere NPDR') || res.includes('PDR') || res.includes('severe');
            const isCompleted = status === 'COMPLETED';
            
            return isCompleted && isHighRisk;
        })
        .map(p => ({ 
            id: p.latest_scan.record_id || '', 
            patientName: p.full_name || p.userName, 
            date: new Date(p.latest_scan.upload_date).toLocaleDateString('vi-VN'),
            aiResult: p.latest_scan.ai_result,
            status: 'Chờ Bác sĩ' 
        })), [patientsData]);

    const totalPending = pendingRecords.length;

    const filteredPatients = useMemo(() => {
        return patientsData.filter(p => {
            const matchNameOrId = 
                (p.full_name || p.userName).toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.id.toLowerCase().includes(searchTerm.toLowerCase()); // Thêm tìm kiếm theo ID
            
            const res = (p.latest_scan?.ai_result || '').toLowerCase();
            let matchRisk = true;
            if (riskFilter === 'ALL') matchRisk = true;
            else if (riskFilter === 'Normal') matchRisk = res.includes('normal') || res.includes('bình thường') || res.includes('no dr');
            else if (riskFilter === 'Mild NPDR (Early Signs)') matchRisk = res.includes('mild') || res.includes('nhẹ');
            else if (riskFilter === 'Moderate NPDR') matchRisk = res.includes('moderate') || res.includes('trung bình');
            else if (riskFilter === 'Severe NPDR') matchRisk = res.includes('severe') || res.includes('nặng');
            else if (riskFilter === 'PDR') matchRisk = res.includes('pdr');
            return matchNameOrId && matchRisk;
        });
    }, [patientsData, searchTerm, riskFilter]);

    if (isLoading) return <div style={styles.loading}><FaStethoscope className="spin" size={40} color="#007bff"/></div>;

    return (
        <div style={styles.container} className="fade-in">
            {/* SIDEBAR (UPDATED STYLE) */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <FaUserMd size={26} color="#007bff" />
                        <span style={styles.logoText}>AURA DOCTOR</span>
                    </div>
                    <div style={styles.clinicName}>Dành cho Bác sĩ</div>
                </div>
                
                <nav style={styles.nav}>
                    {[
                        { id: 'home', icon: FaClipboardList, label: 'Tổng quan' },
                        { id: 'patients', icon: FaUsers, label: 'Bệnh nhân' },
                        { id: 'chat', icon: FaCommentDots, label: 'Tin nhắn' },
                        { id: 'reports', icon: FaFileAlt, label: 'Báo cáo' }
                    ].map((item) => (
                        <div 
                            key={item.id}
                            className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(item.id)}
                        >
                            <item.icon style={styles.menuIcon} /> 
                            {item.label}
                            {item.id === 'chat' && unreadMessagesCount > 0 && <span style={styles.badgeRed}>{unreadMessagesCount}</span>}
                        </div>
                    ))}
                </nav>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.headerRight}>
                         <div style={{position:'relative'}} ref={notificationRef}>
                            <motion.button 
                                whileTap={{ scale: 0.9 }}
                                style={styles.iconBtn} 
                                onClick={() => setShowNotifications(!showNotifications)}
                            >
                                <FaBell color="#64748b" size={20}/>
                                {totalPending > 0 && <span style={styles.bellBadge}></span>}
                            </motion.button>
                            <AnimatePresence>
                                {showNotifications && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                        style={styles.notificationDropdown}
                                    >
                                        <div style={styles.dropdownHeader}>Thông báo</div>
                                        <div style={{padding:'15px', color:'#666', fontSize:'13px'}}>
                                            {totalPending > 0 ? `Có ${totalPending} hồ sơ bệnh nhân rủi ro cao.` : "Không có thông báo mới."}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div style={{position:'relative'}} ref={profileRef}>
                            <div style={styles.profileBox} className="hover-lift" onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>{userName ? userName.charAt(0).toUpperCase() : 'D'}</div>
                                <span style={styles.userNameText}>{full_name || userName}</span>
                            </div>
                            <AnimatePresence>
                                {showUserMenu && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                        style={styles.dropdownMenu}
                                    >
                                        <div style={{padding:'15px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc'}}>
                                            <strong style={{color:'#334155', fontSize:'14px'}}>{full_name || userName}</strong>
                                            <br/>
                                            <small style={{color:'#64748b', fontSize:'12px'}}>{userRole}</small>
                                        </div>
                                        <button style={styles.dropdownItem} className="sidebar-item" onClick={() => navigate('/profile-dr')}>
                                            <FaUserMd style={{marginRight:8}}/> Hồ sơ cá nhân
                                        </button>
                                        <button style={{...styles.dropdownItem, color: '#ef4444'}} className="sidebar-item" onClick={handleLogout}>
                                            <FaSignOutAlt style={{marginRight:8}}/> Đăng xuất
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    <AnimatePresence mode="wait">
                        {/* --- TAB HOME --- */}
                        {activeTab === 'home' && (
                            <motion.div 
                                key="home" variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}
                                style={{display:'flex', flexDirection:'column', gap:'25px'}}
                            >
                                <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'25px'}}>
                                    {[
                                        { label: 'Bệnh nhân phụ trách', value: stats.patient_count, icon: FaUsers, color: '#3b82f6', bg: '#eff6ff' },
                                        { label: 'Cần xử lý', value: totalPending, icon: FaClipboardList, color: totalPending > 0 ? '#ef4444' : '#10b981', bg: totalPending > 0 ? '#fef2f2' : '#ecfdf5' },
                                        { label: 'Đã duyệt', value: stats.reviewed_count, icon: FaCheckDouble, color: '#f59e0b', bg: '#fffbeb' },
                                        { label: 'Độ chính xác AI', value: `${stats.ai_agreement_rate}%`, icon: FaRobot, color: '#6366f1', bg: '#eef2ff' }
                                    ].map((stat, idx) => (
                                        <motion.div 
                                            key={idx} 
                                            whileHover={{ y: -5 }}
                                            style={styles.statCard}
                                            className="slide-up-card"
                                        >
                                            <div style={{...styles.statIconBox, background: stat.bg}}>
                                                <stat.icon color={stat.color} size={24}/>
                                            </div>
                                            <div>
                                                <div style={styles.statLabel}>{stat.label}</div>
                                                <div style={{...styles.statValue, color: stat.color === '#ef4444' ? '#ef4444' : '#1e293b'}}>
                                                    {stat.value}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>

                                <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:'25px', alignItems:'stretch'}}>
                                    {/* CHART */}
                                    <div style={styles.chartCard} className="slide-up-card">
                                        <div style={styles.cardHeader}>
                                            <h3 style={styles.pageTitle}><FaChartBar style={{marginRight:10, color:'#007bff'}}/> Phân bố Rủi ro</h3>
                                        </div>
                                        <div style={styles.chartBody}>
                                            <div style={styles.yAxis}>
                                                <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
                                            </div>
                                            <div style={styles.plotArea}>
                                                <div style={styles.gridContainer}>
                                                    {[...Array(5)].map((_,i) => <div key={i} style={styles.gridLine}></div>)}
                                                </div>
                                                <div style={styles.barsContainer}>
                                                    {(() => {
                                                        const total = stats.patient_count || 1; 
                                                        const dataPoints = [
                                                            { label: 'Normal', val: stats.chart_data.safe, color1: '#22c55e', color2: '#4ade80' },
                                                            { label: 'Mild', val: stats.chart_data.mild, color1: '#eab308', color2: '#facc15' },
                                                            { label: 'Moderate', val: stats.chart_data.moderate, color1: '#f97316', color2: '#fb923c' },
                                                            { label: 'Severe', val: stats.chart_data.severe, color1: '#ef4444', color2: '#f87171' },
                                                            { label: 'PDR', val: stats.chart_data.pdr, color1: '#dc2626', color2: '#ef4444' },
                                                        ];
                                                        return dataPoints.map((dp, idx) => (
                                                            <div key={idx} style={styles.barColumn}>
                                                                <motion.div 
                                                                    initial={{ height: '0%' }}
                                                                    animate={{ height: `${Math.max((dp.val / total) * 100 * 0.9, 4)}%` }} 
                                                                    transition={{ duration: 1, delay: idx * 0.1, type: 'spring' }}
                                                                    style={{...styles.barFill, background: `linear-gradient(to top, ${dp.color1}, ${dp.color2})`}}
                                                                >
                                                                    <span style={styles.barValueTop}>{dp.val}</span>
                                                                </motion.div>
                                                                <div style={styles.xAxisLabel} title={dp.label}>{dp.label}</div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Action Panel */}
                                    <motion.div 
                                        className="slide-up-card"
                                        whileHover={{ scale: 1.01 }}
                                        style={{...styles.card, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'30px', textAlign:'center', height: 'auto'}}
                                    >
                                        <div className="icon-pulse" style={{width:'80px', height:'80px', borderRadius:'50%', background:'#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'20px'}}>
                                            <FaStethoscope size={40} color="#3b82f6"/>
                                        </div>
                                        <h3 style={{margin:'0 0 10px 0', color: '#1e293b'}}>Phiên làm việc</h3>
                                        <p style={{color:'#64748b', fontSize:'14px', marginBottom:'25px'}}>
                                            Bạn có <b style={{color:'#ef4444'}}>{totalPending}</b> hồ sơ rủi ro cao cần xem xét ưu tiên.
                                        </p>
                                        <button onClick={()=>setActiveTab('patients')} className="btn-primary-hover pulse-on-active" style={styles.primaryBtn}>Xem danh sách</button>
                                    </motion.div>
                                </div>
                                
                                <div style={styles.card} className="slide-up-card">
                                    <div style={styles.cardHeader}>
                                        <h3 style={styles.pageTitle}>
                                            <FaExclamationTriangle style={{marginRight:10, color:'#ef4444'}}/> 
                                            Hồ sơ cần chú ý (Servere NPDR và PDR): {alerts.length}
                                        </h3>
                                    </div>
                                    <table style={styles.table} className="table-hover">
                                        <thead>
                                            <tr>
                                                <th style={styles.th}>ID</th>
                                                <th style={styles.th}>Bệnh nhân</th>
                                                <th style={styles.th}>Giới tính</th>
                                                <th style={styles.th}>Chiều cao</th>
                                                <th style={styles.th}>BHYT</th>
                                                <th style={styles.th}>Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {patientsData
                                                .filter(p => alerts.some(alert => String(alert.patient_id) === String(p.id)))
                                                .map((p) => (
                                                <tr key={p.id} style={styles.tr}>
                                                    <td style={styles.td}>
                                                        <code style={{fontSize:'12px', color:'#64748b', background:'#f1f5f9', padding:'2px 6px', borderRadius:'4px'}}>
                                                            {p.id.substring(0, 8)}
                                                        </code>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{fontWeight:'bold', color:'#334155'}}>{p.full_name || p.userName}</div>
                                                        <div style={{fontSize:'12px', color:'#94a3b8'}}>{p.phone || p.email}</div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        {p.medical_info?.gender ? (
                                                            <span style={{textTransform:'capitalize'}}>{p.medical_info.gender}</span>
                                                        ) : (
                                                            <span style={{color:'#ccc'}}>--</span>
                                                        )}
                                                    </td>
                                                    <td style={styles.td}>
                                                        {p.medical_info?.height ? (
                                                            <span>{p.medical_info.height} cm</span>
                                                        ) : (
                                                            <span style={{color:'#ccc'}}>--</span>
                                                        )}
                                                    </td>
                                                    <td style={styles.td}>
                                                        {p.medical_info?.insurance_id ? (
                                                            <span style={{fontFamily:'monospace', color:'#007bff'}}>{p.medical_info.insurance_id}</span>
                                                        ) : (
                                                            <span style={{color:'#ccc', fontSize:'12px'}}>Chưa có</span>
                                                        )}
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{display:'flex', gap:'8px'}}>
                                                            <button onClick={() => {setActiveTab('chat'); openChat(p.id)}} className="btn-secondary-hover" style={styles.actionBtn}>Chat</button>
                                                            <button onClick={() => handleViewHistory(p.id, p.full_name)} className="btn-secondary-hover" style={styles.actionBtn}>Hồ sơ</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </motion.div>
                        )}

                        {/* --- TAB PATIENTS --- */}
                        {activeTab === 'patients' && (
                            <motion.div 
                                key="patients" variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}
                                style={styles.card} className="slide-up-card"
                            >
                                <div style={styles.cardHeader}>
                                    <h3 style={styles.pageTitle}><FaUsers style={{marginRight:10, color:'#007bff'}}/> Danh sách Bệnh nhân</h3>
                                    <div style={{display:'flex', gap:'15px'}}>
                                        <div style={styles.searchBox}>
                                            <FaSearch color="#94a3b8" />
                                            <input style={styles.searchInput} placeholder="Tìm tên/ID..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
                                        </div>
                                        <select style={styles.selectInput} value={riskFilter} onChange={e=>setRiskFilter(e.target.value)}>
                                            <option value="ALL">Tất cả mức độ</option>
                                            <option value="PDR">PDR (Nguy hiểm)</option>
                                            <option value="Severe NPDR">Severe NPDR</option>
                                            <option value="Moderate NPDR">Moderate NPDR</option>
                                            <option value="Mild NPDR (Early Signs)">Mild NPDR</option>
                                            <option value="Normal">Normal</option>
                                        </select>
                                    </div>
                                </div>
                                <table style={styles.table} className="table-hover">
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>ID Bệnh nhân</th>
                                            <th style={styles.th}>Bệnh nhân</th>
                                            <th style={styles.th}>Thông tin y tế</th>
                                            <th style={styles.th}>Kết quả gần nhất</th>
                                            <th style={styles.th}>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPatients.map((p) => (
                                            <tr key={p.id} style={styles.tr}>
                                                <td style={styles.td}><code style={{fontSize:'12px', color:'#64748b'}}>{p.id.substring(0, 8)}...</code></td>
                                                <td style={styles.td}>
                                                    <b>{p.full_name || p.userName}</b>
                                                    <br/><small style={{color:'#94a3b8'}}>{p.phone || p.email}</small>
                                                </td>
                                                <td style={styles.td}>
                                                    {p.medical_info ? (
                                                        <div style={{fontSize: '13px'}}>
                                                            <span>GT: {p.medical_info.gender || '--'}</span> | 
                                                            <span> Cao: {p.medical_info.height}cm</span><br/>
                                                            <small>BHYT: {p.medical_info.insurance_id || 'Chưa cập nhật'}</small>
                                                        </div>
                                                    ) : 'N/A'}
                                                </td>
                                                <td style={styles.td}>
                                                    {p.latest_scan?.ai_result ? (
                                                            <span style={{
                                                            color: p.latest_scan.ai_result.toLowerCase().includes('nặng') ? '#dc2626' : 
                                                                    p.latest_scan.ai_result.toLowerCase().includes('trung bình') ? '#ea580c' : '#16a34a',
                                                            fontWeight:'700'
                                                            }}>{p.latest_scan.ai_result}</span>
                                                    ) : <span style={{color:'#94a3b8'}}>--</span>}
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{display:'flex', gap:'8px'}}>
                                                        <button onClick={() => {setActiveTab('chat'); openChat(p.id)}} className="btn-secondary-hover" style={styles.actionBtn}>Chat</button>
                                                        <button onClick={() => handleViewHistory(p.id, p.full_name)} className="btn-secondary-hover" style={styles.actionBtn}>Hồ sơ</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </motion.div>
                        )}

                        {/* --- TAB CHAT --- */}
                        {activeTab === 'chat' && (
                            <motion.div 
                                key="chat" variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}
                                style={styles.messengerCard} className="slide-up-card"
                            >
                                <div style={styles.chatListPanel}>
                                    <div style={styles.chatHeaderLeft}><h3 style={{margin:0, fontSize:'18px', color:'#1e293b'}}>Tư vấn Trực tuyến</h3></div>
                                    <div style={styles.chatListScroll}>
                                        {chatData.map(c => (
                                            <div 
                                                key={c.id} onClick={()=>openChat(c.id)} 
                                                className="chat-item-hover"
                                                style={{...styles.chatListItem, background: selectedChatId === c.id ? '#eff6ff' : 'transparent'}}
                                            >
                                                <div style={styles.avatarLarge}>{(c.display_name||c.sender).charAt(0).toUpperCase()}</div>
                                                <div style={{flex:1, overflow:'hidden'}}>
                                                    <div style={{fontWeight: c.unread?'700':'500', fontSize:'15px', color:'#334155'}}>{c.display_name||c.sender}</div>
                                                    <div style={{fontSize:'13px', color: c.unread?'#0f172a':'#64748b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{c.preview}</div>
                                                </div>
                                                {c.unread && <div style={styles.unreadDot}></div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={styles.chatWindowPanel}>
                                    {selectedChatId ? (
                                        <>
                                            <div style={styles.chatWindowHeader}>
                                                <div style={styles.avatarMedium}>{(chatData.find(c=>c.id===selectedChatId)?.display_name || '').charAt(0)}</div>
                                                <h4 style={{margin:0, color:'#1e293b'}}>{chatData.find(c=>c.id===selectedChatId)?.display_name}</h4>
                                            </div>
                                            <div style={styles.messagesBody}>
                                                {currentMessages.map((m, i) => (
                                                    <div 
                                                        key={i} className="pop-in"
                                                        style={{...styles.messageRow, justifyContent: m.is_me ? 'flex-end' : 'flex-start'}}
                                                    >
                                                        {!m.is_me && (
                                                            <div style={{width:'32px', height:'32px', borderRadius:'50%', background:'#e2e8f0', marginRight:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', alignSelf: 'flex-end', marginBottom: '20px', color:'#64748b'}}>
                                                                {(chatData.find(c=>c.id===selectedChatId)?.display_name || '').charAt(0)}
                                                            </div>
                                                        )}
                                                        <div style={{display:'flex', flexDirection:'column', alignItems: m.is_me ? 'flex-end' : 'flex-start', maxWidth:'70%'}}>
                                                            <div style={m.is_me ? styles.bubbleMe : styles.bubbleOther}>{m.content}</div>
                                                            <div style={{display:'flex', alignItems:'center', gap:'4px', marginTop:'4px', marginBottom:'10px', fontSize:'11px', color:'#94a3b8', paddingRight: m.is_me ? '5px' : '0', paddingLeft: !m.is_me ? '5px' : '0'}}>
                                                                <span>{m.time}</span>
                                                                {m.is_me && (
                                                                    <span style={{marginLeft:'2px', display:'flex', alignItems:'center'}}>
                                                                        {m.is_read ? <span title="Đã xem" style={{color:'#007bff', display:'flex'}}><FaCheckDouble size={10}/></span> : <span title="Đã gửi" style={{color:'#cbd5e1'}}><FaCheck size={10}/></span>}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                <div ref={messagesEndRef}/>
                                            </div>
                                            <form onSubmit={handleSendMessage} style={styles.chatInputArea}>
                                                <input className="input-focus" style={styles.messengerInput} value={newMessageText} onChange={e=>setNewMessageText(e.target.value)} placeholder="Nhập tin nhắn..."/>
                                                <button className="btn-icon-hover" type="submit" style={{border:'none', background:'none', cursor:'pointer', padding:'5px', width: '150px', height: '40px'}}><FaPaperPlane color="#007bff" size={15}/></button>
                                            </form>
                                        </>
                                    ) : (
                                        <div style={styles.emptyChatState}><div className="icon-pulse" style={{padding:'20px', background:'#f1f5f9', borderRadius:'50%', marginBottom:'20px'}}><FaCommentDots size={40} color="#007bff"/></div><p>Chọn bệnh nhân để chat</p></div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {/* --- TAB REPORTS --- */}
                        {activeTab === 'reports' && (
                            <motion.div 
                                key="reports" variants={pageVariants} initial="initial" animate="in" exit="out" transition={pageTransition}
                                style={{display:'flex', flexDirection:'column', gap:'25px'}}
                            >
                                <div style={styles.reportBox} className="slide-up-card">
                                    <h3 style={{margin:'0 0 10px 0', color:'#007bff'}}>Gửi báo cáo sai lệch AI</h3>
                                    <p style={{fontSize:'14px', color:'#475569', margin:0}}>Nếu phát hiện AI chẩn đoán sai, hãy vào <strong>Bệnh nhân &rarr; Chi tiết &rarr; Báo lỗi</strong> để báo cáo</p>
                                </div>
                                <div style={styles.card} className="slide-up-card">
                                    <div style={styles.cardHeader}>
                                        <h3 style={{margin:0, fontSize:'18px', display:'flex', alignItems:'center', color:'#1e293b'}}><FaChartBar style={{marginRight:10, color:'#007bff'}}/> Lịch sử báo cáo</h3>
                                        <button onClick={fetchMyReports} className="btn-secondary-hover" style={styles.btnSecondary}><FaChartBar style={{marginRight:5}}/> Làm mới</button>
                                    </div>
                                    <div style={{padding:'0'}}>
                                        <table style={styles.table} className="table-hover">
                                            <thead>
                                                <tr>
                                                    <th style={styles.th}>Thời gian</th><th style={styles.th}>Ảnh Scan</th><th style={styles.th}>Nội dung báo cáo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loadingReports ? <tr><td colSpan={3} style={styles.emptyCell}>Đang tải dữ liệu...</td></tr> : myReports.length === 0 ? <tr><td colSpan={3} style={styles.emptyCell}>Bạn chưa gửi báo cáo nào.</td></tr> : myReports.map(report => (
                                                    <tr key={report.id} style={styles.tr}>
                                                        <td style={styles.td}>{new Date(report.created_at).toLocaleDateString('vi-VN')}<br/><small style={{color:'#94a3b8'}}>{new Date(report.created_at).toLocaleTimeString('vi-VN')}</small></td>
                                                        <td style={styles.td}>{report.image_url ? <a href={report.image_url} target="_blank" rel="noreferrer"><img src={report.image_url} alt="Scan" className="hover-lift" style={{width:'50px', height:'50px', objectFit:'cover', borderRadius:'8px', border:'1px solid #e2e8f0'}}/></a> : <span style={{color:'#ccc'}}>Không có ảnh</span>}</td>
                                                        <td style={styles.td}><div style={{fontWeight:'700', color:'#334155'}}>BS: {report.doctor_confirm}</div><div style={{color:'#64748b', marginTop:'4px', fontSize:'13px'}}>{report.report_content}</div><div style={{fontSize:'12px', color:'#94a3b8', marginTop:'4px'}}>AI: {report.ai_result}</div></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* MODAL BÁO CÁO */}
                    <AnimatePresence>
                        {showReportModal && (
                            <div style={styles.modalOverlay}>
                                <motion.div 
                                    variants={modalVariants} initial="hidden" animate="visible" exit="exit"
                                    style={styles.modalContent}
                                >
                                    <div style={styles.modalHeader}>
                                        <h3 style={{margin:0, color:'#1e293b'}}>📝 Chẩn đoán & Huấn luyện AI</h3>
                                        <button onClick={()=>setShowReportModal(false)} style={styles.closeBtn} className="btn-icon-hover"><FaTimes/></button>
                                    </div>
                                    <form onSubmit={submitReport} style={{padding:'25px'}}>
                                        <div style={{marginBottom:'20px'}}>
                                            <label style={styles.label}>Chọn Bệnh nhân:</label>
                                            <select style={styles.inputForm} className="input-focus" value={reportForm.patientId} onChange={e => {
                                                const selectedId = e.target.value;
                                                const selectedPatient = patientsData.find(p => p.id === parseInt(selectedId));
                                                setReportForm({ ...reportForm, patientId: selectedId, aiResult: selectedPatient?.latest_scan?.ai_result || 'Chưa có kết quả AI' });
                                            }} required>
                                                <option value="">-- Chọn hồ sơ --</option>
                                                {patientsData.map(p => (<option key={p.id} value={p.id}>{p.full_name || p.userName}</option>))}
                                            </select>
                                        </div>
                                        {reportForm.patientId && (
                                            <div style={{marginBottom:'20px', background:'#eff6ff', padding:'15px', borderRadius:'8px', border:'1px dashed #3b82f6'}}>
                                                <div style={{fontSize:'12px', color:'#64748b', marginBottom:'4px'}}>🤖 AI Chẩn đoán:</div>
                                                <div style={{fontWeight:'bold', color:'#2563eb', fontSize:'16px'}}>{reportForm.aiResult}</div>
                                            </div>
                                        )}
                                        <div style={{marginBottom:'20px'}}>
                                            <label style={styles.label}>Đánh giá AI:</label>
                                            <div style={{display:'flex', gap:'20px', marginTop:'8px'}}>
                                                <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer'}}><input type="radio" name="accuracy" value="CORRECT" checked={reportForm.accuracy === 'CORRECT'} onChange={()=>setReportForm({...reportForm, accuracy:'CORRECT'})} /> <span style={{color:'#16a34a', fontWeight:'600'}}>Chính xác</span></label>
                                                <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer'}}><input type="radio" name="accuracy" value="INCORRECT" checked={reportForm.accuracy === 'INCORRECT'} onChange={()=>setReportForm({...reportForm, accuracy:'INCORRECT'})} /> <span style={{color:'#dc2626', fontWeight:'600'}}>Sai lệch</span></label>
                                            </div>
                                        </div>
                                        <div style={{marginBottom:'20px'}}>
                                            <label style={styles.label}>Chẩn đoán của Bác sĩ (Ground Truth):</label>
                                            <input style={styles.inputForm} className="input-focus" placeholder="Ví dụ: Viêm da cơ địa giai đoạn 2..." value={reportForm.doctorDiagnosis} onChange={e => setReportForm({...reportForm, doctorDiagnosis: e.target.value})} required />
                                        </div>
                                        <div style={{marginBottom:'25px'}}>
                                            <label style={styles.label}>Ghi chú chi tiết / Đề xuất:</label>
                                            <textarea style={{...styles.inputForm, height:'100px'}} className="input-focus" placeholder="Mô tả chi tiết để đội ngũ kỹ thuật cải thiện model..." value={reportForm.notes} onChange={e => setReportForm({...reportForm, notes: e.target.value})}/>
                                        </div>
                                        <div style={{display:'flex', justifyContent:'flex-end', gap:'15px'}}>
                                            <button type="button" onClick={()=>setShowReportModal(false)} className="btn-secondary-hover" style={styles.actionBtn}>Hủy</button>
                                            <button type="submit" className="btn-primary-hover pulse-on-active" style={styles.primaryBtnSm}>Gửi Báo cáo</button>
                                        </div>
                                    </form>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* MODAL LỊCH SỬ */}
                    <AnimatePresence>
                        {showHistoryModal && (
                            <div style={styles.modalOverlay}>
                                <motion.div 
                                    variants={modalVariants} initial="hidden" animate="visible" exit="exit"
                                    style={styles.modalContent}
                                >
                                    <div style={styles.modalHeader}><h3>Hồ sơ: {selectedPatientName}</h3><button onClick={()=>setShowHistoryModal(false)} className="btn-icon-hover" style={styles.closeBtn}><FaTimes/></button></div>
                                    <div style={{padding:'0', maxHeight:'60vh', overflowY:'auto'}}>
                                        {historyLoading ? <div style={{textAlign:'center', padding:'30px'}}>Đang tải...</div> : (
                                            <table style={styles.table} className="table-hover">
                                                <thead><tr><th style={styles.th}>Ngày</th><th style={styles.th}>Kết quả</th><th style={styles.th}>Chi tiết</th></tr></thead>
                                                <tbody>
                                                    {historyRecords.length > 0 ? historyRecords.map((r,i)=>(
                                                        <tr key={i} style={styles.tr}>
                                                            <td style={styles.td}>{r.date}</td>
                                                            <td style={styles.td}><b style={{color: (r.result||"").includes('Nặng')?'#dc2626':'#16a34a'}}>{r.result}</b></td>
                                                            <td style={styles.td}><button onClick={()=>navigate(`/doctor/analysis/${r.id}`)} className="btn-secondary-hover" style={styles.actionBtn}>Xem</button></td>
                                                        </tr>
                                                    )) : <tr><td colSpan={3} style={styles.emptyCell}>Chưa có lịch sử khám</td></tr>}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (MATCHED TO USER DASHBOARD) ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', fontSize:'18px', backgroundColor: '#f4f6f9' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
    // SIDEBAR
    sidebar: { width: '270px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '4px 0 15px rgba(0,0,0,0.02)', zIndex: 10 },
    sidebarHeader: { padding: '25px 25px', borderBottom: '1px solid #f1f5f9' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom: '5px' },
    logoText: { fontWeight: '800', fontSize: '20px', color: '#1e293b', letterSpacing: '-0.5px' },
    clinicName: { fontSize:'13px', color:'#64748b', marginLeft:'36px', fontWeight: 500 },
    nav: { flex: 1, padding: '25px 0', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' },
    menuIcon: { marginRight: '14px', fontSize: '18px' },
    badgeRed: { marginLeft: 'auto', backgroundColor: '#ef4444', color: 'white', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' },
    sidebarFooter: { padding: '25px', borderTop: '1px solid #f1f5f9' },
    logoutBtn: { width: '100%', padding: '12px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '10px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' },

    // HEADER & MAIN
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '75px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 40px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '25px' },
    profileBox: { display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', padding: '6px 12px', borderRadius: '30px', transition: 'background 0.2s' },
    avatarCircle: { width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff, #0056b3)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '15px', fontWeight:'600', boxShadow: '0 4px 8px rgba(0,123,255,0.2)' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    iconBtn: { background:'none', border:'none', cursor:'pointer', position:'relative', padding:'8px', borderRadius: '50%', transition: 'background 0.2s' },
    bellBadge: { position: 'absolute', top: '5px', right: '5px', width: '8px', height: '8px', backgroundColor: '#ef4444', borderRadius: '50%', border: '2px solid #fff' },
    
    contentBody: { padding: '30px 40px', flex: 1, overflowY: 'auto', position: 'relative' },

    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', overflow:'hidden', marginBottom:'25px', transition: 'transform 0.3s' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background: '#fff' },
    pageTitle: { fontSize: '18px', margin: 0, display:'flex', alignItems:'center', color: '#1e293b', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '15px 25px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize:'12px', textTransform:'uppercase', fontWeight:'700', background:'#f8fafc', letterSpacing: '0.5px' },
    tr: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' },
    td: { padding: '18px 25px', verticalAlign: 'middle', color:'#334155' },
    emptyCell: { textAlign: 'center', padding: '50px', color: '#94a3b8', fontStyle: 'italic' },
    
    statCard: { 
        background:'white', padding:'25px', borderRadius:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', 
        display:'flex', alignItems:'center', gap:'20px', border:'1px solid #f1f5f9', flex: 1, cursor: 'default' 
    },
    statIconBox: { width:'56px', height:'56px', borderRadius:'14px', display:'flex', alignItems:'center', justifyContent:'center' },
    statLabel: { fontSize:'14px', color:'#64748b', marginBottom:'4px', fontWeight: 600 },
    statValue: { fontSize:'26px', fontWeight:'800', color:'#1e293b' },
    
    chartCard: { background:'white', borderRadius:'16px', boxShadow:'0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', display:'flex', flexDirection:'column', height: '400px', position: 'relative', overflow:'hidden' },
    chartBody: { display: 'flex', padding: '25px', flex: 1, alignItems: 'stretch', position: 'relative' },
    yAxis: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '15px', borderRight: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '11px', textAlign: 'right', minWidth: '40px', paddingBottom: '30px' },
    plotArea: { flex: 1, position: 'relative', marginLeft: '15px', display: 'flex', flexDirection: 'column' },
    gridContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 30, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 0 },
    gridLine: { width: '100%', borderBottom: '1px dashed #e2e8f0', height: '0px' },
    barsContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', paddingBottom: '30px' },
    barColumn: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', width: '12%', position: 'relative' },
    barFill: { width: '100%', borderRadius: '6px 6px 0 0', position: 'relative', minHeight: '4px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' },
    barValueTop: { position: 'absolute', top: '-25px', width: '100%', textAlign: 'center', fontSize: '13px', fontWeight: 'bold', color: '#334155' },
    xAxisLabel: { position: 'absolute', bottom: '-35px', width: '150%', textAlign: 'center', fontSize: '12px', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' },

    primaryBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight:'600', boxShadow: '0 4px 12px rgba(0,123,255,0.2)', transition: 'all 0.2s', fontSize: '14px' },
    primaryBtnSm: { background: '#007bff', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center', fontWeight: '600', transition: 'background 0.2s' },
    btnSecondary: { background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center', fontWeight: '600' },
    actionBtn: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#007bff', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s' },

    searchBox: { display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '8px 14px', border: '1px solid transparent' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '8px', width: '180px', fontSize:'14px', color:'#333' },
    selectInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline:'none', background:'white', color:'#333' },

    messengerCard: { display: 'flex', height: 'calc(100vh - 150px)', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', overflow: 'hidden' },
    chatListPanel: { width: '340px', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' },
    chatHeaderLeft: { padding: '25px', borderBottom: '1px solid #f1f5f9', background:'#fff' },
    chatListScroll: { flex: 1, overflowY: 'auto', padding: '15px' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', gap: '15px', marginBottom: '5px' },
    avatarLarge: { width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#4338ca', flexShrink: 0 },
    unreadDot: { width:'10px', height:'10px', backgroundColor: '#007bff', borderRadius: '50%', boxShadow: '0 0 0 2px #fff' },

    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor:'white' },
    chatWindowHeader: { padding: '15px 25px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '15px', background: '#fff' },
    avatarMedium: { width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b', fontSize:'15px' },
    messagesBody: { flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff' },
    chatInputArea: { padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', borderTop: '1px solid #f1f5f9', background: '#fff' },
    messengerInput: { flex: 1, backgroundColor: '#f1f5f9', border: '1px solid transparent', borderRadius: '25px', padding: '12px 20px', fontSize: '14px', outline: 'none', transition: 'all 0.2s', color: '#333' },
    emptyChatState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center' },
    
    messageRow: { display: 'flex', marginBottom: '8px', width: '100%' },
    bubbleMe: { padding: '12px 18px', borderRadius: '20px 20px 4px 20px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', maxWidth: '75%', width:'fit-content', fontSize: '15px', lineHeight: '1.5', boxShadow: '0 2px 5px rgba(0,123,255,0.2)', wordWrap: 'break-word' as 'break-word' },
    bubbleOther: { padding: '12px 18px', borderRadius: '20px 20px 20px 4px', backgroundColor: '#f1f5f9', color: '#1e293b', maxWidth: '75%', width:'fit-content', fontSize: '15px', lineHeight: '1.5', wordWrap: 'break-word' as 'break-word' },
    
    notificationDropdown: { position: 'absolute', top: '55px', right: '-10px', width: '320px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1100, border:'1px solid #f1f5f9', overflow: 'hidden' },
    dropdownMenu: { position: 'absolute', top: '65px', right: '0', width: '240px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #f1f5f9', overflow: 'hidden' },
    dropdownHeader: { padding: '15px', background:'#f8fafc', fontSize:'14px', fontWeight:'700', borderBottom:'1px solid #f1f5f9', color:'#334155' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', fontSize:'14px', transition: 'background 0.2s' },
    
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.4)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000, backdropFilter: 'blur(3px)' },
    modalContent: { background:'white', padding:'0', borderRadius:'16px', width:'600px', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', overflow:'hidden' },
    modalHeader: { padding:'20px 25px', background:'#fff', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' },
    closeBtn: { border:'none', background:'none', fontSize:'18px', cursor:'pointer', color:'#94a3b8', padding:'5px' },
    reportBox: { background:'#eff6ff', padding:'25px', borderRadius:'16px', boxShadow:'0 4px 15px rgba(0,123,255,0.05)', border: '1px solid #dbeafe' },
    label: { display:'block', marginBottom:'8px', fontSize:'14px', fontWeight:'600', color:'#334155' },
    inputForm: { width:'100%', padding:'12px 16px', borderRadius:'8px', border:'1px solid #cbd5e1', fontSize:'14px', outline:'none', transition: 'all 0.2s', boxSizing: 'border-box' as 'border-box', background:'#fff' },
};

// --- GLOBAL CSS (Inject same as User Dashboard) ---
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
.chat-item-hover:hover { background-color: #f8fafc !important; }
.table-hover tbody tr:hover { background-color: #f8fbff !important; }

.icon-pulse { animation: pulse 2s infinite; }

::-webkit-scrollbar { width: 4px; } 
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default DashboardDr;