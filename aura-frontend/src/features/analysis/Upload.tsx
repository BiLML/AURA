import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaCloudUploadAlt, FaTimes, FaSpinner, 
    FaRobot, FaEye, FaChevronDown, FaChevronUp,
    FaServer, FaCheckCircle, FaSync
} from 'react-icons/fa';

const Upload: React.FC = () => {
    const navigate = useNavigate();
    
    // --- STATE UI & DATA ---
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    
    // State User Info
    const [role, setRole] = useState<string>('');
    const [userName, setUserName] = useState<string>('User');
    const [patients, setPatients] = useState<any[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');
    
    // State cấu hình mắt
    const [eyeSide, setEyeSide] = useState<string>('left'); 
    const [isLoading, setIsLoading] = useState(true);
    
    // State UI mở rộng
    const [isExpanded, setIsExpanded] = useState(false);
    
    // MỚI: State cho hiệu ứng Drag & Drop
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // [THÊM] State cho tính năng Cloud Device
    const [activeTab, setActiveTab] = useState<'local' | 'device'>('local');
    const [cloudImages, setCloudImages] = useState<any[]>([]);
    const [selectedCloudUrls, setSelectedCloudUrls] = useState<string[]>([]);
    const [isFetchingCloud, setIsFetchingCloud] = useState(false);

    // --- 1. FETCH DATA & ROLE ---
    useEffect(() => {
        const fetchInitData = async () => {
            const token = localStorage.getItem('token');
            if (!token) { navigate('/login'); return; }

            try {
                await new Promise(r => setTimeout(r, 500)); 

                const userRes = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/users/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (userRes.ok) {
                    const userData = await userRes.json();
                    const info = userData.user_info || userData; 
                    const rawRole = info.role || '';
                    const currentRole = rawRole.toLowerCase().trim();

                    setRole(currentRole);
                    setUserName(info.full_name || info.userName || info.username || 'User');

                    if (['clinic', 'doctor'].includes(currentRole)) {
                        const clinicRes = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/clinics/dashboard-data`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (clinicRes.ok) {
                            const clinicData = await clinicRes.json();
                            setPatients(clinicData.patients || []);
                        }
                    }
                }
            } catch (error) {
                console.error("Lỗi khởi tạo:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchInitData();
    }, [navigate]);

    // --- 2. HANDLERS ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(Array.from(e.target.files));
        }
    };

    const processFiles = (filesArray: File[]) => {
        if (filesArray.length + selectedFiles.length > 200) {
            alert("Hệ thống giới hạn tối đa 100 ảnh mỗi lần để đảm bảo hiệu suất.");
            return;
        }
        
        const newFiles = [...selectedFiles, ...filesArray];
        const newUrls = [...previewUrls, ...filesArray.map(file => URL.createObjectURL(file))];
        
        setSelectedFiles(newFiles);
        setPreviewUrls(newUrls);
    };

    // Xử lý Drag & Drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeFile = (index: number) => {
        const newFiles = selectedFiles.filter((_, i) => i !== index);
        const newUrls = previewUrls.filter((_, i) => i !== index);
        setSelectedFiles(newFiles);
        setPreviewUrls(newUrls);
    };

    // Handler Upload Local
    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;
        setIsUploading(true);
        
        const BACKEND_API = `${import.meta.env.VITE_API_URL}/api/v1/medical-records/batch-analyze`;
        const token = localStorage.getItem('token');

        try {
            const formData = new FormData();
            selectedFiles.forEach(file => formData.append('files', file));
            if (selectedPatientId) formData.append('patient_id', selectedPatientId);
            formData.append('eye_side', eyeSide);

            const response = await fetch(BACKEND_API, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Lỗi xử lý từ server");
            }

            const data = await response.json(); 
            
            navigate('/analysis-result-batch', { state: { 
                batchResults: data.data.map((item: any) => ({
                    id: item.id,
                    status: item.status,
                    diagnosis: item.diagnosis,
                    confidence: item.confidence,
                    image_base64: null, 
                    local_preview: item.image_url,
                    report: item.report
                }))
            }});

        } catch (error) {
            console.error("Lỗi:", error);
            alert(`Thất bại: ${(error as Error).message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const goBack = () => {
        if(['clinic', 'doctor'].includes(role)) navigate('/clinic-dashboard');
        else navigate('/dashboard');
    };

    // [THÊM] Hàm lấy ảnh từ máy chụp (Cloudinary folder)
    const fetchDeviceImages = async () => {
        setIsFetchingCloud(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/medical-records/cloud-device-images`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCloudImages(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsFetchingCloud(false);
        }
    };

    // [THÊM] Hàm chọn/bỏ chọn ảnh cloud
    const toggleCloudImage = (url: string) => {
        if (selectedCloudUrls.includes(url)) {
            setSelectedCloudUrls(selectedCloudUrls.filter(u => u !== url));
        } else {
            setSelectedCloudUrls([...selectedCloudUrls, url]);
        }
    };

    // [THÊM] Hàm gửi lệnh phân tích ảnh Cloud
    const handleCloudAnalyze = async () => {
        if (selectedCloudUrls.length === 0) return;
        setIsUploading(true);
        const token = localStorage.getItem('token');
        
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/medical-records/analyze-cloud-urls`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image_urls: selectedCloudUrls,
                    eye_side: eyeSide,
                    patient_id: selectedPatientId
                })
            });
            
            if (!res.ok) {
                 const err = await res.json();
                 throw new Error(err.detail || "Lỗi phân tích");
            }

            const data = await res.json();
            
            navigate('/analysis-result-batch', { state: { 
                batchResults: data.map((item: any) => ({
                    id: item.id,
                    status: 'COMPLETED',
                    diagnosis: item.diagnosis,
                    confidence: item.confidence,
                    image_base64: null, 
                    local_preview: item.image_url, 
                    report: item.report,
                    annotated_url: item.annotated_image_url 
                }))
            }});

        } catch (error) {
            alert(`Thất bại: ${(error as Error).message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const renderPreviewList = () => {
        const VISIBLE_COUNT = 12;
        const listToRender = isExpanded ? previewUrls : previewUrls.slice(0, VISIBLE_COUNT);
        const hiddenCount = previewUrls.length - VISIBLE_COUNT;

        return (
            <div className="fade-in-up" style={{marginTop: '25px', animationDelay: '0.1s'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                    <h4 style={{fontSize:'14px', margin:0, color:'#555', fontWeight: 600}}>
                        Ảnh đã chọn ({selectedFiles.length}) - {eyeSide === 'left' ? 'Mắt Trái' : 'Mắt Phải'}
                    </h4>
                    {previewUrls.length > VISIBLE_COUNT && (
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)} 
                            className="text-btn-hover"
                            style={{background:'none', border:'none', color:'#007bff', cursor:'pointer', fontSize:'13px', display:'flex', alignItems:'center', gap:'5px', fontWeight: 500}}
                        >
                            {isExpanded ? <><FaChevronUp/> Thu gọn</> : <><FaChevronDown/> Xem tất cả (+{hiddenCount})</>}
                        </button>
                    )}
                </div>
                
                <div style={styles.previewGrid}>
                    {listToRender.map((url, idx) => (
                        <div key={idx} style={styles.previewItem} className="preview-card-hover pop-in">
                            <img src={url} alt="Preview" style={styles.previewImage} />
                            <button onClick={() => removeFile(idx)} className="remove-btn-hover" style={styles.removeBtn}><FaTimes/></button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (isLoading) return <div style={styles.loading}><FaSpinner className="spin" size={30}/> <span style={{marginLeft: 10, fontWeight: 500}}>Đang tải dữ liệu...</span></div>;

    const renderSidebarNav = () => {
        if (['clinic', 'doctor'].includes(role)) {
            return (
                <nav style={styles.nav}>
                    <div style={styles.menuItemActive}><FaRobot style={styles.menuIcon} /> Phân tích AI</div>
                </nav>
            );
        }
        return <nav style={styles.nav}></nav>;
    };

    return (
        <div style={styles.container} className="fade-in">
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <div style={styles.logoRow}>
                        <img src="/logo.svg" alt="Logo" style={{width:'30px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'}} />
                        <span style={styles.logoText}>AI SCANNER</span>
                    </div>
                    <div style={styles.clinicName}>{['clinic', 'doctor'].includes(role) ? 'Dành cho Phòng khám' : 'Cá nhân'}</div>
                </div>
                {renderSidebarNav()}
                <div style={styles.sidebarFooter}>
                </div>
            </aside>

            {/* MAIN */}
            <main style={styles.main}>
                <header style={styles.header}>
                    <h2 style={styles.pageTitle}>Tải ảnh phân tích</h2>
                    <div style={styles.headerRight}>
                        <div style={styles.profileBox} className="hover-effect">
                            <div style={styles.avatarCircle}>{userName.charAt(0).toUpperCase()}</div>
                            <span style={styles.userNameText}>{userName}</span>
                        </div>
                    </div>
                </header>

                <div style={styles.contentBody}>
                    <div style={styles.card} className="slide-up-card">
                        <div style={styles.cardHeader}>
                            <h3 style={styles.sectionTitle}>
                                {['clinic', 'doctor'].includes(role) ? '1. Chọn Hồ sơ & Hình ảnh' : '1. Tải lên hình ảnh'}
                            </h3>
                        </div>

                        <div style={{padding: '30px'}}>
                            
                            {/* KHU VỰC CHỌN THÔNG TIN */}
                            <div style={{display: 'flex', gap: '25px', flexWrap: 'wrap', marginBottom: '30px'}}>
                                {['clinic', 'doctor'].includes(role) && (
                                    <div style={{flex: 1, minWidth: '250px'}}>
                                        <label style={styles.formLabel}>Chọn Bệnh nhân</label>
                                        <select 
                                            className="input-focus"
                                            style={styles.selectInput}
                                            value={selectedPatientId}
                                            onChange={(e) => setSelectedPatientId(e.target.value)}
                                        >
                                            <option value="">-- Không chọn --</option>
                                            {patients.map(p => (
                                                <option key={p.id} value={p.id}>{p.full_name} - {p.phone}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div style={{flex: 1, minWidth: '200px'}}>
                                    <label style={styles.formLabel}><FaEye style={{marginRight:5}}/>Vị trí mắt</label>
                                    <div style={{display: 'flex', gap: '15px', marginTop: '8px'}}>
                                        <label className="radio-label" style={styles.radioLabel}>
                                            <input 
                                                type="radio" name="eyeSide" value="left" 
                                                checked={eyeSide === 'left'} onChange={(e) => setEyeSide(e.target.value)}
                                                style={{marginRight: '8px', cursor:'pointer'}}
                                            />
                                            Mắt Trái (Left)
                                        </label>
                                        <label className="radio-label" style={styles.radioLabel}>
                                            <input 
                                                type="radio" name="eyeSide" value="right" 
                                                checked={eyeSide === 'right'} onChange={(e) => setEyeSide(e.target.value)}
                                                style={{marginRight: '8px', cursor:'pointer'}}
                                            />
                                            Mắt Phải (Right)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* [FIX] THANH TAB CHUYỂN ĐỔI */}
                             <div style={{display:'flex', gap:'15px', marginBottom:'20px', borderBottom:'1px solid #eee', paddingBottom:'15px'}}>
                                 <button 
                                    onClick={() => setActiveTab('local')}
                                    className={activeTab === 'local' ? 'btn-primary-hover' : 'btn-secondary-hover'}
                                    style={activeTab === 'local' ? styles.tabActive : styles.tabInactive}
                                 >
                                    <FaCloudUploadAlt style={{marginRight:8}}/> Tải từ máy tính
                                 </button>
                                 <button 
                                    onClick={() => { setActiveTab('device'); fetchDeviceImages(); }}
                                    className={activeTab === 'device' ? 'btn-primary-hover' : 'btn-secondary-hover'}
                                    style={activeTab === 'device' ? styles.tabActive : styles.tabInactive}
                                 >
                                    <FaServer style={{marginRight:8}}/> Máy chụp đáy mắt
                                 </button>
                            </div>

                            {/* [FIX] RENDER NỘI DUNG THEO TAB */}
                            {activeTab === 'local' ? (
                                <>
                                    {/* UPLOAD ZONE (LOCAL) */}
                                    <div 
                                        className={`upload-zone-hover ${isDragging ? 'dragging' : ''}`}
                                        style={{
                                            ...styles.uploadZone,
                                            borderColor: isDragging ? '#007bff' : '#dde2e5',
                                            backgroundColor: isDragging ? '#f0f7ff' : '#f8fbff',
                                            transform: isDragging ? 'scale(1.01)' : 'scale(1)'
                                        }}
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                    >
                                        <input 
                                            type="file" hidden ref={fileInputRef} accept="image/*" multiple 
                                            onChange={handleFileChange} 
                                        />
                                        <div style={styles.uploadIconCircle} className="icon-pulse">
                                            <FaCloudUploadAlt size={35} color="#007bff" />
                                        </div>
                                        <h4 style={{margin:'15px 0 8px', color:'#333', fontWeight: 600}}>Nhấn hoặc Kéo thả ảnh vào đây</h4>
                                        <p style={{color:'#888', fontSize:'13px', margin:0}}>Hỗ trợ JPG, PNG. Tối đa 100 ảnh/lần.</p>
                                    </div>
                                    
                                    {/* PREVIEW GRID (LOCAL) */}
                                    {selectedFiles.length > 0 && renderPreviewList()}
                                </>
                            ) : (
                                // [FIX] GIAO DIỆN TAB MÁY CHỤP (DEVICE)
                                <div className="fade-in">
                                    <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}>
                                        <span style={{fontSize:14, color:'#666'}}>
                                            Ảnh mới nhất từ máy chụp (Folder: <b>clinic_device_input</b>)
                                        </span>
                                        <button onClick={fetchDeviceImages} style={{border:'none', background:'none', color:'#007bff', cursor:'pointer', display:'flex', alignItems:'center', gap:5}}>
                                            <FaSync className={isFetchingCloud ? "spin" : ""} /> Làm mới
                                        </button>
                                    </div>

                                    {isFetchingCloud ? (
                                        <div style={{padding:40, textAlign:'center', color:'#888'}}>
                                            <FaSpinner className="spin" size={24}/> <p>Đang kết nối thiết bị...</p>
                                        </div>
                                    ) : (
                                        <div style={{...styles.previewGrid, maxHeight:'400px', overflowY:'auto', padding:5}}>
                                            {cloudImages.length === 0 && <p style={{gridColumn:'1/-1', textAlign:'center', color:'#999'}}>Chưa có ảnh nào từ máy chụp.</p>}
                                            
                                            {cloudImages.map((img, idx) => {
                                                const isSelected = selectedCloudUrls.includes(img.url);
                                                return (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => toggleCloudImage(img.url)}
                                                        className="preview-card-hover"
                                                        style={{
                                                            ...styles.previewItem, 
                                                            cursor: 'pointer',
                                                            border: isSelected ? '3px solid #007bff' : '1px solid #eee',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <img src={img.url} style={styles.previewImage} alt="Cloud Device" />
                                                        {isSelected && (
                                                            <div style={{position:'absolute', top:5, right:5, color:'#007bff', background:'white', borderRadius:'50%', boxShadow:'0 0 5px rgba(0,0,0,0.2)'}}>
                                                                <FaCheckCircle size={22}/>
                                                            </div>
                                                        )}
                                                        <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.6)', color:'white', fontSize:'10px', padding:'4px', textAlign:'center'}}>
                                                            {new Date(img.created_at).toLocaleString('vi-VN')}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* [FIX] ACTIONS (Footer) - Thay đổi nút bấm theo Tab */}
                            <div style={styles.actionFooter}>
                                <button onClick={goBack} className="btn-secondary-hover" style={styles.secondaryBtnLarge}>Hủy bỏ</button>
                                
                                {activeTab === 'local' ? (
                                    <button 
                                        className={selectedFiles.length === 0 || isUploading ? '' : 'btn-primary-hover pulse-on-active'}
                                        onClick={handleUpload} 
                                        disabled={selectedFiles.length === 0 || isUploading}
                                        style={selectedFiles.length === 0 || isUploading ? styles.disabledBtn : styles.primaryBtnLarge}
                                    >
                                        {isUploading ? <><FaSpinner className="spin" style={{marginRight:8}}/> Đang xử lý AI...</> : <><FaRobot style={{marginRight:8}}/> Phân tích ngay</>}
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handleCloudAnalyze}
                                        className={selectedCloudUrls.length === 0 || isUploading ? '' : 'btn-primary-hover pulse-on-active'}
                                        disabled={selectedCloudUrls.length === 0 || isUploading}
                                        style={selectedCloudUrls.length === 0 || isUploading ? styles.disabledBtn : styles.primaryBtnLarge}
                                    >
                                        {isUploading ? <><FaSpinner className="spin" style={{marginRight:8}}/> Đang xử lý...</> : `Phân tích ${selectedCloudUrls.length} ảnh đã chọn`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', background:'#f4f6f9', flexDirection:'column' },
    container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', zIndex: 1000 },
    sidebar: { width: '260px', backgroundColor: '#fff', borderRight: '1px solid #e1e4e8', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '2px 0 10px rgba(0,0,0,0.02)' },
    sidebarHeader: { padding: '25px 20px', borderBottom: '1px solid #f0f0f0' },
    logoRow: { display:'flex', alignItems:'center', gap:'10px', marginBottom:'5px' },
    logoText: { fontWeight: '800', fontSize: '18px', color: '#1e293b', letterSpacing: '0.5px' },
    clinicName: { fontSize:'13px', color:'#666', marginLeft:'40px', fontWeight: 500 },
    nav: { flex: 1, padding: '20px 0', overflowY: 'auto' },
    menuItem: { padding: '12px 25px', cursor: 'pointer', fontSize: '14px', color: '#64748b', display:'flex', alignItems:'center', transition: 'all 0.2s ease', borderRadius: '0 20px 20px 0', margin: '2px 0', borderLeft: '3px solid transparent' },
    menuItemActive: { padding: '12px 25px', cursor: 'default', fontSize: '14px', fontWeight: '600', backgroundColor: '#eff6ff', color: '#007bff', borderLeft: '3px solid #007bff', display:'flex', alignItems:'center', borderRadius: '0 20px 20px 0', margin: '2px 0', boxShadow: '2px 2px 5px rgba(0,123,255,0.05)' },
    menuIcon: { marginRight: '12px', fontSize: '16px' },
    sidebarFooter: { padding: '20px', borderTop: '1px solid #f0f0f0' },
    sidebarBackBtn: { width: '100%', padding: '12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight: '600', transition: 'all 0.2s ease'},
    main: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' },
    header: { height: '70px', backgroundColor: '#fff', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 30px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' },
    pageTitle: { fontSize: '20px', margin: 0, color: '#1e293b', fontWeight:'700' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '20px' },
    profileBox: { display:'flex', alignItems:'center', gap:'10px', padding: '5px 10px', borderRadius: '30px', transition: 'background 0.2s' },
    avatarCircle: { width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #007bff, #0056b3)', color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', fontWeight:'bold', boxShadow: '0 2px 5px rgba(0,123,255,0.3)' },
    userNameText: { fontSize:'14px', fontWeight:'600', color: '#333' },
    contentBody: { padding: '30px', flex: 1, overflowY: 'auto', display:'flex', justifyContent:'center' },
    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f0f0f0', overflow:'hidden', width: '100%', maxWidth: '800px', height: 'fit-content', transition: 'transform 0.3s ease' },
    cardHeader: { padding:'25px 35px', borderBottom:'1px solid #f0f0f0', backgroundColor:'#fff' },
    sectionTitle: { fontSize: '17px', fontWeight: '700', color: '#1e293b', margin: 0 },
    formLabel: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#334155' },
    selectInput: { width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', backgroundColor: '#fff', transition: 'all 0.2s', color: '#333' },
    radioLabel: { display:'flex', alignItems:'center', cursor:'pointer', padding: '8px 12px', borderRadius: '6px', border: '1px solid transparent', transition: 'all 0.2s', backgroundColor: '#f8fafc' },
    uploadZone: { border: '2px dashed #cbd5e1', borderRadius: '16px', padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fbff', cursor: 'pointer', transition: 'all 0.3s ease' },
    uploadIconCircle: { width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '15px', boxShadow: '0 4px 15px rgba(0,123,255,0.1)' },
    previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '15px' },
    previewItem: { position: 'relative', height: '110px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', transition: 'all 0.3s' },
    previewImage: { width: '100%', height: '100%', objectFit: 'cover' },
    removeBtn: { position: 'absolute', top: '5px', right: '5px', width: '26px', height: '26px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.9)', color: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'all 0.2s' },
    actionFooter: { marginTop: '30px', borderTop: '1px solid #f1f5f9', paddingTop: '25px', display: 'flex', justifyContent: 'flex-end', gap: '15px' },
    secondaryBtnLarge: { padding: '12px 28px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize:'14px', fontWeight:'600', transition: 'all 0.2s' },
    primaryBtnLarge: { padding: '12px 35px', background: 'linear-gradient(135deg, #007bff, #0069d9)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize:'14px', fontWeight:'600', display:'flex', alignItems:'center', boxShadow: '0 4px 12px rgba(0,123,255,0.2)', transition: 'all 0.2s' },
    disabledBtn: { padding: '12px 35px', background: '#e2e8f0', color: '#94a3b8', border: 'none', borderRadius: '10px', cursor: 'not-allowed', fontSize:'14px', fontWeight:'600', display:'flex', alignItems:'center' }
};

// [FIX] CHUYỂN LOGIC MERGE STYLE RA NGOÀI OBJECT
const extraStyles = {
    tabActive: { 
        padding: '10px 20px', 
        borderRadius: '8px', 
        border: 'none', 
        background: '#e0f2fe', 
        color: '#0284c7', 
        fontWeight: 'bold', 
        cursor: 'default', 
        display:'flex', 
        alignItems:'center' 
    },
    tabInactive: { 
        padding: '10px 20px', 
        borderRadius: '8px', 
        border: 'none', 
        background: 'transparent', 
        color: '#64748b', 
        fontWeight: '500', 
        cursor: 'pointer', 
        display:'flex', 
        alignItems:'center' 
    }
};

Object.assign(styles, extraStyles);

// --- CSS GLOBAL & ANIMATIONS ---
const cssGlobal = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes popIn { 0% { opacity: 0; transform: scale(0.8); } 100% { opacity: 1; transform: scale(1); } }
@keyframes pulse { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); } 70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(0, 123, 255, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); } }

.spin { animation: spin 1s linear infinite; }
.fade-in { animation: fadeIn 0.4s ease-out forwards; }
.slide-up-card { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.fade-in-up { animation: slideUp 0.4s ease-out forwards; opacity: 0; }
.pop-in { animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }

/* Hover Effects */
.sidebar-item:hover { background-color: #f8fafc; color: #007bff !important; transform: translateX(5px); }
.sidebar-btn-hover:hover { background-color: #e2e8f0 !important; }
.text-btn-hover:hover { text-decoration: underline; color: #0056b3 !important; }

.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1); }
.radio-label:hover { background-color: #eef2ff !important; border-color: #e0e7ff !important; }

.upload-zone-hover:hover { border-color: #007bff !important; background-color: #f0f7ff !important; }
.upload-zone-hover:active { transform: scale(0.99) !important; }

.preview-card-hover:hover { transform: translateY(-3px); box-shadow: 0 8px 15px rgba(0,0,0,0.08) !important; }
.remove-btn-hover:hover { background-color: #ff4d4f !important; color: white !important; transform: rotate(90deg); }

.btn-secondary-hover:hover { background-color: #e2e8f0 !important; color: #1e293b !important; }
.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,123,255,0.3) !important; filter: brightness(1.05); }
.btn-primary-hover:active { transform: translateY(0); }

.pulse-on-active:active { animation: pulse 0.5s; }
.icon-pulse { transition: transform 0.3s; }
.upload-zone-hover:hover .icon-pulse { transform: scale(1.1); }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default Upload;