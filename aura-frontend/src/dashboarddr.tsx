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
