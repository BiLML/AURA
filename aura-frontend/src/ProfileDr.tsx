import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaUserMd, FaPhone, FaEnvelope, FaMapMarkerAlt, 
    FaVenusMars, FaSave, FaArrowLeft, FaCamera, 
    FaSpinner, FaBirthdayCake, FaHome, FaHospital, FaPen 
} from 'react-icons/fa';

// Import icon check cho thông báo thành công
import { FaCheckCircle } from 'react-icons/fa';

const ProfileDr: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE ---
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [message, setMessage] = useState({ type: '', content: '' });
    const [isSaving, setIsSaving] = useState(false);

    // STATE DATA
    const [profile, setProfile] = useState({
        username: '', 
        full_name: '',
        email: '',
        phone: '',
        date_of_birth: '', 
        hometown: '', 
        gender: '',
        nationality: '',
        role: 'doctor'
    });

    // --- LẤY DỮ LIỆU TỪ SERVER ---
    useEffect(() => {
        const fetchProfile = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                const res = await fetch('http://localhost:8000/api/v1/users/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    
                    const info = data.user_info || data;
                    const userProfile = info.profile || {};
                    const medical = userProfile.medical_info || {};

                    if (info.role?.toUpperCase() !== 'DOCTOR') {
                        navigate('/dashboard'); 
                        return;
                    }

                    setProfile({
                        username: info.username || info.userName || '',
                        full_name: info.full_name || userProfile.full_name || '',
                        email: info.email || '',
                        phone: info.phone || userProfile.phone || '',
                        date_of_birth: info.date_of_birth || medical.date_of_birth || '', 
                        hometown: medical.hometown || info.hometown || '', 
                        gender: info.gender || userProfile.gender || 'Nam',
                        nationality: info.nationality || userProfile.nationality || 'Việt Nam',
                        role: info.role
                    });
                } else {
                    if (res.status === 401) navigate('/login');
                }
            } catch (error) {
                console.error("Lỗi tải hồ sơ:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [navigate]);

    // --- LƯU DỮ LIỆU ---
    const handleSave = async () => {
        const token = localStorage.getItem('token');
        setIsSaving(true);
        setMessage({ type: '', content: '' });

        try {
            const res = await fetch('http://localhost:8000/api/v1/users/me', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    full_name: profile.full_name,
                    email: profile.email,
                    phone: profile.phone,
                    date_of_birth: profile.date_of_birth,
                    hometown: profile.hometown,
                    gender: profile.gender,
                    nationality: profile.nationality
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: 'success', content: 'Cập nhật hồ sơ thành công!' });
                setIsEditing(false);
            } else {
                setMessage({ type: 'error', content: data.detail || 'Lỗi cập nhật. Vui lòng thử lại.' });
            }
        } catch (error) {
            setMessage({ type: 'error', content: 'Lỗi kết nối server.' });
        } finally {
            setIsSaving(false);
            setTimeout(() => setMessage({ type: '', content: '' }), 3000);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setProfile({ ...profile, [e.target.name]: e.target.value });
    };

    if (isLoading) return <div style={styles.loading}><FaSpinner className="spin" size={40} color="#007bff" style={{marginBottom: 20}}/></div>;

    return (
        <div style={styles.container} className="fade-in">
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <FaUserMd size={26} color="#007bff" />
                        <span style={styles.logoText}>AURA DOCTOR</span>
                    </div>
                    <div style={styles.clinicName}>Hồ sơ cá nhân</div>
                </div>
                
                <div style={styles.nav}>
                    <button 
                        style={styles.backBtn} 
                        className="sidebar-item" 
                        onClick={() => navigate('/dashboarddr')}
                    >
                        <FaArrowLeft style={styles.menuIcon} /> Quay lại
                    </button>
                </div>
                
                <div style={styles.sidebarFooter}>
                    <div style={{fontSize:'12px', color:'#94a3b8', textAlign:'center'}}>
                        AURA Health System
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                {/* Header Profile */}
                <div style={styles.header}>
                    <h2 style={{margin:0, color:'#1e293b', fontSize:'24px'}}>Hồ sơ cá nhân</h2>
                    <span style={{color:'#64748b', fontSize:'14px'}}>Quản lý thông tin cá nhân và bảo mật</span>
                </div>

                <div style={styles.contentBody}>
                    <div style={styles.profileCard} className="slide-up-card">
                        
                        {/* COVER & AVATAR SECTION */}
                        <div style={styles.coverSection}>
                            <div style={styles.avatarWrapper}>
                                <div style={styles.avatar}>
                                    {profile.username ? profile.username.charAt(0).toUpperCase() : 'D'}
                                </div>
                                {isEditing && (
                                    <div style={styles.cameraIcon} className="hover-lift">
                                        <FaCamera color="white" size={14}/>
                                    </div>
                                )}
                            </div>
                            <div style={styles.nameSection}>
                                <h2 style={{margin: '0 0 5px', color: '#1e293b', fontSize: '22px'}}>{profile.full_name || profile.username}</h2>
                                <div style={styles.roleBadge}><FaHospital style={{marginRight:5}}/> Bác sĩ Chuyên khoa</div>
                            </div>
                            
                            <div style={styles.topActions}>
                                {!isEditing && (
                                    <button 
                                        className="btn-primary-hover" 
                                        style={styles.editBtn} 
                                        onClick={() => setIsEditing(true)}
                                    >
                                        <FaPen style={{marginRight: 8}}/> Chỉnh sửa hồ sơ
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* FORM SECTION */}
                        <div style={styles.formContainer}>
                            {message.content && (
                                <div style={{
                                    ...styles.alert, 
                                    backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2', 
                                    color: message.type === 'success' ? '#047857' : '#b91c1c',
                                    border: message.type === 'success' ? '1px solid #d1fae5' : '1px solid #fecaca'
                                }}>
                                    {message.type === 'success' ? <FaCheckCircle style={{marginRight:8}}/> : null}
                                    {message.content}
                                </div>
                            )}

                            <div style={styles.gridForm}>
                                {/* Cột 1 */}
                                <div>
                                    <h4 style={styles.sectionTitle}>Thông tin cơ bản</h4>
                                    
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Tên đăng nhập</label>
                                        <div style={styles.inputWrapper}>
                                            <FaUserMd style={styles.inputIcon}/>
                                            <input type="text" value={profile.username} disabled style={{...styles.input, backgroundColor: '#f1f5f9', color:'#64748b'}} />
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Họ và tên <span style={{color:'red'}}>*</span></label>
                                        <div style={styles.inputWrapper}>
                                            <FaPen style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="text" name="full_name"
                                                value={profile.full_name} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                                placeholder="Nhập họ tên..."
                                            />
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Giới tính</label>
                                        <div style={styles.inputWrapper}>
                                            <FaVenusMars style={styles.inputIcon}/>
                                            <select 
                                                className={isEditing ? "input-focus" : ""}
                                                name="gender" value={profile.gender} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input}
                                            >
                                                <option value="Nam">Nam</option>
                                                <option value="Nữ">Nữ</option>
                                                <option value="Khác">Khác</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Ngày sinh</label>
                                        <div style={styles.inputWrapper}>
                                            <FaBirthdayCake style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="date" 
                                                name="date_of_birth"
                                                value={profile.date_of_birth} 
                                                onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Cột 2 */}
                                <div>
                                    <h4 style={styles.sectionTitle}>Liên hệ & Địa chỉ</h4>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Email</label>
                                        <div style={styles.inputWrapper}>
                                            <FaEnvelope style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="email" name="email"
                                                value={profile.email} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                                placeholder="example@hospital.com"
                                            />
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Số điện thoại</label>
                                        <div style={styles.inputWrapper}>
                                            <FaPhone style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="text" name="phone"
                                                value={profile.phone} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                                placeholder="09..."
                                            />
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Quốc tịch</label>
                                        <div style={styles.inputWrapper}>
                                            <FaMapMarkerAlt style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="text" name="nationality"
                                                value={profile.nationality} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                            />
                                        </div>
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Quê quán</label>
                                        <div style={styles.inputWrapper}>
                                            <FaHome style={styles.inputIcon}/>
                                            <input 
                                                className={isEditing ? "input-focus" : ""}
                                                type="text" name="hometown"
                                                value={profile.hometown} onChange={handleChange}
                                                disabled={!isEditing} 
                                                style={isEditing ? styles.inputActive : styles.input} 
                                                placeholder="Tỉnh/Thành phố..."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Buttons Area */}
                            {isEditing && (
                                <div style={styles.actionButtons}>
                                    <button 
                                        className="btn-secondary-hover" 
                                        style={styles.cancelBtn} 
                                        onClick={() => setIsEditing(false)} 
                                        disabled={isSaving}
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button 
                                        className="btn-primary-hover pulse-on-active" 
                                        style={styles.saveBtn} 
                                        onClick={handleSave} 
                                        disabled={isSaving}
                                    >
                                        {isSaving ? <><FaSpinner className="spin"/> Đang lưu...</> : <><FaSave /> Lưu thay đổi</>}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    // Layout Global
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden' },
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', backgroundColor: '#f4f6f9' },

    // Sidebar
    sidebar: { width: '270px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '4px 0 15px rgba(0,0,0,0.02)', zIndex: 10 },
    sidebarHeader: { padding: '25px 25px', borderBottom: '1px solid #f1f5f9' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom: '5px' },
    logoText: { fontWeight: '800', fontSize: '20px', color: '#1e293b', letterSpacing: '-0.5px' },
    clinicName: { fontSize:'13px', color:'#64748b', marginLeft:'36px', fontWeight: 500 },
    
    // Đã fix lỗi overflowX
    nav: { flex: 1, padding: '25px 0', overflowY: 'auto', overflowX: 'hidden' }, 
    
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f1f5f9' },
    
    // Đã fix lỗi box-sizing gây ra thanh cuộn ngang
    backBtn: { 
        width: '100%', border: 'none', background: 'transparent', textAlign: 'left', 
        fontSize: '15px', color: '#64748b', cursor: 'pointer', padding: '12px 25px', 
        display: 'flex', alignItems: 'center', fontWeight: '500',
        boxSizing: 'border-box' // Quan trọng: Ngăn padding cộng dồn vào width
    },
    menuIcon: { marginRight: '14px', fontSize: '18px' },

    // Main Area
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' },
    header: { padding: '20px 40px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', justifyContent: 'center' },
    contentBody: { padding: '30px 40px', maxWidth: '1000px', margin: '0 auto', width: '100%', boxSizing: 'border-box' },

    // Card
    profileCard: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', overflow: 'hidden' },
    
    // Cover & Avatar
    coverSection: { padding: '30px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '25px', background: 'linear-gradient(to right, #fff, #f8fafc)' },
    avatarWrapper: { position: 'relative' },
    avatar: { width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff, #0056b3)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 'bold', border: '4px solid white', boxShadow: '0 4px 15px rgba(0,123,255,0.2)' },
    cameraIcon: { position: 'absolute', bottom: '0', right: '0', backgroundColor: '#334155', padding: '6px', borderRadius: '50%', cursor: 'pointer', border: '2px solid white', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    
    nameSection: { flex: 1 },
    roleBadge: { display: 'inline-flex', alignItems: 'center', backgroundColor: '#eff6ff', color: '#007bff', padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', border: '1px solid #dbeafe' },
    topActions: {},

    // Form
    formContainer: { padding: '30px' },
    sectionTitle: { fontSize: '16px', fontWeight: '700', color: '#334155', marginBottom: '20px', borderBottom: '2px solid #f1f5f9', paddingBottom: '10px' },
    gridForm: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
    formGroup: { marginBottom: '20px' },
    label: { fontSize: '13px', color: '#64748b', fontWeight: '600', marginBottom: '8px', display: 'block' },
    inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
    inputIcon: { position: 'absolute', left: '12px', color: '#94a3b8', zIndex: 1 },
    
    // Inputs
    input: { width: '100%', padding: '10px 15px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', color: '#334155', backgroundColor: '#f8fafc', transition: 'all 0.2s', boxSizing: 'border-box' },
    inputActive: { width: '100%', padding: '10px 15px 10px 36px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', color: '#1e293b', backgroundColor: '#fff', transition: 'all 0.2s', boxSizing: 'border-box' },

    // Alert & Buttons
    alert: { padding: '12px', borderRadius: '8px', marginBottom: '25px', fontSize: '14px', display: 'flex', alignItems: 'center', fontWeight: '500' },
    actionButtons: { marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' },
    
    editBtn: { padding: '10px 20px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: 'white', color: '#334155', cursor: 'pointer', fontWeight: '600', fontSize: '14px', display:'flex', alignItems:'center', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
    saveBtn: { padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0,123,255,0.2)' },
    cancelBtn: { padding: '10px 24px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: '600' }
};

// --- GLOBAL CSS INJECTION ---
const cssGlobal = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.spin { animation: spin 1s linear infinite; }
.fade-in { animation: fadeIn 0.4s ease-out forwards; }
.slide-up-card { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }

.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1) !important; background-color: #fff !important; }
.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,123,255,0.25) !important; }
.btn-primary-hover:active { transform: translateY(0); }
.btn-secondary-hover:hover { background-color: #f1f5f9 !important; color: #007bff !important; }
.hover-lift:hover { transform: translateY(-2px); }

/* Sidebar Item Style override */
.sidebar-item:hover { background-color: #f8fafc; color: #007bff !important; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default ProfileDr;