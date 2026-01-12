import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaUserMd, FaSignOutAlt, FaSearch
} from 'react-icons/fa';

// 1. CẤU HÌNH HẰNG SỐ
const API_BASE = 'http://localhost:8000/api/v1';

const DashboardDr: React.FC = () => {
    const navigate = useNavigate();

    // --- STATE DỮ LIỆU ---
    const [userName, setUserName] = useState<string>('');    
    const [isLoading, setIsLoading] = useState(true);
    
    // Dữ liệu chính
    const [patientsData, setPatientsData] = useState<any[]>([]); 
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const [searchTerm, setSearchTerm] = useState(''); // State tìm kiếm
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // --- STATE UI ---
    const [activeTab, setActiveTab] = useState<string>('home');
    
    // --- STATE MODAL & FILTER ---
    const [showReportModal, setShowReportModal] = useState(false);

    // Form báo cáo
    const [reportForm, setReportForm] = useState({
        patientId: '',
        aiResult: '', 
        doctorDiagnosis: '',
        notes: ''
    });

    // --- HELPER FETCH (Tái sử dụng code fetch) ---
    const authFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...options.headers,
                }
            });
            if (res.status === 401) {
                localStorage.clear();
                navigate('/login');
                return null;
            }
            return res;
        } catch (error) {
            console.error(`Error fetching ${endpoint}:`, error);
            return null;
        }
    }, [navigate]);

    // --- 1. INIT DATA ---
    useEffect(() => {
        const initData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            const userRes = await authFetch('/users/me');
            if (!userRes || !userRes.ok) return;

            const userData = await userRes.json();
            const info = userData.user_info || userData;
            
            if (info.role !== 'doctor') { 
                alert("Tài khoản không có quyền Bác sĩ"); 
                localStorage.clear(); navigate('/login'); 
                return; 
            }

            setUserName(info.username || info.userName);

            // Load danh sách bệnh nhân
            const patientsRes = await authFetch('/doctor/my-patients');
            if (patientsRes && patientsRes.ok) {
                const data = await patientsRes.json();
                setPatientsData(data.patients || []);
            }
            setIsLoading(false);
        };
        initData();
    }, [authFetch, navigate]);

    // --- 2. LOGIC CHAT ---
    const fetchChatList = useCallback(async () => {
        const res = await authFetch('/chats');
        if (res && res.ok) {
            const data = await res.json();
            const serverChats = data.chats || [];
            
            // Map thêm thông tin từ danh sách bệnh nhân để hiển thị đẹp hơn
            const enrichedChats = serverChats.map((sChat: any) => {
                const patient = patientsData.find(p => String(p.id) === String(sChat.id));
                const rawName = sChat.full_name || patient?.full_name || sChat.sender || "Unknown";
                return {
                    ...sChat,
                    display_name: rawName,
                    avatar_letter: rawName[0].toUpperCase(),
                    preview: sChat.last_message || "Hình ảnh/File đính kèm"
                };
            });
            setChatData(enrichedChats);
        }
    }, [authFetch, patientsData]);

    const fetchMessageHistory = useCallback(async (partnerId: string) => {
        const res = await authFetch(`/chat/history/${partnerId}`);
        if (res && res.ok) {
            const data = await res.json();
            return data.messages || [];
        }
        return [];
    }, [authFetch]);

    // Auto scroll xuống cuối khi có tin nhắn mới
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [currentMessages]);

    // Polling tin nhắn (3s/lần)
    useEffect(() => {
        if (activeTab !== 'chat') return;
        fetchChatList(); 
        
        const interval = setInterval(async () => {
            await fetchChatList();
            if (selectedChatId) {
                const msgs = await fetchMessageHistory(selectedChatId);
                // Chỉ cập nhật nếu số lượng tin nhắn thay đổi hoặc tin cuối khác nhau
                setCurrentMessages(prev => {
                    if (msgs.length !== prev.length) return msgs;
                    if (msgs.length > 0 && prev.length > 0 && msgs[msgs.length-1].id !== prev[prev.length-1].id) return msgs;
                    return prev;
                });
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [activeTab, selectedChatId, fetchChatList, fetchMessageHistory]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;

        const textToSend = newMessageText;
        setNewMessageText(''); 

        // Optimistic UI update (Hiện tin nhắn ngay lập tức)
        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}),
            is_read: false
        };
        setCurrentMessages(prev => [...prev, tempMsg]);

        await authFetch('/chat/send', {
            method: 'POST',
            body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
        });
    };

    const openChat = async (partnerId: string) => {
        setSelectedChatId(partnerId);
        const msgs = await fetchMessageHistory(partnerId);
        setCurrentMessages(msgs);
        
        // Đánh dấu đã đọc
        await authFetch(`/chat/read/${partnerId}`, { method: 'PUT' });
        
        // Cập nhật lại list để mất dấu chấm đỏ
        fetchChatList();
    };

    // --- 3. LOGIC BÁO CÁO ---
    const handleOpenReport = (patientId?: string) => {
        const patient = patientsData.find(p => String(p.id) === String(patientId));
        // Safe check data
        const aiRes = patient?.latest_scan?.ai_result || 'Chưa có kết quả AI';
        
        setReportForm({
            patientId: patientId || '', 
            aiResult: aiRes, 
            doctorDiagnosis: '',
            notes: ''
        });
        setShowReportModal(true);
    };

    const submitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        const selectedP = patientsData.find(p => String(p.id) === String(reportForm.patientId));
        const recordId = selectedP?.latest_scan?.record_id;

        if (!recordId) {
            alert("Bệnh nhân này chưa có hồ sơ khám bệnh để chẩn đoán!");
            return;
        }

        const res = await authFetch(`/doctor/records/${recordId}/diagnose`, {
            method: 'PUT',
            body: JSON.stringify({
                doctor_diagnosis: reportForm.doctorDiagnosis,
                doctor_notes: reportForm.notes
            })
        });

        if (res && res.ok) {
            alert("Đã lưu chẩn đoán!");
            setShowReportModal(false);
            // Refresh lại danh sách bệnh nhân
            const pRes = await authFetch('/doctor/my-patients');
            if (pRes) {
                const data = await pRes.json();
                setPatientsData(data.patients || []);
            }
        } else {
            alert("Lỗi khi lưu chẩn đoán");
        }
    };

    const handleLogout = () => { localStorage.clear(); navigate('/login'); };

    // --- 4. DATA PROCESSING ---
    // Lọc hồ sơ nguy hiểm
    const pendingRecords = patientsData.filter(p => {
        if (!p.latest_scan) return false;
        const status = (p.latest_scan.ai_analysis_status || "").toUpperCase();
        const res = (p.latest_scan.ai_result || "").toLowerCase();
        
        // Logic xác định nguy hiểm: Hoàn thành VÀ (chứa từ khóa nặng/pdr/...)
        const isHighRisk = res.includes('nặng') || res.includes('severe') || res.includes('moderate') || res.includes('pdr');
        return status === 'COMPLETED' && isHighRisk;
    }).map(p => ({ 
        id: p.latest_scan.record_id, 
        patientId: p.id,
        patientName: p.full_name || p.userName, 
        aiResult: p.latest_scan.ai_result
    }));

    // Lọc chat theo từ khóa tìm kiếm
    const filteredChatData = chatData.filter(c => 
        c.display_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (isLoading) return <div style={styles.loading}>Đang tải dữ liệu...</div>;

    // --- RENDER ---
    return (
        <div style={styles.container}>
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
<<<<<<< HEAD
                        {/* Đổi màu icon sang xanh #007bff cho nổi trên nền trắng */}
                        <FaUserMd size={24} color="#007bff" />
                        <span style={styles.logoText}>AURA DOCTOR</span>
=======
                        <FaUserMd size={24} color="#3498db" />
                        <span style={styles.logoText}>Doctor Portal</span>
>>>>>>> 99c081f04a8c804321c9e748481d1ffd66bb4169
                    </div>
                    {/* Thêm dòng subtitle */}
                    <div style={styles.clinicName}>Dành cho Bác sĩ</div>
                </div>
                <nav style={styles.nav}>
                    <div style={activeTab === 'home' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('home')}>
                        Trang chủ
                    </div>
                    <div style={activeTab === 'chat' ? styles.menuItemActive : styles.menuItem} onClick={() => setActiveTab('chat')}>
                        Tin nhắn {chatData.some(c => c.unread) && <span style={styles.badge}>New</span>}
                    </div>
                </nav>
                <div style={styles.sidebarFooter}>
                    <button onClick={handleLogout} style={styles.logoutBtn}><FaSignOutAlt style={{marginRight:5}}/> Đăng xuất</button>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                <header style={styles.header}>
<<<<<<< HEAD
                    <div style={styles.headerRight}>
                         <div style={{position:'relative'}} ref={notificationRef}>
                            <button style={styles.iconBtn} onClick={() => setShowNotifications(!showNotifications)}>
                                <FaBell color="#555" size={18}/>
                                {totalPending > 0 && <span style={styles.bellBadge}></span>}
                            </button>
                            {showNotifications && (
                                <div style={styles.notificationDropdown}>
                                    <div style={styles.dropdownHeader}>Thông báo</div>
                                    <div style={{padding:'15px', color:'#666', fontSize:'13px'}}>
                                        {totalPending > 0 ? `Có ${totalPending} hồ sơ bệnh nhân rủi ro cao.` : "Không có thông báo mới."}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{position:'relative'}} ref={profileRef}>
                            <div style={styles.profileBox} onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>{userName.charAt(0).toUpperCase()}</div>
                                <span style={styles.userNameText}>{full_name}</span>
                            </div>
                            {showUserMenu && (
                                <div style={styles.dropdownMenu}>
                                    {/* Thêm phần Header hiển thị tên và quyền giống bên Bệnh nhân */}
                                    <div style={{padding:'15px', borderBottom:'1px solid #eee'}}>
                                        <strong style={{color:'#333', fontSize:'14px'}}>{full_name || userName}</strong>
                                        <br/>
                                        <small style={{color:'#666', fontSize:'12px'}}>{userRole}</small>
                                    </div>

                                    {/* Các nút chức năng */}
                                    <button style={styles.dropdownItem} onClick={() => navigate('/profile-dr')}>
                                        <FaUserMd style={{marginRight:8}}/> Hồ sơ cá nhân
                                    </button>
                                    <button style={{...styles.dropdownItem, color: '#dc3545'}} onClick={handleLogout}>
                                        <FaSignOutAlt style={{marginRight:8}}/> Đăng xuất
                                    </button>
                                </div>
                            )}
                        </div>
=======
                    <div style={styles.headerLeft}>
                        <h3>Xin chào, BS. {userName}</h3>
>>>>>>> 99c081f04a8c804321c9e748481d1ffd66bb4169
                    </div>
                </header>
                
                <div style={styles.contentBody}>
                    {activeTab === 'home' && (
                        <div>
                            {/* Stats Cards có thể thêm ở đây */}
                            <div style={styles.card}>
                                <div style={styles.cardHeader}>
                                    <h4 style={styles.pageTitle}>⚠️ Hồ sơ cần chẩn đoán ({pendingRecords.length})</h4>
                                </div>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Bệnh nhân</th>
                                            <th style={styles.th}>Kết quả AI</th>
                                            <th style={styles.th}>Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingRecords.map((item, idx) => (
                                            <tr key={idx} style={styles.tr}>
                                                <td style={styles.td}>{item.patientName}</td>
                                                <td style={{...styles.td, color:'#e74c3c', fontWeight:'bold'}}>{item.aiResult}</td>
                                                <td style={styles.td}>
                                                    <div style={{display:'flex', gap: 10}}>
                                                        <button style={styles.actionBtn} onClick={() => navigate(`/doctor/analysis/${item.id}`)}>Xem ảnh</button>
                                                        <button style={styles.primaryBtnSm} onClick={() => handleOpenReport(String(item.patientId))}>Chẩn đoán</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {pendingRecords.length === 0 && (
                                            <tr><td colSpan={3} style={styles.emptyCell}>Không có hồ sơ nguy hiểm cần xử lý</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'chat' && (
                        <div style={styles.messengerCard}>
                            {/* LIST CHAT */}
                            <div style={styles.chatListPanel}>
                                <div style={styles.chatHeaderLeft}>
                                    <div style={styles.searchBox}>
                                        <FaSearch color="#999" />
                                        <input 
                                            placeholder="Tìm bệnh nhân..." 
                                            style={styles.searchInput}
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div style={styles.chatListScroll}>
                                    {filteredChatData.map(chat => (
                                        <div key={chat.id} 
                                            onClick={() => openChat(chat.id)}
                                            style={{
                                                ...styles.chatListItem,
                                                background: selectedChatId === chat.id ? '#e6f7ff' : 'transparent'
                                            }}
                                        >
                                            <div style={styles.avatarLarge}>{chat.avatar_letter}</div>
                                            <div style={{flex:1}}>
                                                <div style={{fontWeight: chat.unread ? 'bold' : 'normal', color: '#333'}}>{chat.display_name}</div>
                                                <div style={{fontSize:'12px', color:'#777'}}>{chat.preview}</div>
                                            </div>
                                            {chat.unread && <div style={styles.unreadDot}></div>}
                                        </div>
                                    ))}
                                    {filteredChatData.length === 0 && (
                                        <div style={{padding:'20px', textAlign:'center', color:'#999'}}>Không tìm thấy bệnh nhân</div>
                                    )}
                                </div>
                            </div>

                            {/* CHAT WINDOW */}
                            <div style={styles.chatWindowPanel}>
                                {selectedChatId ? (
                                    <>
                                        <div style={styles.chatWindowHeader}>
                                            <span style={{fontWeight:'bold'}}>Đang chat với: {chatData.find(c => c.id === selectedChatId)?.display_name}</span>
                                        </div>
                                        <div style={styles.messagesBody}>
                                            {currentMessages.map((msg, i) => (
                                                <div key={i} style={{...styles.messageRow, justifyContent: msg.is_me ? 'flex-end' : 'flex-start'}}>
                                                    <div style={msg.is_me ? styles.bubbleMe : styles.bubbleOther}>
                                                        {msg.content}
                                                    </div>
                                                    <div style={styles.timestamp}>{msg.time}</div>
                                                </div>
                                            ))}
                                            <div ref={messagesEndRef} />
                                        </div>
                                        <form onSubmit={handleSendMessage} style={styles.chatInputArea}>
                                            <input 
                                                value={newMessageText} 
                                                onChange={e => setNewMessageText(e.target.value)} 
                                                style={styles.messengerInput}
                                                placeholder="Nhập tin nhắn tư vấn..."
                                            />
                                            <button type="submit" style={{...styles.primaryBtnSm, height: '40px', width: '40px', justifyContent:'center', borderRadius:'50%'}}>
                                                <FaPaperPlane/>
                                            </button>
                                        </form>
                                    </>
                                ) : (
                                    <div style={styles.emptyChatState}>
                                        <FaUserMd size={50} color="#ddd" />
                                        <p>Chọn một bệnh nhân để bắt đầu tư vấn</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* MODAL REPORT */}
            {showReportModal && (
                <div style={styles.modalOverlay}>
                    <div style={styles.modalContent}>
                        <div style={styles.modalHeader}>
                            <h3 style={{margin:0}}>Cập nhật chẩn đoán</h3>
                            <button onClick={() => setShowReportModal(false)} style={styles.closeBtn}>&times;</button>
                        </div>
                        <div style={{padding: '20px'}}>
                            <div style={styles.reportBox}>
                                <div style={styles.reportLabel}>Kết quả AI Phân tích</div>
                                <div style={styles.reportValue}>{reportForm.aiResult}</div>
                            </div>
                            <div style={{marginTop: 20}}>
                                <label style={styles.label}>Chẩn đoán của Bác sĩ:</label>
                                <textarea 
                                    value={reportForm.doctorDiagnosis}
                                    onChange={e => setReportForm({...reportForm, doctorDiagnosis: e.target.value})}
                                    style={{...styles.inputForm, height: '100px'}}
                                    placeholder="Nhập kết luận..."
                                />
                            </div>
                            <div style={{marginTop: 15}}>
                                <label style={styles.label}>Ghi chú / Đơn thuốc:</label>
                                <textarea 
                                    value={reportForm.notes}
                                    onChange={e => setReportForm({...reportForm, notes: e.target.value})}
                                    style={{...styles.inputForm, height: '60px'}}
                                    placeholder="Dặn dò thêm..."
                                />
                            </div>
                            <div style={{marginTop: 20, textAlign:'right', display:'flex', justifyContent:'flex-end', gap: 10}}>
                                <button onClick={() => setShowReportModal(false)} style={styles.actionBtn}>Hủy bỏ</button>
                                <button onClick={submitReport} style={styles.primaryBtnSm}>Lưu & Gửi kết quả</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STYLES ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    
<<<<<<< HEAD
// Sidebar (Đã chuyển sang Light Theme giống Patient)
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom: '5px' }, // Thêm marginBottom
    
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' }, // Đổi màu chữ sang đen
    
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'35px' }, // Style mới cho dòng 'Dành cho Bác sĩ'
    
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center', transition:'0.2s' },
    
    // Style Active: Nền xanh nhạt, chữ xanh đậm, Border nằm bên PHẢI
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center' },
    
    menuIcon: { marginRight: '12px' },
    
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    
    // Nút đăng xuất màu đỏ nhạt giống bên Patient
    logoutBtn: { width: '100%', padding: '10px', background: '#fff0f0', color: '#d32f2f', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
=======
    // Sidebar
    sidebar: { width: '260px', backgroundColor: '#34495e', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #2c3e50' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#fff' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#ecf0f1', display:'flex', alignItems:'center', transition:'0.2s' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', backgroundColor: '#2c3e50', color: '#fff', borderLeft: '4px solid #3498db', display:'flex', alignItems:'center' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #2c3e50' },
    logoutBtn: { width: '100%', padding: '10px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
    badge: { marginLeft: 'auto', backgroundColor: '#e74c3c', color: 'white', fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' },

>>>>>>> 99c081f04a8c804321c9e748481d1ffd66bb4169
    // Main
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { 
    height: '70px', 
    backgroundColor: '#fff', 
    borderBottom: '1px solid #e1e4e8', 
    display: 'flex', 
    justifyContent: 'flex-end', // <--- SỬA DÒNG NÀY (Cũ là 'space-between')
    alignItems: 'center', 
    padding: '0 30px' 
},
    headerLeft: { display:'flex', alignItems:'center', gap:'15px' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },

    // Components
    card: { backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border:'1px solid #eaeaea', overflow:'hidden', marginBottom:'20px' },
    cardHeader: { padding:'20px 25px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' },
    pageTitle: { fontSize: '16px', margin: 0, display:'flex', alignItems:'center', color: '#333' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px 25px', borderBottom: '1px solid #eee', color: '#8898aa', fontSize:'11px', textTransform:'uppercase', fontWeight:'700', background:'#fbfbfb' },
    tr: { borderBottom: '1px solid #f5f5f5' },
    td: { padding: '15px 25px', verticalAlign: 'middle', color:'#333' },
    emptyCell: { textAlign: 'center', padding: '30px', color: '#999', fontStyle: 'italic' },
    
    // Buttons & Inputs
    primaryBtnSm: { background: '#3498db', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display:'flex', alignItems:'center' },
    actionBtn: { background: '#fff', border: '1px solid #3498db', color: '#3498db', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' },
    searchBox: { display: 'flex', alignItems: 'center', background: '#f8f9fa', borderRadius: '6px', padding: '5px 10px', border: '1px solid #ddd' },
    searchInput: { border: 'none', background: 'transparent', outline: 'none', marginLeft: '5px', width: '150px' },

    // Messenger
    messengerCard: { display: 'flex', height: 'calc(100vh - 140px)', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border:'1px solid #e1e4e8', overflow: 'hidden' },
    chatListPanel: { width: '300px', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' },
    chatHeaderLeft: { padding: '15px', borderBottom: '1px solid #f0f0f0', background:'#f9f9f9' },
    chatListScroll: { flex: 1, overflowY: 'auto' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '12px', cursor: 'pointer', gap: '10px', borderBottom:'1px solid #fcfcfc' },
    avatarLarge: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#555' },
    unreadDot: { width:'10px', height:'10px', borderRadius:'50%', background:'#3498db' },
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column' },
    chatWindowHeader: { padding: '15px', borderBottom: '1px solid #f0f0f0', background:'#fff' },
    messagesBody: { flex: 1, padding: '20px', overflowY: 'auto', background:'#fdfdfd' },
    chatInputArea: { padding: '15px 20px', borderTop: '1px solid #f0f0f0', display:'flex', gap:'10px', alignItems: 'center', flexShrink: 0},
    messengerInput: { flex:1, padding:'10px', borderRadius:'20px', border:'1px solid #ddd', outline:'none' },
    emptyChatState: { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#999' },
    messageRow: { display: 'flex', marginBottom: '4px', width: '100%' },
    bubbleMe: { padding: '10px 16px', borderRadius: '18px 18px 4px 18px', backgroundColor: '#3498db', color: 'white', maxWidth: '65%', fontSize: '14.5px', lineHeight: '1.5', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', wordWrap: 'break-word' as 'break-word' },
    bubbleOther: { padding: '10px 16px', borderRadius: '18px 18px 18px 4px', backgroundColor: '#f1f0f0', color: '#1c1e21', maxWidth: '65%', fontSize: '14.5px', lineHeight: '1.5', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', wordWrap: 'break-word' as 'break-word' },
    timestamp: { fontSize: '10px', color: '#999', marginTop: '4px', marginLeft: '5px', marginRight: '5px' },
    
    // Modal
    modalOverlay: { position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.5)', display:'flex', justifyContent:'center', alignItems:'center', zIndex: 2000 },
    modalContent: { background:'white', padding:'0', borderRadius:'12px', width:'600px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', overflow:'hidden' },
    modalHeader: { padding:'15px 20px', background:'#f8f9fa', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' },
    closeBtn: { border:'none', background:'none', fontSize:'16px', cursor:'pointer', color:'#666' },
    reportBox: { background:'#f8f9fa', padding:'15px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.02' },
    reportLabel: { fontSize:'13px', color:'#7f8c8d', marginBottom:'5px', textTransform:'uppercase', fontWeight:'600' as '600' }, 
    reportValue: { fontSize:'28px', fontWeight:'bold', color:'#2c3e50' },
    label: { display:'block', marginBottom:'5px', fontSize:'13px', fontWeight:'600', color:'#555' },
    inputForm: { width:'100%', padding:'10px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'14px', outline:'none' },
};

export default DashboardDr;