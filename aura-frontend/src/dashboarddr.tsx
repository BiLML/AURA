import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaPaperPlane, FaUserMd, FaUsers, FaClipboardList, FaCommentDots, 
    FaSearch, FaTimes, FaSignOutAlt, FaBell, FaChartBar, FaStethoscope,
    FaFileAlt, FaEdit, FaCheckCircle, FaExclamationTriangle, FaCheck, FaCheckDouble 
} from 'react-icons/fa';

// --- Dashboard Component (Bác sĩ) ---
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

    // --- STATE MỚI CHO TÍNH NĂNG BÁO CÁO [FR-19] ---
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportForm, setReportForm] = useState({
        patientId: '',
        aiResult: 'Nguy cơ cao', 
        doctorDiagnosis: '',
        accuracy: 'CORRECT', // 'CORRECT' | 'INCORRECT'
        notes: ''
    });
    const [submittedReports, setSubmittedReports] = useState<any[]>([]);

    // 1. Hàm lấy danh sách báo cáo
    const fetchMyReports = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: localhost
            const res = await fetch('http://localhost:8000/api/v1/reports/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSubmittedReports(data.reports || []); 
            }
        } catch (error) {
            console.error("Lỗi tải báo cáo:", error);
        }
    }, []);

    // 2. Hàm gửi báo cáo
    const submitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) { alert("Vui lòng đăng nhập lại"); return; }

        // 1. Lấy record_id từ patientId đang chọn
        // (Form chọn Patient, nhưng API cần Record ID của lần khám mới nhất)
        const selectedP = patientsData.find(p => String(p.id) === String(reportForm.patientId));
        const recordId = selectedP?.latest_scan?.record_id;

        if (!recordId) {
            alert("Bệnh nhân này chưa có hồ sơ khám bệnh để chẩn đoán!");
            return;
        }

        try {
            // GỌI ĐÚNG API PUT MÀ BẠN ĐÃ VIẾT TRONG DOCTOR.PY
            const res = await fetch(`http://localhost:8000/api/v1/doctor/records/${recordId}/diagnose`, { 
                method: 'PUT', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    // Chỉ gửi 2 trường mà Backend (DoctorDiagnosisUpdate) yêu cầu
                    doctor_diagnosis: reportForm.doctorDiagnosis,
                    doctor_notes: reportForm.notes
                    
                    // Lưu ý: Các trường 'accuracy', 'aiResult' chỉ để hiển thị UI, 
                    // không cần gửi lên nếu Backend không nhận.
                })
            });

            if (res.ok) {
                alert("Đã cập nhật chẩn đoán thành công!");
                setShowReportModal(false);
                setReportForm({ ...reportForm, doctorDiagnosis: '', notes: '' });
                
                // Refresh lại dữ liệu để cập nhật bảng bên ngoài
                // (Gọi lại fetchPatients hoặc reload page tùy bạn)
                const patientsRes = await fetch('http://localhost:8000/api/v1/doctor/my-patients', { headers: { 'Authorization': `Bearer ${token}` } });
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

    useEffect(() => {
        if (activeTab === 'reports') {
            fetchMyReports();
        }
    }, [activeTab, fetchMyReports]);

    // 1. Hàm lấy danh sách báo cáo
    const fetchMyReports = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            // SỬA: localhost
            const res = await fetch('http://localhost:8000/api/v1/reports/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSubmittedReports(data.reports || []); 
            }
        } catch (error) {
            console.error("Lỗi tải báo cáo:", error);
        }
    }, []);

    // 2. Hàm gửi báo cáo
    const submitReport = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('token');
        if (!token) { alert("Vui lòng đăng nhập lại"); return; }

        // 1. Lấy record_id từ patientId đang chọn
        // (Form chọn Patient, nhưng API cần Record ID của lần khám mới nhất)
        const selectedP = patientsData.find(p => String(p.id) === String(reportForm.patientId));
        const recordId = selectedP?.latest_scan?.record_id;

        if (!recordId) {
            alert("Bệnh nhân này chưa có hồ sơ khám bệnh để chẩn đoán!");
            return;
        }

        try {
            // GỌI ĐÚNG API PUT MÀ BẠN ĐÃ VIẾT TRONG DOCTOR.PY
            const res = await fetch(`http://localhost:8000/api/v1/doctor/records/${recordId}/diagnose`, { 
                method: 'PUT', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    // Chỉ gửi 2 trường mà Backend (DoctorDiagnosisUpdate) yêu cầu
                    doctor_diagnosis: reportForm.doctorDiagnosis,
                    doctor_notes: reportForm.notes
                    
                    // Lưu ý: Các trường 'accuracy', 'aiResult' chỉ để hiển thị UI, 
                    // không cần gửi lên nếu Backend không nhận.
                })
            });

            if (res.ok) {
                alert("Đã cập nhật chẩn đoán thành công!");
                setShowReportModal(false);
                setReportForm({ ...reportForm, doctorDiagnosis: '', notes: '' });
                
                // Refresh lại dữ liệu để cập nhật bảng bên ngoài
                // (Gọi lại fetchPatients hoặc reload page tùy bạn)
                const patientsRes = await fetch('http://localhost:8000/api/v1/doctor/my-patients', { headers: { 'Authorization': `Bearer ${token}` } });
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

    useEffect(() => {
        if (activeTab === 'reports') {
            fetchMyReports();
        }
    }, [activeTab, fetchMyReports]);
