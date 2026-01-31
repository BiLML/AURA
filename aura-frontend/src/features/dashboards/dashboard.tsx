import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaTrash, FaImage, FaFileAlt, FaLock,
    FaHome, FaComments, FaHospital, FaCreditCard, 
    FaBell, FaSignOutAlt, FaUserCircle, FaCamera, FaCheck, FaCheckDouble, FaHistory,
    FaCog, FaToggleOn, FaToggleOff, FaUserShield 
} from 'react-icons/fa';

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

// --- Dashboard Component (USER / PATIENT) ---
const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('Guest');
    const [userName, setUserName] = useState<string>('');
    const [full_name, setFullName] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true); 
    
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [chatData, setChatData] = useState<any[]>([]); 

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);

    // [THÊM STATE THÔNG BÁO]
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);

    // --- STATE FORM ĐĂNG KÝ PHÒNG KHÁM ---
    const [clinicForm, setClinicForm] = useState({
        name: '', address: '', phone: '', license: '', description: ''
    });
    const [isSubmittingClinic, setIsSubmittingClinic] = useState(false);
    
    // Refs
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // State ảnh upload
    const [clinicImages, setClinicImages] = useState<{ front: File | null, back: File | null }>({ front: null, back: null });
    const [previewImages, setPreviewImages] = useState<{ front: string | null, back: string | null }>({ front: null, back: null });

    // State bảo mật
    const [privacyConsent, setPrivacyConsent] = useState(false);
    // --- 2. THÊM STATE CHO BILLING ---
    const [packages, setPackages] = useState<ServicePackage[]>([]);
    const [mySub, setMySub] = useState<UserSubscription>({ active: false, credits: 0, plan_name: 'Free', expiry: null });
    
    const [isBuying, setIsBuying] = useState(false);
    const [transactions, setTransactions] = useState<Transaction[]>([]); 
    

    // --- 1. HÀM TẢI DANH SÁCH CHAT ---
    const fetchChatData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats || [];
                
                // Logic gộp tin nhắn ảo "Vừa xong"
                setChatData(prevChats => {
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    const mergedChats = serverChats.map((sChat: any) => {
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
    }, []);

    // --- 2. HÀM TẢI LỊCH SỬ KHÁM ---
    const fetchMedicalRecords = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const historyRes = await fetch('https://aurahealth.name.vn/api/v1/medical-records/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (historyRes.ok) {
                const rawData = await historyRes.json();
                const list = Array.isArray(rawData) ? rawData : (rawData.items || rawData.history || []);

                const mappedHistory = list.map((item: any) => {
                    const rawDate = item.created_at || item.upload_date || new Date().toISOString();
                    const analysisData = item.analysis_result || {};
                    const risk = analysisData.risk_level;
                    
                    let statusDisplay = "PENDING";
                    let resultDisplay = "Đang phân tích...";

                    if (risk) {
                        statusDisplay = "COMPLETED";
                        resultDisplay = risk; 
                    }

                    return {
                        id: item.id,
                        rawTimestamp: new Date(rawDate).getTime(),
                        date: new Date(rawDate).toLocaleDateString('vi-VN'),
                        time: new Date(rawDate).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}),
                        result: resultDisplay,
                        status: statusDisplay,
                        annotated_url: analysisData.annotated_image_url || null
                    };
                });
                setHistoryData(mappedHistory.sort((a: any, b: any) => b.rawTimestamp - a.rawTimestamp));
            }
        } catch (err) { console.error("Lỗi cập nhật hồ sơ:", err); }
    }, []);

    // --- 3. HÀM CHAT ---
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
        if (partnerId === 'system') {
             setCurrentMessages([{id: 'sys', content: 'Chào mừng bạn đến với AURA!', is_me: false, time: ''}]);
             return;
        }
        const msgs = await fetchMessageHistory(partnerId);
        if (msgs) setCurrentMessages(msgs);
        
        const token = localStorage.getItem('token');
        if (token) {
            setChatData(prev => prev.map(c => c.id === partnerId ? { ...c, unread: false } : c));
            await fetch(`https://aurahealth.name.vn/api/v1/chats/read/${partnerId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        fetchChatData(); 
    };

    const fetchNotifications = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('http://127.0.0.1:8000/api/v1/users/me/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => {
        fetchNotifications();
        // Polling 10s một lần cho nhẹ user
        const interval = setInterval(fetchNotifications, 10000);
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    // --- 4. CÁC HÀM XỬ LÝ SỰ KIỆN KHÁC ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;
        const textToSend = newMessageText;
        setNewMessageText(''); 
        const now = new Date();
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const tempMsg = { id: Date.now().toString(), content: textToSend, is_me: true, time: timeString, is_read: false };
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

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [currentMessages]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            let objectUrl: string | null = null;
            if (file.type.startsWith('image/')) objectUrl = URL.createObjectURL(file);
            setClinicImages(prev => ({ ...prev, [type]: file }));
            setPreviewImages(prev => ({ ...prev, [type]: objectUrl }));
        }
    };

    const removeImage = (type: 'front' | 'back') => {
        setClinicImages(prev => ({ ...prev, [type]: null }));
        setPreviewImages(prev => ({ ...prev, [type]: null }));
    };

    const handleClinicSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingClinic(true);
        const token = localStorage.getItem('token');
        try {
            const formData = new FormData();
            formData.append('name', clinicForm.name);
            formData.append('address', clinicForm.address);
            formData.append('phone', clinicForm.phone);
            const fullDescription = `Mã GP: ${clinicForm.license}. \n${clinicForm.description}`;
            formData.append('description', fullDescription);
            if (clinicImages.front) formData.append('logo', clinicImages.front); 
            else if (clinicImages.back) formData.append('logo', clinicImages.back);

            const res = await fetch('https://aurahealth.name.vn/api/v1/clinics/register', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                alert("Gửi yêu cầu đăng ký thành công!");
                setClinicForm({ name: '', address: '', phone: '', license: '', description: '' }); 
                setClinicImages({ front: null, back: null });
                setPreviewImages({ front: null, back: null });
                setActiveTab('home');
            } else { alert(data.detail || "Có lỗi xảy ra"); }
        } catch (error) { alert("Lỗi kết nối server!"); } 
        finally { setIsSubmittingClinic(false); }
    };

    // --- 5. INITIALIZATION & POLLING ---
    useEffect(() => {
        const interval = setInterval(async () => {
             if (activeTab === 'messages') fetchChatData(); 
             if (activeTab === 'home') fetchMedicalRecords();
             if (activeTab === 'payments') fetchBillingData();
             if (selectedChatId && selectedChatId !== 'system') {
                const serverMsgs = await fetchMessageHistory(selectedChatId);
                if (serverMsgs && serverMsgs.length > currentMessages.length) setCurrentMessages(serverMsgs);
             }
        }, 5000); 
        return () => clearInterval(interval);
    }, [selectedChatId, fetchChatData, fetchMedicalRecords, currentMessages.length, activeTab]);

    useEffect(() => {
        const initData = async () => {
            // Giả lập delay nhỏ để thấy hiệu ứng loading
            await new Promise(r => setTimeout(r, 400));
            
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }
            try {
                const userResponse = await fetch('https://aurahealth.name.vn/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!userResponse.ok) { handleLogout(); return; }
                const userData = await userResponse.json();
                const info = userData.user_info || userData;
                const userProfile = info.profile || {};

                setUserName(info.username || info.userName || '');
                setUserRole(info.role);
                setFullName(userProfile.full_name || info.full_name || '');
                setPrivacyConsent(userData.consent_for_training || false);

                await fetchMedicalRecords(); 
                await fetchChatData(); 
                await fetchBillingData();
            } catch (error) { console.error("Lỗi tải dữ liệu:", error); } 
            finally { setIsLoading(false); }
        };
        initData();
    }, [navigate, fetchChatData, fetchMedicalRecords]);

    const handleTogglePrivacy = async () => {
        const newValue = !privacyConsent;
        setPrivacyConsent(newValue); // Optimistic UI update

        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/users/me/privacy', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ consent_for_training: newValue })
            });
            if (!res.ok) {
                setPrivacyConsent(!newValue); // Revert nếu lỗi
                alert("Không có dữ liệu phân tích để đóng góp!");
            }
        } catch (e) {
            setPrivacyConsent(!newValue);
            alert("Lỗi kết nối server");
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setShowNotifications(false);
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchBillingData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const pkgRes = await fetch('https://aurahealth.name.vn/api/v1/billing/packages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (pkgRes.ok) {
                const data = await pkgRes.json();
                const userPackages = data.filter((p: any) => p.target_role === 'USER');
                setPackages(userPackages);
            }

            const subRes = await fetch('https://aurahealth.name.vn/api/v1/billing/my-usage', { 
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (subRes.ok) {
                const subData = await subRes.json();
                setMySub({
                    active: subData.active || false,
                    credits: subData.credits || subData.credits_left || 0,
                    plan_name: subData.plan_name || 'Free',
                    expiry: subData.expiry || subData.expires_at || null
                });
            }

            const txRes = await fetch('https://aurahealth.name.vn/api/v1/billing/my-transactions', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (txRes.ok) {
                const txData = await txRes.json();
                setTransactions(txData);
            }
        } catch (error) { console.error("Lỗi billing:", error); }
    }, []);

    const handleBuyPackage = async (pkg: ServicePackage) => {
        if (!window.confirm(`Xác nhận đăng ký gói "${pkg.name}" với giá ${pkg.price.toLocaleString('vi-VN')} đ?`)) return;
        
        setIsBuying(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/billing/subscribe', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
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

    const handleLogout = () => { localStorage.clear(); navigate('/login', { replace: true }); };
    const goToProfilePage = () => { setShowUserMenu(false); navigate('/profile'); };
    const goToUpload = () => {
        if (mySub.credits <= 0) {
            const confirmRegister = window.confirm(
                "⚠️ Bạn chưa đăng ký gói dịch vụ hoặc đã hết lượt phân tích.\n\nBạn có muốn đi đến trang Đăng ký gói ngay không?"
            );
            if (confirmRegister) setActiveTab('payments');
            return;
        }
        navigate('/upload');
    };
    const goToDetail = (recordId: string) => navigate(`/analysis-result/${recordId}`);
    
    const getStatusColor = (result: string) => {
        if (!result) return 'black';
        const r = result.toLowerCase();
        if (r.includes('nặng') || r.includes('severe') || r.includes('pdr')) return '#dc3545'; 
        if (r.includes('vừa') || r.includes('moderate')) return '#fd7e14'; 
        if (r.includes('bình thường') || r.includes('normal') || r.includes('không')) return '#16a34a'; 
        return '#007bff'; 
    };

    const totalScans = historyData.length;
    const highRiskCount = historyData.filter(item => {
        const res = (item.result || "").toLowerCase();
        return res.includes('nặng') || res.includes('severe') || res.includes('moderate') || res.includes('pdr');
    }).length;
    
    const recentNotifications = historyData.slice(0, 5);
    const unreadMessagesCount = chatData.filter(chat => chat.unread).length; 

    useEffect(() => {
        if (activeTab === 'payments') fetchBillingData();
        else if (activeTab === 'home') { fetchMedicalRecords(); fetchBillingData(); }
        else if (activeTab === 'messages') fetchChatData();
    }, [activeTab]);

    // --- RENDER CONTENT ---
    const renderContent = () => {
        // --- 1. RENDER FORM ĐĂNG KÝ ---
        if (activeTab === 'clinic-register') {
            return (
                <div style={styles.card} className="slide-up-card">
                    <div style={styles.cardHeader}>
                        <h2 style={styles.pageTitle}><FaHospital style={{marginRight: 10}}/>Đăng ký Phòng khám</h2>
                    </div>
                    <div style={{padding: '30px'}}>
                        <p style={{ color: '#64748b', marginBottom: '25px', fontSize:'14px' }}>Vui lòng điền thông tin và tải lên giấy tờ chứng thực (Giấy phép kinh doanh / CCHN).</p>
                        
                        <form onSubmit={handleClinicSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                                <div>
                                    <label style={styles.formLabel}>Tên phòng khám <span style={{color:'red'}}>*</span></label>
                                    <input className="input-focus" required type="text" style={styles.formInput} placeholder="Nhập tên phòng khám..." value={clinicForm.name} onChange={(e) => setClinicForm({...clinicForm, name: e.target.value})} />
                                </div>
                                 <div>
                                    <label style={styles.formLabel}>Mã số giấy phép <span style={{color:'red'}}>*</span></label>
                                    <input className="input-focus" required type="text" style={styles.formInput} placeholder="GPKD/CCHN..." value={clinicForm.license} onChange={(e) => setClinicForm({...clinicForm, license: e.target.value})} />
                                </div>
                            </div>

                            <div>
                                <label style={styles.formLabel}>Địa chỉ <span style={{color:'red'}}>*</span></label>
                                <input className="input-focus" required type="text" style={styles.formInput} placeholder="Số nhà, đường, phường/xã..." value={clinicForm.address} onChange={(e) => setClinicForm({...clinicForm, address: e.target.value})} />
                            </div>
                            
                            <div>
                                <label style={styles.formLabel}>Số điện thoại <span style={{color:'red'}}>*</span></label>
                                <input className="input-focus" required type="text" style={styles.formInput} placeholder="0912..." value={clinicForm.phone} onChange={(e) => setClinicForm({...clinicForm, phone: e.target.value})} />
                            </div>

                            {/* --- PHẦN UPLOAD ẢNH --- */}
                            <div style={{marginTop: '10px'}}>
                                <label style={styles.formLabel}>Ảnh chứng thực giấy tờ <span style={{color:'red'}}>*</span></label>
                                <div style={styles.uploadGrid}>
                                    <div style={styles.uploadBox} className="upload-box-hover">
                                        {previewImages.front ? (
                                            <div style={styles.previewContainer}>
                                                <img src={previewImages.front} alt="Front" style={styles.previewImage} />
                                                <button type="button" onClick={() => removeImage('front')} style={styles.removeBtn} className="btn-secondary-hover"><FaTrash /></button>
                                            </div>
                                        ) : (
                                            <label style={styles.uploadLabel}>
                                                <FaImage size={30} color="#007bff" style={{marginBottom:10}} />
                                                <span style={{fontSize:'14px', color:'#64748b'}}>Ảnh mặt trước</span>
                                                <input type="file" accept="image/*" hidden onChange={(e) => handleFileSelect(e, 'front')} />
                                            </label>
                                        )}
                                    </div>

                                    <div style={styles.uploadBox} className="upload-box-hover">
                                        {clinicImages.back ? (
                                            <div style={styles.previewContainer}>
                                                {clinicImages.back.type.startsWith('image/') ? (
                                                    <img src={previewImages.back || ''} alt="Back" style={styles.previewImage} />
                                                ) : (
                                                    <div style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'#555'}}>
                                                        <FaFileAlt size={40} color="#6c757d" />
                                                        <span style={{fontSize:'13px', marginTop:'10px', padding:'0 10px', textAlign:'center', wordBreak:'break-all'}}>
                                                            {clinicImages.back.name}
                                                        </span>
                                                    </div>
                                                )}
                                                <button type="button" onClick={() => removeImage('back')} style={styles.removeBtn} className="btn-secondary-hover"><FaTrash /></button>
                                            </div>
                                        ) : (
                                            <label style={styles.uploadLabel}>
                                                <FaFileAlt size={30} color="#007bff" style={{marginBottom:10}} />
                                                <span style={{fontSize:'14px', color:'#64748b'}}>Ảnh mặt sau/PDF</span>
                                                <input type="file" accept='.pdf, .doc, .docx, .xls, .xlsx, .csv, image/*' hidden onChange={(e) => handleFileSelect(e, 'back')} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                                <p style={{fontSize:'12px', color:'#94a3b8', marginTop:'8px'}}>* Định dạng hỗ trợ: JPG, PNG, PDF. Dung lượng tối đa 5MB.</p>
                            </div>

                            <div>
                                <label style={styles.formLabel}>Giới thiệu ngắn</label>
                                <textarea className="input-focus" rows={3} style={{...styles.formInput, resize: 'vertical'}} placeholder="Mô tả về chuyên khoa, dịch vụ..." value={clinicForm.description} onChange={(e) => setClinicForm({...clinicForm, description: e.target.value})} />
                            </div>

                            <button type="submit" className="btn-primary-hover pulse-on-active" style={{...styles.primaryBtn, width: 'fit-content', opacity: isSubmittingClinic ? 0.7 : 1}} disabled={isSubmittingClinic}>
                                {isSubmittingClinic ? <><span className="spin">⏳</span> Đang gửi hồ sơ...</> : 'Gửi hồ sơ đăng ký'}
                            </button>
                        </form>
                    </div>
                </div>
            );
        }

        // 2. CHAT
if (activeTab === 'messages') {
            return (
                <div style={styles.messengerCard} className="slide-up-card">
                    {/* LIST BÊN TRÁI */}
                    <div style={styles.chatListPanel}>
                        <div style={styles.chatHeaderLeft}><h2 style={{margin: 0, fontSize: '20px', color: '#1e293b'}}>Tin nhắn</h2></div>
                        <div style={styles.chatListScroll}>
                            {chatData.map(msg => (
                                <div key={msg.id} className="chat-item-hover" style={{...styles.chatListItem, backgroundColor: selectedChatId === msg.id ? '#eff6ff' : 'transparent'}} onClick={() => openChat(msg.id)}>
                                    <div style={styles.avatarLarge}>{(msg.full_name || msg.sender || 'U').charAt(0).toUpperCase()}</div>
                                    <div style={{flex: 1, overflow: 'hidden'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{fontWeight: msg.unread ? '800' : '600', fontSize: '15px', color: '#334155'}}>{msg.full_name || msg.sender}</span></div>
                                        <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}><p style={{margin: 0, fontSize: '13px', color: msg.unread ? '#0f172a' : '#64748b', fontWeight: msg.unread ? '700' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{msg.preview}</p><span style={{fontSize: '11px', color: '#94a3b8'}}>• {msg.time}</span></div>
                                    </div>
                                    {msg.unread && <div style={styles.unreadBlueDot}></div>}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* CỬA SỔ BÊN PHẢI */}
                    <div style={styles.chatWindowPanel}>
                        {selectedChatId ? (
                            <>
                                <div style={styles.chatWindowHeader}>
                                    <div style={styles.avatarMedium}>{(chatData.find(c => c.id === selectedChatId)?.full_name || chatData.find(c => c.id === selectedChatId)?.sender || '').charAt(0).toUpperCase()}</div>
                                    <div style={{flex: 1}}><h4 style={{margin: 0, fontSize: '16px', color:'#1e293b'}}>{chatData.find(c => c.id === selectedChatId)?.full_name || chatData.find(c => c.id === selectedChatId)?.sender}</h4><span style={{fontSize: '12px', color: '#64748b'}}>{selectedChatId === 'system' ? 'Hệ thống' : 'Bác sĩ'}</span></div>
                                </div>
                                <div style={styles.messagesBody}>
                                    {currentMessages.map((msg, idx) => (
                                        <div key={idx} className="pop-in" style={{
                                            ...styles.messageRow, 
                                            justifyContent: msg.is_me ? 'flex-end' : 'flex-start'
                                        }}>
                                            {!msg.is_me && (
                                                <div style={{
                                                    ...styles.avatarSmall, 
                                                    alignSelf: 'flex-end', 
                                                    marginBottom: '20px',
                                                    marginRight: '8px'
                                                }}>
                                                    {(chatData.find(c=>c.id===selectedChatId)?.sender || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            
                                            <div style={{display:'flex', flexDirection:'column', alignItems: msg.is_me ? 'flex-end' : 'flex-start', maxWidth:'75%'}}>
                                                <div style={msg.is_me ? styles.bubbleMe : styles.bubbleOther}>
                                                    {msg.content}
                                                </div>
                                                <div style={{
                                                    display:'flex', alignItems:'center', gap:'4px', 
                                                    marginTop:'4px', marginBottom:'10px', 
                                                    fontSize:'11px', color:'#94a3b8',
                                                    paddingRight: msg.is_me ? '5px' : '0',
                                                    paddingLeft: !msg.is_me ? '5px' : '0'
                                                }}>
                                                    <span>{msg.time}</span>
                                                    {msg.is_me && (
                                                        <span style={{marginLeft:'2px', display:'flex', alignItems:'center'}}>
                                                            {msg.is_read ? (
                                                                <span title="Đã xem" style={{display:'flex', alignItems:'center', color: '#007bff'}}>
                                                                    <FaCheckDouble size={10}/> 
                                                                </span>
                                                            ) : (
                                                                <span title="Đã gửi" style={{color: '#cbd5e1'}}>
                                                                    <FaCheck size={10}/>
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                                {selectedChatId !== 'system' && (
                                    <div style={styles.chatInputArea}>
                                        <form onSubmit={handleSendMessage} style={{flex: 1, display: 'flex'}}><input className="input-focus" type="text" placeholder="Nhập tin nhắn..." value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} style={styles.messengerInput} /></form>
                                        <div onClick={handleSendMessage} className="btn-icon-hover" style={{cursor: 'pointer', padding:'10px', borderRadius:'50%'}}><FaPaperPlane size={20} color="#007bff" /></div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={styles.emptyChatState}><div className="icon-pulse" style={{width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}><FaComments size={40} color="#007bff"/></div><h3>Chào mừng đến với AURA Chat</h3><p>Chọn một cuộc trò chuyện để bắt đầu.</p></div>
                        )}
                    </div>
                </div>
            );
        }
        
        // 3. PAYMENTS
        if (activeTab === 'payments') return (
            <div className="fade-in" style={{display:'flex', flexDirection:'column', gap:'25px'}}>
                
                {/* THẺ VÍ CỦA TÔI */}
                <div style={styles.card} className="slide-up-card">
                    <div style={styles.cardHeader}>
                        <h2 style={styles.pageTitle}><FaCreditCard style={{marginRight:10}}/>Ví & Dịch vụ</h2>
                    </div>
                    <div style={{padding:'30px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', margin:'20px', borderRadius:'16px', color:'white', boxShadow: '0 8px 20px rgba(37, 99, 235, 0.3)'}}>
                        <div>
                            <p style={{margin:0, opacity:0.85, fontSize:'14px', fontWeight:500}}>Gói hiện tại</p>
                            <h2 style={{margin:'8px 0', fontSize:'28px', fontWeight: 700, letterSpacing: '0.5px'}}>{mySub.plan_name}</h2>
                            {mySub.expiry && <small style={{opacity:0.9, background:'rgba(255,255,255,0.2)', padding:'4px 10px', borderRadius:'20px'}}>Hết hạn: {new Date(mySub.expiry).toLocaleDateString('vi-VN')}</small>}
                        </div>
                        <div style={{textAlign:'right'}}>
                            <p style={{margin:0, opacity:0.85, fontSize:'14px', fontWeight:500}}>Số lượt còn lại</p>
                            <h1 style={{margin:0, fontSize:'52px', fontWeight:'800', textShadow: '0 2px 4px rgba(0,0,0,0.2)'}}>{mySub.credits}</h1>
                        </div>
                    </div>
                </div>

                {/* DANH SÁCH GÓI DỊCH VỤ */}
                <div>
                    <h3 style={{color:'#1e293b', marginBottom:'20px', display:'flex', alignItems:'center', fontSize: '18px'}}>
                        <FaHospital style={{marginRight:10, color:'#007bff'}}/> Gói dịch vụ có sẵn
                    </h3>
                    
                    {packages.length === 0 ? (
                        <div style={{textAlign:'center', padding:'40px', color:'#94a3b8', background:'white', borderRadius:'12px'}}>Chưa có gói dịch vụ nào.</div>
                    ) : (
                        <div style={styles.pricingGrid}>
                            {packages.map(pkg => (
                                <div key={pkg.id} style={styles.pricingCard} className="pricing-card-hover slide-up-card">
                                    <div style={styles.pricingHeader}>
                                        <h4 style={{margin:0, fontSize:'18px', color:'#334155', fontWeight: 700}}>{pkg.name}</h4>
                                        <div style={styles.priceTag}>
                                            {pkg.price === 0 ? 'Miễn phí' : `${pkg.price.toLocaleString('vi-VN')} đ`}
                                        </div>
                                    </div>
                                    <div style={styles.pricingBody}>
                                        <p style={{fontSize:'14px', color:'#64748b', minHeight:'40px', lineHeight: 1.5}}>{pkg.description || 'Gói dịch vụ tiêu chuẩn'}</p>
                                        <ul style={{paddingLeft:'20px', margin:'20px 0', color:'#475569', fontSize:'14px'}}>
                                            <li style={{marginBottom:'10px'}}>⏳ Thời hạn: <b>{pkg.duration_days} ngày</b></li>
                                            <li style={{marginBottom:'10px'}}>🧠 Số lượt AI: <b>{pkg.analysis_limit} lượt</b></li>
                                            <li>👨‍⚕️ Hỗ trợ bác sĩ: <b>Có</b></li>
                                        </ul>
                                        <button 
                                            className="btn-primary-hover pulse-on-active"
                                            onClick={() => handleBuyPackage(pkg)} 
                                            disabled={isBuying}
                                            style={{...styles.primaryBtn, width:'100%', background: isBuying ? '#cbd5e1' : 'linear-gradient(135deg, #007bff, #0069d9)'}}
                                        >
                                            {isBuying ? 'Đang xử lý...' : 'Đăng ký ngay'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{marginTop: '30px'}}>
                    <h3 style={{color:'#1e293b', marginBottom:'20px', display:'flex', alignItems:'center', fontSize:'18px'}}>
                        <FaHistory style={{marginRight:10, color:'#007bff'}}/> Lịch sử giao dịch
                    </h3>
                    
                    <div style={styles.card} className="slide-up-card">
                        <table style={styles.table} className="table-hover">
                            <thead>
                                <tr>
                                    <th style={styles.th}>Thời gian</th>
                                    <th style={styles.th}>Gói dịch vụ</th>
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
                                            <td style={styles.td}><b style={{color:'#334155'}}>{tx.package_name}</b></td>
                                            <td style={{...styles.td, fontWeight:'bold', color:'#16a34a'}}>
                                                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(tx.amount)}
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{
                                                    background: tx.status === 'SUCCESS' ? '#dcfce7' : '#fee2e2',
                                                    color: tx.status === 'SUCCESS' ? '#166534' : '#991b1b',
                                                    padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold'
                                                }}>
                                                    {tx.status === 'SUCCESS' ? 'Thành công' : 'Thất bại'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );

        if (activeTab === 'settings') {
            return (
                <div style={styles.card} className="slide-up-card">
                    <div style={styles.cardHeader}>
                        <h2 style={styles.pageTitle}><FaUserShield style={{marginRight:10, color:'#007bff'}}/> Quyền riêng tư & Dữ liệu</h2>
                    </div>
                    <div style={{padding:'35px'}}>
                        <div className="hover-lift" style={{
                            display:'flex', justifyContent:'space-between', alignItems:'center', 
                            padding:'25px', border:'1px solid #e2e8f0', borderRadius:'16px',
                            background: privacyConsent ? '#f0fdf4' : '#fff', transition: 'all 0.3s'
                        }}>
                            <div style={{maxWidth:'80%'}}>
                                <h4 style={{margin:'0 0 8px 0', fontSize:'16px', color:'#1e293b', fontWeight: 600}}>Đồng ý chia sẻ dữ liệu ẩn danh</h4>
                                <p style={{margin:0, fontSize:'14px', color:'#64748b', lineHeight:'1.6'}}>
                                    Cho phép AURA sử dụng hình ảnh võng mạc của bạn (đã được xóa tên và thông tin cá nhân) để huấn luyện và cải thiện độ chính xác của AI.
                                </p>
                            </div>
                            <div onClick={handleTogglePrivacy} style={{cursor:'pointer', fontSize:'40px', color: privacyConsent ? '#16a34a' : '#cbd5e1', display:'flex', alignItems:'center', transition:'color 0.3s'}}>
                                {privacyConsent ? <FaToggleOn size={45}/> : <FaToggleOff size={45}/>}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // 4. HOME (DASHBOARD)
        return (
            <div className="fade-in" style={{display: 'flex', flexDirection: 'column', gap: '30px'}}>
                {/* Stats Cards */}
                <div style={styles.card} className="slide-up-card">
                    <div style={styles.cardHeader}><h2 style={styles.pageTitle}>📊 Tổng quan sức khỏe</h2></div>
                    <div style={{padding:'30px', display: 'flex', gap: '60px'}}>
                         <div><span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>TỔNG LẦN KHÁM</span><h1 style={{ margin: '8px 0 0', color: '#007bff', fontSize: '36px' }}>{totalScans}</h1></div>
                         <div><span style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>NGUY CƠ CAO</span><h1 style={{ margin: '8px 0 0', color: highRiskCount > 0 ? '#dc3545' : '#16a34a', fontSize: '36px' }}>{highRiskCount}</h1></div>
                    </div>
                </div>

                {/* --- History Table --- */}
                <div className="slide-up-card" style={{...styles.card, animationDelay: '0.1s'}}>
                    <div style={styles.cardHeader}>
                        <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                            <h3 style={styles.pageTitle}><FaHistory style={{marginRight: 10}}/> Lịch sử Phân tích AI</h3>
                            <span style={styles.badge}>{historyData.length} Ca khám</span>
                        </div>
                        <button 
                            className="btn-primary-hover pulse-on-active"
                            onClick={goToUpload} 
                            style={{
                                ...styles.primaryBtn,
                                display:'flex', alignItems:'center', gap:'8px', padding: '10px 18px', fontSize:'13px',
                                background: mySub.credits > 0 ? 'linear-gradient(135deg, #007bff, #0069d9)' : '#64748b'
                            }}
                        >
                            {mySub.credits > 0 ? <FaCamera /> : <FaLock />}       
                            Phân tích mới
                        </button>
                    </div>

                    <table style={styles.table} className="table-hover">
                        <thead>
                            <tr>
                                <th style={styles.th}>Thời gian</th>
                                <th style={styles.th}>Hình ảnh</th>
                                <th style={styles.th}>Kết quả AI</th>
                                <th style={styles.th}>Trạng thái</th>
                                <th style={styles.th}>Chi tiết</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyData.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={styles.emptyCell}>
                                        Chưa có dữ liệu phân tích nào. <br/>
                                        <button onClick={goToUpload} className="btn-primary-hover" style={{...styles.primaryBtn, marginTop:'15px', display:'inline-block', fontSize:'13px', padding:'8px 20px'}}>Bắt đầu ngay</button>
                                    </td>
                                </tr>
                            ) : (
                                historyData.map((item, i) => (
                                    <tr key={i} style={styles.tr}>
                                        <td style={styles.td}><span style={{fontWeight:500}}>{item.date}</span><br/><small style={{color:'#94a3b8'}}>{item.time}</small></td>
                                        <td style={styles.td}>
                                            {item.annotated_url ? (
                                                <img src={item.annotated_url} alt="Scan" className="hover-lift" style={{width:'48px', height:'48px', objectFit:'cover', borderRadius:'8px', border:'1px solid #e2e8f0', boxShadow:'0 2px 4px rgba(0,0,0,0.05)'}} />
                                            ) : <div style={{width:'48px', height:'48px', background:'#f1f5f9', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center'}}><FaImage color="#cbd5e1"/></div>}
                                        </td>
                                        <td style={styles.td}>
                                            <span style={{color: getStatusColor(item.result), fontWeight:'700', padding:'4px 0'}}>
                                                {item.status.includes('PENDING') ? 'Đang chờ...' : item.result}
                                            </span>
                                        </td>
                                        <td style={styles.td}>
                                            {(item.status.includes('PENDING') || item.status.includes('Đang')) ? 
                                                <span style={styles.statusPending}><span className="spin">⏳</span> Đang xử lý</span> : 
                                                <span style={styles.statusActive}>Hoàn tất</span>
                                            }
                                        </td>
                                        <td style={styles.td}>
                                            <button onClick={() => goToDetail(item.id)} className="btn-secondary-hover" style={styles.actionBtn}>Xem kết quả</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={styles.loading}><FaCamera className="spin" size={40} color="#007bff"/></div>;

    // --- RENDER CHÍNH ---
    // Đã thay đổi: Loại bỏ style={styles.menuItem} và dùng thuần className để tránh xung đột

    return (
        <div style={styles.container} className="fade-in">
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}><FaHome size={26} color="#007bff"/><span style={styles.logoText}>AURA HEALTH</span></div>
                    <div style={styles.clinicName}>Dành cho Bệnh nhân</div>
                </div>
                
                <nav style={styles.nav}>
                    <div 
                        className={`sidebar-item ${activeTab === 'home' ? 'active' : ''}`}
                        onClick={() => setActiveTab('home')}
                    >
                        <FaHome style={styles.menuIcon} /> Trang chủ
                    </div>

                    <div 
                        className={`sidebar-item ${activeTab === 'messages' ? 'active' : ''}`}
                        onClick={() => setActiveTab('messages')}
                    >
                        <FaComments style={styles.menuIcon} /> Tin nhắn {unreadMessagesCount > 0 && <span style={styles.badgeRed}>{unreadMessagesCount}</span>}
                    </div>

                    <div 
                        className={`sidebar-item ${activeTab === 'clinic-register' ? 'active' : ''}`}
                        onClick={() => setActiveTab('clinic-register')}
                    >
                        <FaHospital style={styles.menuIcon} /> Đăng ký Phòng khám
                    </div>

                    <div 
                        className={`sidebar-item ${activeTab === 'payments' ? 'active' : ''}`}
                        onClick={() => setActiveTab('payments')}
                    >
                        <FaCreditCard style={styles.menuIcon} /> Thanh toán
                    </div>

                    <div 
                        className={`sidebar-item ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        <FaCog style={styles.menuIcon} /> Cài đặt
                    </div>
                </nav>

            </aside>
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.headerRight}>
                        <div style={{position:'relative'}} ref={notificationRef}>
                            <button className="btn-icon-hover" style={styles.iconBtn} onClick={()=>setShowNotifications(!showNotifications)}><FaBell color="#64748b" size={20}/></button>
                            {showNotifications && (
                                <div className="pop-in" style={{
                                    position: 'absolute', right: '-10px', top: '55px', width: '320px', 
                                    background: 'white', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', 
                                    borderRadius: '12px', overflow: 'hidden', border:'1px solid #f1f5f9', zIndex: 100
                                }}>
                                    <div style={{padding: '15px', fontWeight: 'bold', borderBottom: '1px solid #f1f5f9', background:'#f8fafc', color:'#334155'}}>Thông báo</div>
                                    <div style={{maxHeight: '350px', overflowY: 'auto'}}>
                                        {recentNotifications.length > 0 ? recentNotifications.map((n:any)=><div key={n.id} className="notification-item-hover" style={styles.notificationItem} onClick={()=>goToDetail(n.id)}>Kết quả phân tích: <b>{n.result}</b></div>) : <div style={{padding:'15px', fontSize:'13px', color:'#999'}}>Không có thông báo mới</div>}
                                        {notifications.map((n) => (
                                            <div key={n.id} style={{
                                                padding: '15px', borderBottom: '1px solid #f1f5f9',
                                                background: n.is_read ? 'white' : '#f0f9ff'
                                            }}>
                                                <div style={{fontWeight: '600', fontSize: '13px', marginBottom: '4px', color:'#1e293b'}}>{n.title}</div>
                                                <div style={{fontSize: '13px', color: '#475569', lineHeight: 1.4}}>{n.content}</div>
                                                <div style={{fontSize: '11px', color: '#94a3b8', marginTop: '6px'}}>
                                                    {new Date(n.created_at).toLocaleString('vi-VN')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ position: 'relative' }} ref={profileRef}>
                            <div style={styles.profileBox} className="hover-lift" onClick={() => setShowUserMenu(!showUserMenu)}>
                                <div style={styles.avatarCircle}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
                                <span style={styles.userNameText}>{full_name || userName || 'User'}</span>
                            </div>
                            {showUserMenu && (
                                <div className="pop-in" style={styles.dropdownMenu}>
                                    <div style={{padding:'15px', borderBottom:'1px solid #f1f5f9', background:'#f8fafc'}}><strong>{full_name}</strong><br/><small style={{color:'#64748b'}}>{userRole}</small></div>
                                    <button style={styles.dropdownItem} className="sidebar-item" onClick={goToProfilePage}><FaUserCircle style={{marginRight:8}}/> Hồ sơ cá nhân</button>
                                    <button style={{...styles.dropdownItem, color: '#ef4444'}} className="sidebar-item" onClick={handleLogout}><FaSignOutAlt style={{marginRight:8}}/> Đăng xuất</button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>
                <div style={styles.contentBody}>{renderContent()}</div>
            </main>
        </div>
    );
};

// --- STYLES (ENHANCED SOFT UI) ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', backgroundColor: '#f4f6f9' },
    sidebar: { width: '270px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '4px 0 15px rgba(0,0,0,0.02)', zIndex: 10 },
    sidebarHeader: { padding: '25px 25px', borderBottom: '1px solid #f1f5f9' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '20px', color: '#1e293b', letterSpacing: '-0.5px' },
    clinicName: { fontSize:'13px', color:'#64748b', marginLeft:'40px', fontWeight: 500 },
    nav: { flex: 1, padding: '25px 0', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none' },
    
    // ĐÃ XÓA menuItem để tránh xung đột với CSS Class
    menuIcon: { marginRight: '14px', fontSize: '18px' },
    
    sidebarFooter: { padding: '25px', borderTop: '1px solid #f1f5f9' },
    logoutBtn: { width: '100%', padding: '12px', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '10px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '75px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 40px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '25px' },
    profileBox: { display:'flex', alignItems:'center', gap:'12px', cursor:'pointer', padding: '6px 12px', borderRadius: '30px', transition: 'background 0.2s' },
    avatarCircle: { width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff, #0056b3)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '15px', fontWeight:'600', boxShadow: '0 4px 8px rgba(0,123,255,0.2)' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#334155' },
    iconBtn: { background:'none', border:'none', cursor:'pointer', position:'relative', padding:'8px', borderRadius: '50%', transition: 'background 0.2s' },
    contentBody: { padding: '30px 40px', flex: 1, overflowY: 'auto' },
    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', overflow:'hidden', marginBottom:'25px', transition: 'transform 0.3s' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background: '#fff' },
    pageTitle: { fontSize: '18px', margin: 0, display:'flex', alignItems:'center', color: '#1e293b', fontWeight: '700' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '15px 25px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize:'12px', textTransform:'uppercase', fontWeight:'700', background:'#f8fafc', letterSpacing: '0.5px' },
    tr: { borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' },
    td: { padding: '18px 25px', verticalAlign: 'middle', color:'#334155' },
    actionBtn: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#007bff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', transition: 'all 0.2s' },
    primaryBtn: { padding: '12px 24px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight:'600', boxShadow: '0 4px 12px rgba(0,123,255,0.2)', transition: 'all 0.2s' },
    notificationItem: { padding: '14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize:'13px', color:'#334155', transition: 'background 0.2s' },
    dropdownMenu: { position: 'absolute', top: '65px', right: '0', width: '240px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 1000, border: '1px solid #f1f5f9', overflow:'hidden' },
    dropdownItem: { display: 'flex', alignItems:'center', width: '100%', padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: '#334155', fontSize:'14px', transition: 'background 0.2s' },
    formLabel: { display: 'block', marginBottom: '8px', fontWeight: '600', color: '#334155', fontSize: '14px' },
    formInput: { width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box', background:'#fff', color: '#333' },
    uploadGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginTop: '10px' },
    uploadBox: { border: '2px dashed #cbd5e1', borderRadius: '12px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fbff', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' },
    uploadLabel: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', width: '100%', height: '100%', justifyContent: 'center' },
    previewContainer: { width: '100%', height: '100%', position: 'relative' },
    previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
    removeBtn: { position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems:'center',justifyContent:'center',color:'#ef4444',boxShadow:'0 2px 6px rgba(0, 0, 0, 0.1)' },
    messengerCard: { display: 'flex', height: 'calc(100vh - 150px)', backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9', overflow: 'hidden' },
    chatListPanel: { width: '340px', borderRight: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', background: '#fff' },
    chatHeaderLeft: { padding: '25px', borderBottom: '1px solid #f1f5f9' },
    chatListScroll: { flex: 1, overflowY: 'auto', padding: '15px' },
    chatListItem: { display: 'flex', alignItems: 'center', padding: '14px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s', gap: '15px', marginBottom: '5px' },
    avatarLarge: { width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#4338ca', flexShrink: 0 },
    unreadBlueDot: { width: '10px', height: '10px', backgroundColor: '#007bff', borderRadius: '50%', boxShadow: '0 0 0 2px #fff' },
    chatWindowPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'white' },
    chatWindowHeader: { padding: '15px 25px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '15px', background: '#fff' },
    avatarMedium: { width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#64748b', fontSize:'15px' },
    messagesBody: { flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff' },
    chatInputArea: { padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', borderTop: '1px solid #f1f5f9', background: '#fff' },
    messengerInput: { flex: 1, backgroundColor: '#f1f5f9', border: '1px solid transparent', borderRadius: '25px', padding: '12px 20px', fontSize: '14px', outline: 'none', transition: 'all 0.2s', color: '#333' },
    emptyChatState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', textAlign: 'center' },
    messageRow: { display: 'flex', marginBottom: '8px', width: '100%' },
    bubbleMe: { padding: '12px 18px', borderRadius: '20px 20px 4px 20px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', maxWidth: '100%', width: 'fit-content', fontSize: '15px', lineHeight: '1.5', boxShadow: '0 2px 5px rgba(0,123,255,0.2)', wordWrap: 'break-word' as 'break-word' },
    bubbleOther: { padding: '12px 18px', borderRadius: '20px 20px 20px 4px', backgroundColor: '#f1f5f9', color: '#1e293b', maxWidth: '100%', width: 'fit-content', fontSize: '15px', lineHeight: '1.5', wordWrap: 'break-word' as 'break-word' },
    badge: { background:'#eff6ff', color:'#007bff', padding:'5px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700', border: '1px solid #dbeafe' },
    badgeRed: { marginLeft: 'auto', backgroundColor: '#ef4444', color: 'white', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)' },
    statusActive: { background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
    statusPending: { background: '#fef9c3', color: '#854d0e', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', display:'flex', alignItems:'center', gap:'6px', width:'fit-content' },
    emptyCell: { textAlign: 'center', padding: '50px', color: '#94a3b8', fontStyle: 'italic' },
    pricingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '25px' },
    pricingCard: { backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e1e4e8', overflow: 'hidden', transition: 'all 0.3s', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' },
    pricingHeader: { padding: '25px', backgroundColor: '#f8fbff', borderBottom: '1px solid #f1f5f9', textAlign: 'center' },
    priceTag: { fontSize: '28px', fontWeight: '800', color: '#007bff', marginTop: '10px' },
    pricingBody: { padding: '25px' },
};

// --- GLOBAL CSS (ĐÃ FIX TRIỆT ĐỂ) ---
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

/* --- SIDEBAR FIX (STABLE VERSION) --- */
.sidebar-item {
    padding: 12px 25px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 500; /* Giữ nguyên font-weight cho cả 2 trạng thái */
    color: #64748b;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
    border-left: 4px solid transparent; /* Luôn giữ chỗ cho border */
    margin: 4px 0;
    border-radius: 0 25px 25px 0;
    width: 100%; 
    box-sizing: border-box;
}


/* Hover Effect (Chỉ đổi màu nền nhẹ, không đẩy vị trí) */
.sidebar-item:not(.active):hover {
    background-color: #f8fafc;
    color: #007bff;
    /* Xóa transform translateX để tránh giật */
}

/* Active State */
.sidebar-item.active {
    background-color: #eff6ff;
    color: #007bff;
    border-left-color: #007bff;
    font-weight: 600; /* Nếu vẫn bị nhảy, hãy đổi thành 500 */
    box-shadow: 2px 2px 5px rgba(0,123,255,0.05);
}
/* ------------------------------------ */

.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,123,255,0.25) !important; filter: brightness(1.05); }
.btn-primary-hover:active { transform: translateY(0); }
.btn-secondary-hover:hover { background-color: #e2e8f0 !important; color: #1e293b !important; }
.btn-icon-hover:hover { background-color: #f1f5f9 !important; }
.pulse-on-active:active { animation: pulse 0.4s; }

.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1) !important; background-color: #fff !important; }

.hover-lift:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.06) !important; }
.notification-item-hover:hover { background-color: #f8fbff !important; }
.pricing-card-hover:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.08) !important; border-color: #bfdbfe !important; }
.chat-item-hover:hover { background-color: #f8fafc !important; }
.upload-box-hover:hover { border-color: #007bff !important; background-color: #f0f7ff !important; }

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

export default Dashboard;