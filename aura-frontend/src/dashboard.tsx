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