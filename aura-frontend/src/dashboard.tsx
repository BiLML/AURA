import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaTrash, FaImage, FaFileAlt, 
    FaHome, FaComments, FaHospital, FaCreditCard, 
    FaBell, FaSignOutAlt, FaSearch, FaUserCircle, FaCamera, FaCheck, FaCheckDouble 
} from 'react-icons/fa';

// --- Dashboard Component (USER / PATIENT) ---
const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE DỮ LIỆU ---
    const [userRole, setUserRole] = useState<string>('Guest');
    const [userName, setUserName] = useState<string>('');
    const [_id, setUserId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true); 
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [chatData, setChatData] = useState<any[]>([]); 
    const [full_name, setFullName] = useState<string>('');

    // --- STATE CHAT ---
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [currentMessages, setCurrentMessages] = useState<any[]>([]);
    const [newMessageText, setNewMessageText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null); 

    // State giao diện
    const [activeTab, setActiveTab] = useState<string>('home');
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [hasViewedNotifications, setHasViewedNotifications] = useState(false);

    // --- STATE FORM ĐĂNG KÝ PHÒNG KHÁM ---
    // Refs
    const [clinicForm, setClinicForm] = useState({
        name: '', address: '', phone: '', license: '', description: ''
    });
    const [isSubmittingClinic, setIsSubmittingClinic] = useState(false);
    
    const notificationRef = useRef<HTMLDivElement>(null);
    const profileRef = useRef<HTMLDivElement>(null);

    // State ảnh upload
    const [clinicImages, setClinicImages] = useState<{ front: File | null, back: File | null }>({ 
        front: null, back: null 
    });
    const [previewImages, setPreviewImages] = useState<{ front: string | null, back: string | null }>({ 
        front: null, back: null 
    });
    // --- 1. HÀM TẢI DANH SÁCH CHAT ---
    const fetchChatData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: localhost
            const res = await fetch('http://localhost:8000/api/v1/chats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const serverChats = data.chats || []; // Fallback mảng rỗng

                setChatData(prevChats => {
                    // Giữ nguyên logic sort của bạn
                    const prevMap = new Map(prevChats.map((c: any) => [c.id, c]));
                    const mergedChats = serverChats.map((sChat: any) => {
                        const pChat: any = prevMap.get(sChat.id);
                        if (pChat && pChat.time === "Vừa xong" && sChat.preview !== pChat.preview) {
                            return pChat; 
                        }
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

    // --- 2. HÀM TẢI LỊCH SỬ KHÁM (QUAN TRỌNG) ---
// Trong file dashboard.tsx

    const fetchMedicalRecords = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA 1: Thêm dấu '/' ở cuối URL để tránh lỗi 307 Redirect
            const historyRes = await fetch('http://localhost:8000/api/v1/medical-records/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (historyRes.ok) {
                const rawData = await historyRes.json();
                const list = Array.isArray(rawData) ? rawData : (rawData.items || rawData.history || []);

                console.log("Dữ liệu gốc từ API:", list); // Giữ log để debug

                const mappedHistory = list.map((item: any) => {
                // 1. Ngày tháng
                const rawDate = item.created_at || item.upload_date || new Date().toISOString();
                
                // 2. Lấy object kết quả (Do backend đã sửa trả về chuẩn field analysis_result)
                const analysisData = item.analysis_result || {};

                // 3. Xác định trạng thái và kết quả hiển thị
                // Ưu tiên lấy risk_level từ analysis_result
                const risk = analysisData.risk_level;
                
                let statusDisplay = "PENDING";
                let resultDisplay = "Đang phân tích...";

                // Logic: Nếu có risk_level thì coi như đã xong
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

                // Sắp xếp mới nhất lên đầu
                setHistoryData(mappedHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            }
        } catch (err) { console.error("Lỗi cập nhật hồ sơ:", err); }
    }, []);

    // --- 3. HÀM TẢI TIN NHẮN CHAT ---
    const fetchMessageHistory = async (partnerId: string) => {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const res = await fetch(`http://localhost:8000/api/v1/chat/history/${partnerId}`, {
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
            // Sửa method thành POST hoặc PUT tùy backend chat của bạn
            await fetch(`http://localhost:8000/api/v1/chat/read/${partnerId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        fetchChatData(); 
    };

    const checkRoleAndRedirect = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch('http://localhost:8000/api/v1/users/me', { headers: { 'Authorization': `Bearer ${token}` }});
            if (res.ok) {
                const data = await res.json();
                // SỬA: Lấy role trực tiếp
                const currentRole = data.role || (data.user_info && data.user_info.role);
                
                if (currentRole === 'clinic') {
                     alert("🎉 Hồ sơ đã được duyệt! Chuyển hướng...");
                     navigate('/clinic-dashboard', { replace: true });
                }
                if (currentRole !== userRole) setUserRole(currentRole);
            }
        } catch (e) {}
    }, [navigate, userRole]);


    // --- 4. GỬI TIN NHẮN ---
    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessageText.trim() || !selectedChatId) return;

        const textToSend = newMessageText;
        setNewMessageText(''); 

        // Thay thế đoạn tạo tempMsg bằng đoạn này:

        const now = new Date();
        // Lấy giờ phút và tự thêm số 0 đằng trước nếu < 10
        const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const tempMsg = {
            id: Date.now().toString(),
            content: textToSend,
            is_me: true,
            time: timeString, // <--- Dùng biến này thay vì toLocaleTimeString
            is_read: false
        };
        setCurrentMessages(prev => [...prev, tempMsg]);

        setChatData(prevList => {
            const newList = [...prevList];
            const chatIndex = newList.findIndex(c => c.id === selectedChatId);
            if (chatIndex > -1) {
                const updatedChat = { 
                    ...newList[chatIndex], 
                    preview: "Bạn: " + textToSend, 
                    time: "Vừa xong",
                    unread: false 
                };
                newList.splice(chatIndex, 1);
                newList.unshift(updatedChat);
            }
            return newList;
        });

        try {
            const token = localStorage.getItem('token');
            await fetch('http://localhost:8000/api/v1/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ receiver_id: selectedChatId, content: textToSend })
            });
        } catch (err) { alert("Lỗi gửi tin!"); }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [currentMessages]);
    // --- HÀM XỬ LÝ CHỌN ẢNH ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            let objectUrl: string | null = null;
            if (file.type.startsWith('image/')) {
                 objectUrl = URL.createObjectURL(file);
            }
            setClinicImages(prev => ({ ...prev, [type]: file }));
            setPreviewImages(prev => ({ ...prev, [type]: objectUrl }));
        }
    };

    const removeImage = (type: 'front' | 'back') => {
        setClinicImages(prev => ({ ...prev, [type]: null }));
        setPreviewImages(prev => ({ ...prev, [type]: null }));
    };

    // --- HÀM ĐĂNG KÝ PHÒNG KHÁM ---
    const handleClinicSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingClinic(true);
        const token = localStorage.getItem('token');
    
        try {
            const formData = new FormData();
            
            // 1. SỬA TÊN KEY CHO KHỚP VỚI BACKEND (api/clinic.py)
            formData.append('name', clinicForm.name);       // Backend: name
            formData.append('address', clinicForm.address); // Backend: address
            formData.append('phone', clinicForm.phone);     // Backend: phone (đã map map với biến phone_number trong service)
            
            // 2. XỬ LÝ MÃ GIẤY PHÉP (Do DB chưa có cột license, ta ghép vào mô tả)
            const fullDescription = `Mã GP: ${clinicForm.license}. \n${clinicForm.description}`;
            formData.append('description', fullDescription);

            // 3. XỬ LÝ FILE ẢNH
            // Backend chỉ nhận 1 file có key là "logo". 
            // Ta ưu tiên lấy ảnh mặt trước làm logo.
            if (clinicImages.front) {
                formData.append('logo', clinicImages.front); 
            } else if (clinicImages.back) {
                // Nếu không có mặt trước thì lấy mặt sau đỡ
                formData.append('logo', clinicImages.back);
            }

            // Gọi API
            const res = await fetch('http://localhost:8000/api/v1/clinics/register', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}` 
                    // Lưu ý: KHÔNG ĐƯỢC set 'Content-Type': 'multipart/form-data' thủ công 
                    // Fetch sẽ tự động set boundary cho FormData
                },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                alert("Gửi yêu cầu đăng ký thành công! Vui lòng chờ Admin phê duyệt.");
                // Reset form
                setClinicForm({ name: '', address: '', phone: '', license: '', description: '' }); 
                setClinicImages({ front: null, back: null });
                setPreviewImages({ front: null, back: null });
                
                // Chuyển tab hoặc reload data nếu cần
                setActiveTab('home');
            } else {
                // Hiển thị chi tiết lỗi trả về từ Backend
                console.error("Lỗi Backend:", data);
                alert(data.detail || "Có lỗi xảy ra, vui lòng kiểm tra lại thông tin.");
            }
        } catch (error) {
            console.error("Lỗi đăng ký:", error);
            alert("Lỗi kết nối server!");
        } finally {
            setIsSubmittingClinic(false);
        }
    };
