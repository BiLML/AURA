import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaArrowLeft, FaRobot, FaUserMd, 
    FaExclamationTriangle, FaCheckCircle, FaNotesMedical, FaBrain, FaPrint 
} from 'react-icons/fa';

// --- INTERFACES ---
interface AnalysisData {
    id: string;
    patient_name: string;
    upload_date: string;
    image_url: string;
    annotated_image_url: string | null;

    // Phần AI
    ai_risk_level: string;         
    ai_detailed_report: string;    
    
    // Phần Bác sĩ (Validation)
    doctor_name: string | null;
    doctor_diagnosis: string | null;
    doctor_notes: string | null;
    is_validated: boolean;

    is_internal?: boolean;
}

const ClinicAnalysisResult: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [data, setData] = useState<AnalysisData | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'original' | 'annotated'>('annotated'); 

    // --- FETCH DATA ---
    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!id || !token) return;

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/clinics/medical-records/${id}/detail`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const raw = await res.json();
                const formattedData: AnalysisData = {
                    id: raw.id,
                    patient_name: raw.patient_name || "Unknown",
                    upload_date: raw.created_at || new Date().toISOString(),
                    image_url: raw.image_url,
                    annotated_image_url: raw.annotated_image_url,
                    
                    ai_risk_level: raw.ai_risk_level || "Chưa xác định",
                    ai_detailed_report: raw.ai_detailed_report || "Không có báo cáo chi tiết.",
                    
                    is_validated: raw.is_validated,
                    doctor_name: raw.doctor_name,
                    doctor_diagnosis: raw.doctor_diagnosis,
                    doctor_notes: raw.doctor_notes,

                    is_internal: raw.is_internal
                };
                setData(formattedData);
            }
        } catch (error) {
            console.error("Lỗi kết nối:", error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // --- HELPER: MÀU SẮC MỨC ĐỘ ---
    const getSeverityColor = (text: string) => {
        if (!text) return '#64748b';
        const t = text.toLowerCase();
        if (t.includes('nặng') || t.includes('severe') || t.includes('pdr')) return '#dc2626';
        if (t.includes('trung bình') || t.includes('moderate')) return '#ea580c';
        if (t.includes('nhẹ') || t.includes('mild')) return '#d97706';
        if (t.includes('bình thường') || t.includes('normal') || t.includes('không')) return '#16a34a';
        return '#2563eb';
    };

    const getSeverityBg = (text: string) => {
        if (!text) return '#f1f5f9';
        const t = text.toLowerCase();
        if (t.includes('nặng') || t.includes('severe') || t.includes('pdr')) return '#fef2f2';
        if (t.includes('trung bình') || t.includes('moderate')) return '#fff7ed';
        if (t.includes('nhẹ') || t.includes('mild')) return '#fffbeb';
        if (t.includes('bình thường') || t.includes('normal') || t.includes('không')) return '#f0fdf4';
        return '#eff6ff';
    };

    if (loading) return <div style={styles.loading}><div className="spin" style={{fontSize:'30px', marginRight:'10px'}}>⏳</div> Đang tải hồ sơ...</div>;
    if (!data) return <div style={styles.loading}>Không tìm thấy dữ liệu.</div>;

    return (
        <div style={styles.container} className="fade-in">
            {/* --- HEADER --- */}
            <header style={styles.topBar}>
                <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                    <button onClick={() => navigate(-1)} style={styles.backBtn} className="btn-secondary-hover">
                        <FaArrowLeft style={{marginRight: '6px'}}/> Quay lại
                    </button>
                    <div style={styles.headerInfo}>
                        <h1 style={styles.title}>HỒ SƠ #{data.id.toString().slice(0, 8)}</h1>
                        <span style={{fontSize:'12px', color:'#64748b'}}>Ngày tạo: {new Date(data.upload_date).toLocaleDateString('vi-VN')}</span>
                    </div>
                </div>
                
                <div style={{display:'flex', gap:'15px', alignItems:'center'}}>
                    <div style={styles.metaRow}>
                        <span style={styles.metaItem}><FaUserMd style={{color:'#64748b'}}/> Bệnh nhân: <b>{data.patient_name}</b></span>
                    </div>
                    {data.is_validated ? 
                        <span style={{...styles.badge, background:'#dcfce7', color:'#166534'}}><FaCheckCircle style={{marginRight:5}}/> Đã thẩm định</span> : 
                        <span style={{...styles.badge, background:'#fff7ed', color:'#c2410c'}}><FaExclamationTriangle style={{marginRight:5}}/> Chờ bác sĩ</span>
                    }
                    <button style={styles.printBtn} className="btn-primary-hover"><FaPrint/></button>
                </div>
            </header>

            <div style={styles.mainContent}>
                
                {/* --- CỘT TRÁI: HÌNH ẢNH (VISUAL) --- */}
                <div style={styles.leftCol}>
                    <div style={styles.imageCard} className="slide-up-card">
                        <div style={styles.imageHeader}>
                            <h3 style={{margin:0, fontSize:'16px', color:'#1e293b'}}>Hình ảnh Võng mạc</h3>
                            {data.annotated_image_url ? (
                                <div style={styles.toggleGroup}>
                                    <button 
                                        style={viewMode === 'original' ? styles.toggleActive : styles.toggle}
                                        onClick={() => setViewMode('original')}
                                    >Ảnh gốc</button>
                                    <button 
                                        style={viewMode === 'annotated' ? styles.toggleActive : styles.toggle}
                                        onClick={() => setViewMode('annotated')}
                                    >AI Khoanh vùng</button>
                                </div>
                            ) : <span style={{fontSize:'12px', color:'#94a3b8'}}>Không có ảnh phân tích</span>}
                        </div>
                        
                        <div style={styles.imageWrapper}>
                            <img 
                                src={viewMode === 'annotated' && data.annotated_image_url ? data.annotated_image_url : data.image_url} 
                                alt="Retina" 
                                style={styles.mainImage}
                            />
                        </div>
                        
                        {viewMode === 'annotated' && (
                            <div style={styles.legend}>
                                <div style={styles.legendItem}><span style={{...styles.dot, background:'red'}}></span> Xuất huyết</div>
                                <div style={styles.legendItem}><span style={{...styles.dot, background:'yellow'}}></span> Xuất tiết</div>
                                <div style={styles.legendItem}><span style={{...styles.dot, background:'blue'}}></span> Đĩa thị</div>
                                <div style={styles.legendItem}><span style={{...styles.dot, background:'green'}}></span> Mạch máu</div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- CỘT PHẢI: KẾT QUẢ (DATA) --- */}
                <div style={styles.rightCol}>
                    
                    {/* 1. KẾT QUẢ AI */}
                    <div style={styles.sectionCard} className="slide-up-card">
                        <div style={styles.sectionHeader}>
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <div style={{background:'#eff6ff', padding:'8px', borderRadius:'8px'}}><FaRobot size={20} color="#3b82f6"/></div>
                                <span style={styles.sectionTitle}>KẾT QUẢ AI PHÂN TÍCH</span>
                            </div>
                        </div>
                        <div style={styles.sectionBody}>
                            <div style={styles.resultRow}>
                                <span style={styles.label}>Đánh giá rủi ro:</span>
                                <span style={{
                                    ...styles.resultValue, 
                                    color: getSeverityColor(data.ai_risk_level),
                                    background: getSeverityBg(data.ai_risk_level),
                                    padding: '4px 12px', borderRadius: '20px'
                                }}>
                                    {data.ai_risk_level}
                                </span>
                            </div>
                            <div style={styles.reportBox}>
                                <div style={styles.reportLabel}><FaBrain style={{marginRight:5}}/> Chi tiết tham số:</div>
                                <p style={styles.reportText}>
                                    {data.ai_detailed_report}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 2. KẾT QUẢ BÁC SĨ (CHỈ HIỆN NẾU ĐÃ THẨM ĐỊNH) */}
                    {!data.is_internal && (
                        <>
                            {data.is_validated ? (
                                <div style={{...styles.sectionCard, borderLeft: '4px solid #16a34a', animationDelay: '0.1s'}} className="slide-up-card">
                                    <div style={styles.sectionHeader}>
                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                            <div style={{background:'#f0fdf4', padding:'8px', borderRadius:'8px'}}><FaUserMd size={20} color="#16a34a"/></div>
                                            <span style={{...styles.sectionTitle, color:'#15803d'}}>KẾT LUẬN CỦA BÁC SĨ</span>
                                        </div>
                                    </div>
                                    <div style={styles.sectionBody}>
                                        <div style={styles.resultRow}>
                                            <span style={styles.label}>Bác sĩ thực hiện:</span>
                                            <span style={{fontWeight:'700', color:'#334155'}}>{data.doctor_name}</span>
                                        </div>
                                        <div style={styles.resultRow}>
                                            <span style={styles.label}>Chẩn đoán xác thực:</span>
                                            <span style={{...styles.resultValue, color: getSeverityColor(data.doctor_diagnosis || ""), fontSize:'15px'}}>
                                                {data.doctor_diagnosis}
                                            </span>
                                        </div>
                                        {data.doctor_notes && (
                                            <div style={{...styles.reportBox, background:'#f0fdf4', borderColor:'#bbf7d0'}}>
                                                <div style={{...styles.reportLabel, color:'#166534'}}><FaNotesMedical style={{marginRight:5}}/> Ghi chú chuyên môn:</div>
                                                <p style={{...styles.reportText, color:'#14532d'}}>"{data.doctor_notes}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={styles.emptyDoctorCard} className="slide-up-card">
                                    <div style={{background:'#f1f5f9', padding:'15px', borderRadius:'50%', marginBottom:'15px'}}>
                                        <FaUserMd size={30} color="#94a3b8"/>
                                    </div>
                                    <p style={{margin:'0 0 5px', fontWeight:'600', color:'#64748b'}}>Chưa có thẩm định</p>
                                    <small style={{color:'#94a3b8'}}>Hồ sơ này đang chờ Bác sĩ chuyên khoa xem xét.</small>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles: {[key:string]: React.CSSProperties} = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#64748b', fontSize:'16px', backgroundColor: '#f4f6f9' },
    container: { minHeight: '100vh', backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', paddingBottom: '40px' },
    
    // Top Bar
    topBar: { 
        background: 'white', padding: '15px 40px', borderBottom: '1px solid #e2e8f0', 
        display: 'flex', alignItems: 'center', justifyContent:'space-between',
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
    },
    backBtn: { 
        display:'flex', alignItems:'center', gap:'8px', background:'white', border:'1px solid #e2e8f0', 
        padding:'8px 16px', borderRadius:'8px', cursor:'pointer', color:'#475569', fontWeight:'600', transition:'0.2s' 
    },
    headerInfo: { display:'flex', flexDirection:'column' },
    title: { margin: 0, fontSize: '18px', color: '#1e293b', fontWeight:'800', letterSpacing:'-0.5px' },
    metaRow: { display:'flex', gap:'15px', alignItems:'center', fontSize:'13px', color:'#64748b' },
    metaItem: { display:'flex', alignItems:'center', gap:'6px', background:'#f8fafc', padding:'4px 10px', borderRadius:'6px', border:'1px solid #f1f5f9' },
    badge: { display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700', border:'1px solid transparent' },
    printBtn: { background:'#fff', border:'1px solid #e2e8f0', color:'#475569', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', fontSize:'14px' },

    // Content Layout
    mainContent: { maxWidth: '1200px', margin: '30px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px' },
    leftCol: { display:'flex', flexDirection:'column' },
    rightCol: { display:'flex', flexDirection:'column', gap:'25px' },

    // Image Card
    imageCard: { background: 'white', borderRadius: '16px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9' },
    imageHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' },
    toggleGroup: { background:'#f1f5f9', padding:'4px', borderRadius:'8px', display:'flex', gap:'2px' },
    toggle: { border:'none', background:'transparent', padding:'6px 12px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#64748b', fontWeight:'600' },
    toggleActive: { border:'none', background:'white', padding:'6px 12px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#0f172a', fontWeight:'700', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' },
    imageWrapper: { width:'100%', aspectRatio:'1/1', background:'#0f172a', borderRadius:'12px', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #334155' },
    mainImage: { maxWidth:'100%', maxHeight:'100%', objectFit:'contain' },
    legend: { marginTop:'15px', display:'flex', justifyContent:'center', gap:'15px', background:'#f8fafc', padding:'10px', borderRadius:'8px' },
    legendItem: { display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#475569', fontWeight:'600' },
    dot: { width:'8px', height:'8px', borderRadius:'50%' },

    // Section Cards
    sectionCard: { background: 'white', borderRadius: '16px', border:'1px solid #f1f5f9', overflow:'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.04)' },
    sectionHeader: { background: '#fff', padding: '20px 25px', borderBottom: '1px solid #f1f5f9', display:'flex', alignItems:'center', gap:'10px' },
    sectionTitle: { fontSize:'14px', fontWeight:'800', color:'#334155', letterSpacing:'0.5px' },
    sectionBody: { padding:'25px' },
    
    resultRow: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px', paddingBottom:'15px', borderBottom:'1px dashed #e2e8f0' },
    label: { color:'#64748b', fontSize:'14px', fontWeight:'500' },
    resultValue: { fontSize:'16px', fontWeight:'700', textTransform:'uppercase' },

    reportBox: { background:'#eff6ff', border:'1px solid #dbeafe', borderRadius:'10px', padding:'15px' },
    reportLabel: { fontSize:'12px', fontWeight:'700', color:'#1e40af', marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' },
    reportText: { fontSize:'13px', color:'#1e3a8a', lineHeight:'1.6', whiteSpace:'pre-line', margin:0, fontFamily:'"Segoe UI", sans-serif' },

    // Empty State
    emptyDoctorCard: { border:'2px dashed #cbd5e1', borderRadius:'16px', padding:'40px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#64748b', textAlign:'center', background:'#f8fafc' },
};

// --- GLOBAL CSS ---
const cssGlobal = `
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.fade-in { animation: fadeIn 0.5s ease-out forwards; }
.slide-up-card { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
.spin { animation: spin 1s linear infinite; display: inline-block; }

.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; }
.btn-secondary-hover:hover { background-color: #f1f5f9 !important; color: #1e293b !important; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default ClinicAnalysisResult;