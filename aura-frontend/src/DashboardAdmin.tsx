import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaHospital, FaBrain, FaSignOutAlt, FaSearch, 
    FaCheck, FaUsers, FaUserShield, FaBell 
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
        medical_info: any | null; // Vì model là JSONB
    };
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
}

const DashboardAdmin: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [activeTab, setActiveTab] = useState<'users' | 'clinics' | 'feedback'>('users'); 
    const [adminName, setAdminName] = useState('Admin');
    const [isLoading, setIsLoading] = useState(true);

    const [userList, setUserList] = useState<User[]>([]);
    const [doctorList, setDoctorList] = useState<User[]>([]); 
    const [clinicRequests, setClinicRequests] = useState<ClinicRequest[]>([]);
    const [feedbackList, setFeedbackList] = useState<any[]>([]); 

    // UI Dropdown
    const [showUserMenu, setShowUserMenu] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
