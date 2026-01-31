import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaUser, FaEnvelope, FaPhone, FaArrowLeft, FaSave, 
    FaIdCard, FaGlobe, FaVenusMars, FaRulerVertical, FaWeight, 
    FaMapMarkerAlt, FaSpinner, 
    FaBirthdayCake
} from 'react-icons/fa';

// --- INTERFACES ---
interface ProfileState {
    email: string;
    phone: string;
    date_of_birth: string; 
    hometown: string;
    insurance_id: string; 
    height: string | number; 
    weight: string | number; 
    gender: string; 
    nationality: string; 
    full_name: string;
}

const ProfilePage: React.FC = () => {
    const navigate = useNavigate();
    
    const [userName, setUserName] = useState(''); 
    const [userRole, setUserRole] = useState('');
    
    const [profileData, setProfileData] = useState<ProfileState>({
        email: '', phone: '', 
        date_of_birth: '',
        hometown: '',
        insurance_id: '', height: '', weight: '', gender: '', nationality: '', full_name:''
    });
    
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [errors, setErrors] = useState<{[key: string]: string}>({});

    // --- FETCH DATA ---
    useEffect(() => {
        const fetchProfileData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                const res = await fetch('https://aurahealth.name.vn/api/v1/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) throw new Error("Lỗi tải dữ liệu");
                
                const userData = await res.json();
                const info = userData; 
                const profile = info.profile || {}; 
                const medical = profile.medical_info || {}; 

                setUserName(info.username || ''); 
                setUserRole(info.role || '');
                
                setProfileData({
                    email: info.email || '', 
                    phone: profile.phone || '',
                    full_name: profile.full_name || '',
                    date_of_birth: medical.date_of_birth || '', 
                    hometown: medical.hometown || '',
                    insurance_id: medical.insurance_id || '',
                    height: medical.height || '',
                    weight: medical.weight || '',
                    gender: medical.gender || '',
                    nationality: medical.nationality || ''
                });

            } catch (error) {
                console.error(error);
                if ((error as Error).message.includes('Token')) navigate('/login');
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfileData();
    }, [navigate]);

    const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    // --- UPDATE DATA ---
    const handleSaveProfile = async () => {
        const token = localStorage.getItem('token');
        setIsSaving(true);
        setErrors({});
        try {
            const API_URL = 'https://aurahealth.name.vn/api/v1/users/me';

            const payload = { ...profileData };
            if (!payload.date_of_birth) {
                (payload as any).date_of_birth = null; 
            }

            const res = await fetch(API_URL, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    ...profileData
                })
            });
            
            const data = await res.json(); 
            if (res.ok) { alert("Cập nhật hồ sơ thành công!"); 

            } else if (res.status === 422) {
            // Xử lý lỗi validation từ FastAPI/Pydantic
            const newErrors: {[key: string]: string} = {};
            
            data.detail.forEach((err: any) => {
                // err.loc thường là ["body", "date_of_birth"]
                const fieldName = err.loc[err.loc.length - 1];
                let friendlyMsg = "";

                // Map tin nhắn lỗi sang tiếng Việt
                switch(err.type) {
                    case "date_from_datetime_parsing":
                        friendlyMsg = "Ngày sinh không đúng định dạng hoặc bị trống.";
                        break;
                    case "value_error.missing":
                        friendlyMsg = "Thông tin này là bắt buộc.";
                        break;
                    default:
                        friendlyMsg = err.msg; // Mặc định từ server
                }
                newErrors[fieldName] = friendlyMsg;
            });

            setErrors(newErrors);
            alert("Vui lòng kiểm tra lại các thông tin nhập liệu.");
        } else {
            alert(data.detail || "Lỗi khi lưu hồ sơ.");
        }
    } catch (error) {
        console.error(error);
        alert("Lỗi kết nối server.");
    } finally {
        setIsSaving(false);
    }
    };

    const handleBack = () => {
        const role = userRole.toUpperCase();
        if (role === 'CLINIC_OWNER' || role === 'DOCTOR') navigate('/clinic-dashboard');
        else navigate('/dashboard');
    };
    

    if (isLoading) return <div style={styles.loading}><FaSpinner className="spin" style={{marginRight: 10}}/> Đang tải hồ sơ...</div>;

    return (
        <div style={styles.container}>
            <main style={styles.main}>
                <header style={styles.header}>
                    <div style={styles.sidebarFooter}>
                        <button onClick={handleBack} style={styles.backBtn} className="smooth-btn" > 
                            <FaArrowLeft style={{marginRight: 8}} />
                        </button>
                    </div>

                    <div style={styles.headerRight}>
                        <div style={styles.profileBox} className="profile-hover">
                            <div style={styles.avatarCircle} className="avatar-pulse">{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
                            <span style={styles.userNameText}>{profileData.full_name || userName || 'User'}</span>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    <div style={styles.card} className="card-fade-in" >
                        <div style={styles.cardHeader}>
                            <h3 style={{...styles.pageTitle, fontSize:'18px'}}>Thông tin chi tiết</h3>
                            <button onClick={handleSaveProfile} style={styles.primaryBtn} className="save-btn-hover" disabled={isSaving}>
                                {isSaving ? <><FaSpinner className="spin"/> Đang lưu...</> : <><FaSave style={{marginRight: 8}}/> Lưu </>}
                            </button>
                        </div>
                        
                        <div style={{padding: '30px'}}>
                             <div style={{display:'flex', alignItems:'center', marginBottom:'40px', paddingBottom:'30px', borderBottom:'1px solid #eee'}} className="avatar-section-fade">
                                <div style={{position:'relative', marginRight:'25px'}}>
                                    <div style={styles.largeAvatar} className="large-avatar-hover" >{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
                                </div>
                                <div>
                                    <h2 style={{margin:'0 0 5px 0', fontSize:'24px'}}>{profileData.full_name || userName}</h2>
                                    <p style={{color:'#666', margin:0}}>@{userName} • {userRole}</p>
                                </div>
                            </div>

                            <div style={styles.formGrid}>
                                {/* Cột 1: Thông tin liên hệ */}
                                <div className="section-slide-in" style={{animationDelay: '0.1s'}}>
                                    <div style={styles.sectionTitle}>1. Thông tin liên hệ</div>
                                    <div style={styles.gridRow}>
                                        
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaUser style={styles.iconLabel}/> Họ và tên</label>
                                            <input type="text" name="full_name" value={profileData.full_name} onChange={handleProfileChange} style={styles.formInput} className="smooth-input" />
                                        </div>

                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaEnvelope style={styles.iconLabel}/> Email</label>
                                            <input type="email" name="email" value={profileData.email} onChange={handleProfileChange} style={styles.formInput} className="smooth-input" />
                                        </div>

                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaPhone style={styles.iconLabel}/> Số điện thoại</label>
                                            <input type="tel" name="phone" value={profileData.phone} onChange={handleProfileChange} style={styles.formInput} className="smooth-input" />
                                        </div>
                                    </div>
                                </div>

                                {/* Cột 2: Thông tin cá nhân */}
                                <div className="section-slide-in" style={{animationDelay: '0.2s'}}>
                                    <div style={styles.sectionTitle}>2. Thông tin cá nhân</div>
                                    <div style={styles.gridRow}>
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaBirthdayCake style={styles.iconLabel}/> Ngày sinh</label>
                                            <input 
                                                type="date" 
                                                name="date_of_birth" 
                                                value={profileData.date_of_birth} 
                                                onChange={handleProfileChange} 
                                                style={styles.formInput} 
                                                className="smooth-input"
                                            />
                                            {errors.date_of_birth && (
                                                <span style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>
                                                    {errors.date_of_birth}
                                                </span>
                                            )}
                                        </div>

                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaVenusMars style={styles.iconLabel}/> Giới tính</label>
                                            <select name="gender" value={profileData.gender} onChange={handleProfileChange as any} style={styles.formInput} className="smooth-input" >
                                                <option value="">-- Chọn --</option>
                                                <option value="Male">Nam</option>
                                                <option value="Female">Nữ</option>
                                                <option value="Other">Khác</option>
                                            </select>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaGlobe style={styles.iconLabel}/> Quốc tịch</label>
                                            <input type="text" name="nationality" value={profileData.nationality} onChange={handleProfileChange} style={styles.formInput} className="smooth-input" />
                                        </div>
                                    </div>
                                </div>

                                {/* Cột 3: Chỉ số sức khỏe */}
                                <div className="section-slide-in" style={{animationDelay: '0.3s'}}>
                                    <div style={styles.sectionTitle}>3. Chỉ số cơ bản</div>
                                    <div style={styles.gridRow}>
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaIdCard style={styles.iconLabel}/> Mã BHYT</label>
                                            <input type="text" name="insurance_id" value={profileData.insurance_id} onChange={handleProfileChange} style={styles.formInput}  className="smooth-input"/>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaRulerVertical style={styles.iconLabel}/> Chiều cao (cm)</label>
                                            <input type="number" name="height" value={profileData.height} onChange={handleProfileChange} style={styles.formInput} className="smooth-input"/>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.formLabel}><FaWeight style={styles.iconLabel}/> Cân nặng (kg)</label>
                                            <input type="number" name="weight" value={profileData.weight} onChange={handleProfileChange} style={styles.formInput} className="smooth-input"/>
                                        </div>
                                    </div>
                                </div>

                                {/* Địa chỉ */}
                                <div className="section-slide-in" style={{animationDelay: '0.4s', marginTop: '20px'}}>
                                    <label style={styles.formLabel}><FaMapMarkerAlt style={styles.iconLabel}/> Quê quán / Địa chỉ</label>
                                    <textarea name="hometown" rows={3} value={profileData.hometown} onChange={handleProfileChange} style={{...styles.formInput, resize:'vertical'}} className="smooth-input" ></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES (Giữ nguyên styles gốc) ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', backgroundColor: '#f4f6f9' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'40px' },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#555', display:'flex', alignItems:'center', transition: '0.2s' },
    menuItemActive: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', backgroundColor: '#eef2ff', color: '#007bff', borderRight: '3px solid #007bff', display:'flex', alignItems:'center' },
    menuIcon: { marginRight: '12px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    backBtn: { width: '100%', padding: '12px 15px', color: '#007bff', border: '1px solid transparent', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: '600', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', backgroundColor: 'white' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px' },
    avatarCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '12px', fontWeight:'bold' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto' },
    pageTitle: { fontSize: '18px', margin: 0, color: '#333', fontWeight:'bold' },
    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border:'1px solid rgba(0,0,0,0.05)', overflow:'hidden', marginBottom:'20px', maxWidth: '1000px', margin: '0 auto' },
    cardHeader: { padding:'20px 30px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center', backgroundColor: '#fafbfc' },
    largeAvatar: { width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#007bff', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', fontWeight: 'bold' },
    cameraBtn: { position:'absolute', bottom:0, right:0, background:'white', border:'1px solid #ddd', borderRadius:'50%', width:'28px', height:'28px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#555', boxShadow:'0 2px 4px rgba(0,0,0,0.1)' },
    formGrid: { display: 'flex', flexDirection: 'column', gap: '25px' },
    gridRow: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' },
    sectionTitle: { fontSize: '14px', fontWeight: '700', color: '#007bff', textTransform: 'uppercase', marginBottom: '10px', borderBottom: '2px solid #f0f0f0', paddingBottom: '5px', width: 'fit-content' },
    formGroup: { display: 'flex', flexDirection: 'column' },
    formLabel: { display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: '#444' },
    iconLabel: { color: '#888', marginRight: '5px', fontSize: '12px' },
    formInput: { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #dde2e5', fontSize: '14px', outline: 'none', transition: 'border 0.2s', backgroundColor: '#fff', boxSizing:'border-box' },
    primaryBtn: { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'600', display:'flex', alignItems:'center', fontSize:'14px' },
};

// --- ENHANCED STYLESHEET - CHỈ THÊM HIỆU ỨNG MƯỢT MÀ ---
const styleSheet = document.createElement("style");
styleSheet.innerText = `
  /* 1. Smooth Animations */
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes spin { 
    0% { transform: rotate(0deg); } 
    100% { transform: rotate(360deg); } 
  }

  @keyframes subtlePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); }
    50% { box-shadow: 0 0 0 8px rgba(0, 123, 255, 0); }
  }

  /* 2. Card Fade In */
  .card-fade-in {
    animation: fadeInUp 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }

  /* 3. Section Slide In */
  .section-slide-in {
    animation: slideInLeft 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    opacity: 0;
  }

  /* 4. Avatar Section Fade */
  .avatar-section-fade {
    animation: fadeInUp 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s forwards;
    opacity: 0;
  }

  /* 5. Smooth Input với hiệu ứng mượt mà */
  .smooth-input {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .smooth-input:focus {
    border-color: #007bff !important;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1), 
                0 4px 12px rgba(0, 123, 255, 0.15) !important;
    transform: translateY(-1px);
    background-color: #fff !important;
  }
  
  .smooth-input:hover:not(:focus) {
    border-color: #80bdff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  }

  /* 6. Button Smooth Effects */
  .smooth-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .smooth-btn:hover {
    background-color: #f0f7ff !important;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2) !important;
  }
  
  .smooth-btn:active { 
    transform: translateY(0) scale(0.98); 
  }

  /* 7. Save Button Hover */
  .save-btn-hover {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .save-btn-hover:hover:not(:disabled) {
    background: #0056b3 !important;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 123, 255, 0.4) !important;
  }
  
  .save-btn-hover:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }

  .save-btn-hover:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* 8. Avatar Pulse Effect */
  .avatar-pulse {
    animation: subtlePulse 2s ease-in-out infinite;
    transition: all 0.3s ease;
  }

  .avatar-pulse:hover {
    transform: scale(1.1);
  }

  /* 9. Large Avatar Hover */
  .large-avatar-hover {
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .large-avatar-hover:hover {
    transform: scale(1.08);
    box-shadow: 0 8px 30px rgba(0, 123, 255, 0.4);
  }

  /* 10. Profile Box Hover */
  .profile-hover {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 8px 12px;
    border-radius: 10px;
  }

  .profile-hover:hover {
    background-color: #f8f9fa;
    transform: translateY(-1px);
  }

  /* 11. Spin Animation */
  .spin { 
    animation: spin 1s linear infinite; 
  }

  /* 12. Smooth Scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 10px;
  }

  ::-webkit-scrollbar-thumb {
    background: #007bff;
    border-radius: 10px;
    transition: background 0.3s ease;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #0056b3;
  }

  /* 13. Label Smooth Transition */
  label {
    transition: color 0.2s ease;
  }

  .smooth-input:focus + label,
  .smooth-input:focus ~ label {
    color: #007bff;
  }

  /* 14. Section Title Animation */
  .section-slide-in .sectionTitle {
    position: relative;
  }

  .section-slide-in .sectionTitle::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 2px;
    background: #007bff;
    transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .section-slide-in:hover .sectionTitle::after {
    width: 100%;
  }

  /* 15. Responsive Smooth */
  @media (max-width: 768px) {
    .section-slide-in {
      animation-delay: 0s !important;
    }
  }
`;
document.head.appendChild(styleSheet);

export default ProfilePage;