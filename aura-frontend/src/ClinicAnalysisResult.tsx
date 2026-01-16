import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaArrowLeft, FaRobot, FaUserMd, FaCalendarAlt, FaFileMedicalAlt, 
    FaExclamationTriangle, FaCheckCircle, FaNotesMedical, FaBrain 
} from 'react-icons/fa';

// --- INTERFACES ---
interface AnalysisData {
    id: string;
    patient_name: string;
    upload_date: string;
    image_url: string;
    annotated_image_url: string | null;

    
    // Phần AI
    ai_risk_level: string;         // Kết quả gốc của AI (nếu có thể tách) hoặc kết quả hiện tại
    ai_detailed_report: string;    // Báo cáo chi tiết từ AI
    
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
            // Gọi API lấy chi tiết hồ sơ
            const res = await fetch(`http://localhost:8000/api/v1/clinics/medical-records/${id}/detail`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const raw = await res.json();
                console.log("Dữ liệu chi tiết:", raw);

                // Map dữ liệu (Vì API trả về phẳng nên map rất dễ)
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
            } else {
                console.error("Lỗi API:", res.status);
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
        if (!text) return '#6c757d';
        const t = text.toLowerCase();
        if (t.includes('nặng') || t.includes('severe') || t.includes('pdr')) return '#dc3545';
        if (t.includes('trung bình') || t.includes('moderate')) return '#fd7e14';
        if (t.includes('nhẹ') || t.includes('mild')) return '#ffc107';
        if (t.includes('bình thường') || t.includes('normal')) return '#28a745';
        return '#007bff';
    };

    if (loading) return <div style={styles.loading}>Đang tải hồ sơ...</div>;
    if (!data) return <div style={styles.loading}>Không tìm thấy dữ liệu.</div>;

    return (
        <div style={styles.container}>
            {/* --- HEADER --- */}
            <div style={styles.topBar}>
                <button onClick={() => navigate('/clinic-dashboard')} style={styles.backBtn}>
                    <FaArrowLeft /> Quay lại
                </button>
                <div style={styles.headerInfo}>
                    <h1 style={styles.title}>HỒ SƠ PHÂN TÍCH #{data.id.slice(0, 8)}</h1>
                    {!data.is_internal ? (
                        <div style={styles.metaRow}>
                            <span style={styles.metaItem}><FaUserMd /> BN: {data.patient_name}</span>
                            <span style={styles.metaItem}><FaCalendarAlt /> {new Date(data.upload_date).toLocaleString('vi-VN')}</span>
                        </div>
                    ) : (
                        <div style={styles.metaRow}>
                            <span style={{...styles.metaItem, color:'#007bff', fontWeight:'bold'}}>
                                <FaCheckCircle/> Phân tích mẫu (Nội bộ)
                            </span>
                            <span style={styles.metaItem}><FaCalendarAlt /> {new Date(data.upload_date).toLocaleString('vi-VN')}</span>
                        </div>
                    )}
                </div>
                <div style={styles.statusBadge}>
                    {data.is_validated ? 
                        <span style={{...styles.badge, background:'#d1fae5', color:'#065f46'}}><FaCheckCircle/> Đã thẩm định</span> : 
                        <span style={{...styles.badge, background:'#fee2e2', color:'#991b1b'}}><FaExclamationTriangle/> AI Tự động</span>
                    }
                </div>
            </div>

            <div style={styles.mainContent}>
                
                {/* --- CỘT TRÁI: HÌNH ẢNH (VISUAL) --- */}
                <div style={styles.leftCol}>
                    <div style={styles.imageCard}>
                        <div style={styles.imageHeader}>
                            <h3>Hình ảnh Võng mạc</h3>
                            {data.annotated_image_url && (
                                <div style={styles.toggleGroup}>
                                    <button 
                                        style={viewMode === 'original' ? styles.toggleActive : styles.toggle}
                                        onClick={() => setViewMode('original')}
                                    >Gốc</button>
                                    <button 
                                        style={viewMode === 'annotated' ? styles.toggleActive : styles.toggle}
                                        onClick={() => setViewMode('annotated')}
                                    >AI Vẽ vùng bệnh</button>
                                </div>
                            )}
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
                                <small>🔴 Xuất huyết &nbsp; 🟡 Xuất tiết &nbsp; 🔵 Đĩa thị &nbsp; 🟠 Mạch máu </small>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- CỘT PHẢI: SO SÁNH KẾT QUẢ (DATA) --- */}
                <div style={styles.rightCol}>
                    
                    {/* 1. KẾT QUẢ AI */}
                    <div style={styles.sectionCard}>
                        <div style={styles.sectionHeader}>
                            <FaRobot size={20} color="#007bff"/> 
                            <span style={styles.sectionTitle}>PHÂN TÍCH TỰ ĐỘNG (AI)</span>
                        </div>
                        <div style={styles.sectionBody}>
                            <div style={styles.resultRow}>
                                <span style={styles.label}>Đánh giá rủi ro:</span>
                                <span style={{...styles.resultValue, color: getSeverityColor(data.ai_risk_level)}}>
                                    {data.ai_risk_level}
                                </span>
                            </div>
                            <div style={styles.reportBox}>
                                <div style={styles.reportLabel}><FaBrain/> Tham số:</div>
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
                                <div style={{...styles.sectionCard, borderTop: '4px solid #28a745'}}>
                                    {/* ... Code hiển thị kết quả bác sĩ cũ ... */}
                                    <div style={styles.sectionHeader}>
                                        <FaUserMd size={20} color="#28a745"/> 
                                        <span style={{...styles.sectionTitle, color:'#28a745'}}>KẾT LUẬN CỦA BÁC SĨ</span>
                                    </div>
                                    <div style={styles.sectionBody}>
                                        <div style={styles.resultRow}>
                                            <span style={styles.label}>Bác sĩ thực hiện:</span>
                                            <span style={{fontWeight:'bold'}}>{data.doctor_name}</span>
                                        </div>
                                        <div style={styles.resultRow}>
                                            <span style={styles.label}>Chẩn đoán xác thực:</span>
                                            <span style={{...styles.resultValue, color: getSeverityColor(data.doctor_diagnosis || "")}}>
                                                {data.doctor_diagnosis}
                                            </span>
                                        </div>
                                        {data.doctor_notes && (
                                            <div style={{...styles.reportBox, background:'#f0fdf4', borderColor:'#bbf7d0'}}>
                                                <div style={{...styles.reportLabel, color:'#166534'}}><FaNotesMedical/> Ghi chú chuyên môn:</div>
                                                <p style={{...styles.reportText, color:'#14532d'}}>"{data.doctor_notes}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div style={styles.emptyDoctorCard}>
                                    <FaUserMd size={40} color="#cbd5e1"/>
                                    <p>Hồ sơ này chưa được Bác sĩ thẩm định.</p>
                                    <small>Kết quả hiện tại hoàn toàn dựa trên AI.</small>
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
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#555', background:'#f8f9fa' },
    container: { minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: '"Segoe UI", sans-serif' },
    
    // Top Bar
    topBar: { 
        background: 'white', padding: '15px 30px', borderBottom: '1px solid #e2e8f0', 
        display: 'flex', alignItems: 'center', justifyContent:'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    },
    backBtn: { 
        display:'flex', alignItems:'center', gap:'8px', background:'transparent', border:'1px solid #cbd5e1', 
        padding:'8px 16px', borderRadius:'6px', cursor:'pointer', color:'#475569', fontWeight:'600', transition:'0.2s' 
    },
    headerInfo: { textAlign:'center' },
    title: { margin: 0, fontSize: '18px', color: '#1e293b', fontWeight:'700', letterSpacing:'0.5px' },
    metaRow: { display:'flex', gap:'15px', justifyContent:'center', marginTop:'5px', fontSize:'13px', color:'#64748b' },
    metaItem: { display:'flex', alignItems:'center', gap:'5px' },
    statusBadge: {},
    badge: { display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'20px', fontSize:'12px', fontWeight:'700' },

    // Content Layout
    mainContent: { maxWidth: '1200px', margin: '30px auto', padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' },
    leftCol: { display:'flex', flexDirection:'column' },
    rightCol: { display:'flex', flexDirection:'column', gap:'20px' },

    // Image Card
    imageCard: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border:'1px solid #e2e8f0' },
    imageHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px' },
    toggleGroup: { background:'#f1f5f9', padding:'3px', borderRadius:'8px', display:'flex' },
    toggle: { border:'none', background:'transparent', padding:'6px 12px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#64748b', fontWeight:'500' },
    toggleActive: { border:'none', background:'white', padding:'6px 12px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', color:'#0f172a', fontWeight:'700', boxShadow:'0 1px 2px rgba(0,0,0,0.1)' },
    imageWrapper: { width:'100%', aspectRatio:'1/1', background:'#000', borderRadius:'8px', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' },
    mainImage: { maxWidth:'100%', maxHeight:'100%', objectFit:'contain' },
    legend: { marginTop:'10px', textAlign:'center', fontSize:'12px', color:'#64748b', background:'#f8fafc', padding:'8px', borderRadius:'6px' },

    // Section Cards
    sectionCard: { background: 'white', borderRadius: '12px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' },
    sectionHeader: { background: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display:'flex', alignItems:'center', gap:'10px' },
    sectionTitle: { fontSize:'14px', fontWeight:'700', color:'#334155' },
    sectionBody: { padding:'20px' },
    
    resultRow: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px', paddingBottom:'10px', borderBottom:'1px dashed #e2e8f0' },
    label: { color:'#64748b', fontSize:'14px' },
    resultValue: { fontSize:'16px', fontWeight:'700', textTransform:'uppercase' },

    reportBox: { background:'#eff6ff', border:'1px solid #dbeafe', borderRadius:'8px', padding:'15px' },
    reportLabel: { fontSize:'12px', fontWeight:'700', color:'#1e40af', marginBottom:'8px', display:'flex', alignItems:'center', gap:'5px' },
    reportText: { fontSize:'13px', color:'#1e3a8a', lineHeight:'1.6', whiteSpace:'pre-line', margin:0 },

    // Empty State
    emptyDoctorCard: { border:'2px dashed #cbd5e1', borderRadius:'12px', padding:'40px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#64748b', textAlign:'center' },
};

export default ClinicAnalysisResult;