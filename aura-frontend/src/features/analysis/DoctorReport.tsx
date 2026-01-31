import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaArrowLeft, FaExclamationTriangle, FaUserInjured, FaUserMd, 
    FaFileMedical, FaPaperPlane, FaSpinner, FaRobot, FaStethoscope 
} from 'react-icons/fa';

interface ReportInfo {
    record_id: string;
    // Thông tin bệnh nhân
    patient_id: string;
    patient_name: string;
    // Thông tin bác sĩ (người đang report)
    doctor_id: string;
    doctor_name: string;
    // Thông tin chuyên môn
    ai_diagnosis: string;
    current_doctor_diagnosis: string | null;
    image_url: string;
}

const DoctorReport: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    // State cho dữ liệu hiển thị
    const [info, setInfo] = useState<ReportInfo | null>(null);
    const [loading, setLoading] = useState(true);

    // State cho form phản hồi
    const [feedbackContent, setFeedbackContent] = useState('');    
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchReportDetails = async () => {
            const token = localStorage.getItem('token');
            if (!id || !token) return;

            try {
                const res = await fetch(`https://aurahealth.name.vn/api/v1/doctor/records/${id}/report-detail`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    setInfo({
                        record_id: data.record_id,
                        patient_id: data.patient_id,
                        patient_name: data.patient_name,
                        doctor_id: data.doctor_id,
                        doctor_name: data.doctor_name,
                        ai_diagnosis: data.ai_result,
                        current_doctor_diagnosis: data.doctor_diagnosis || "Chưa thẩm định",
                        image_url: data.image_url
                    });
                } else {
                    console.error("Lỗi khi tải dữ liệu báo cáo");
                }
            } catch (error) {
                console.error("Lỗi kết nối:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReportDetails();
    }, [id]);

    const handleSubmitReport = async () => {
        if (!feedbackContent.trim()) {
            alert("Vui lòng nhập nội dung phản hồi chi tiết cho Admin.");
            return;
        }

        setIsSubmitting(true);
        const token = localStorage.getItem('token');

        try {
            const payload = {
                doctor_diagnosis: info?.current_doctor_diagnosis || info?.ai_diagnosis, 
                feedback_for_ai: feedbackContent 
            };

            const res = await fetch(`https://aurahealth.name.vn/api/v1/doctor/records/${id}/diagnosis`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("✅ Đã gửi báo cáo thành công! Cảm ơn đóng góp của bạn.");
                navigate(-1); 
            } else {
                alert("Gửi thất bại. Vui lòng thử lại.");
            }
        } catch (error) {
            alert("Lỗi kết nối Server");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div style={styles.loading}><FaSpinner className="spin" size={40} color="#007bff"/></div>;
    if (!info) return <div style={styles.loading}>Không tìm thấy hồ sơ báo cáo.</div>;

    return (
        <div style={styles.container} className="fade-in">
            {/* Header */}
            <header style={styles.header}>
                <div style={styles.headerContent}>
                    <button onClick={() => navigate(-1)} style={styles.backBtn} className="btn-secondary-hover">
                        <FaArrowLeft style={{marginRight: '8px'}}/> Quay lại
                    </button>
                    <div style={{display:'flex', flexDirection:'column'}}>
                        <h2 style={styles.pageTitle}>BÁO CÁO SAI SÓT MODEL AI</h2>
                        <span style={styles.subTitle}>Gửi phản hồi kỹ thuật cho Hồ sơ #{info.record_id}</span>
                    </div>
                </div>
            </header>

            <div style={styles.contentBody}>
                <div style={styles.contentWrapper}>
                    
                    {/* Phần 1: Thông tin định danh */}
                    <div style={styles.card} className="slide-up-card">
                        <div style={styles.cardHeader}>
                            <h3 style={styles.cardTitle}><FaFileMedical style={{marginRight:10, color:'#007bff'}}/> Thông tin Hồ sơ</h3>
                        </div>
                        <div style={styles.infoGrid}>
                            <div style={styles.infoItem}>
                                <div style={styles.iconBox}><FaUserInjured color="#3b82f6"/></div>
                                <div>
                                    <div style={styles.label}>Bệnh nhân</div>
                                    <div style={styles.value}>{info.patient_name}</div>
                                    <div style={styles.subValue}>ID: {info.patient_id}</div>
                                </div>
                            </div>
                            
                            <div style={styles.infoItem}>
                                <div style={styles.iconBox}><FaUserMd color="#10b981"/></div>
                                <div>
                                    <div style={styles.label}>Bác sĩ báo cáo</div>
                                    <div style={styles.value}>{info.doctor_name}</div>
                                    <div style={styles.subValue}>ID: {info.doctor_id}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Phần 2: So sánh Chẩn đoán */}
                    <div style={{...styles.card, animationDelay: '0.1s'}} className="slide-up-card">
                        <div style={styles.cardHeader}>
                            <h3 style={styles.cardTitle}><FaExclamationTriangle style={{marginRight:10, color:'#f59e0b'}}/> Dữ liệu Chẩn đoán</h3>
                        </div>
                        <div style={styles.comparisonBody}>
                            <div style={styles.imageContainer}>
                                <img src={info.image_url} alt="Scan" style={styles.thumbnail} />
                                <div style={styles.imageOverlay}>Ảnh gốc</div>
                            </div>
                            
                            <div style={styles.diagnosisContainer}>
                                <div style={styles.diagnosisBox}>
                                    <div style={styles.diagnosisLabel}><FaRobot style={{marginRight:6}}/> AI Chẩn đoán</div>
                                    <div style={{...styles.badge, backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #ffedd5'}}>
                                        {info.ai_diagnosis}
                                    </div>
                                </div>

                                <div style={styles.arrowDivider}>➔</div>

                                <div style={styles.diagnosisBox}>
                                    <div style={styles.diagnosisLabel}><FaStethoscope style={{marginRight:6}}/> Thực tế (Ground Truth)</div>
                                    <div style={{...styles.badge, backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #dcfce7'}}>
                                        {info.current_doctor_diagnosis || "Chưa xác định"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Phần 3: Form Phản hồi */}
                    <div style={{...styles.card, borderTop: '4px solid #ef4444', animationDelay: '0.2s'}} className="slide-up-card">
                        <div style={styles.cardHeader}>
                            <h3 style={{...styles.cardTitle, color: '#ef4444'}}>Nội dung Phản hồi Kỹ thuật</h3>
                        </div>
                        
                        <div style={{padding:'25px'}}>
                            <div style={styles.formGroup}>
                                <label style={styles.formLabel}>
                                    Mô tả chi tiết lỗi sai hoặc đề xuất cải thiện:
                                    <span style={{color: '#ef4444', marginLeft:'4px'}}>*</span>
                                </label>
                                <textarea 
                                    className="input-focus"
                                    rows={8}
                                    style={styles.textarea}
                                    placeholder="Ví dụ: AI nhận diện nhầm đốm xuất huyết là vi phình mạch, hoặc bỏ sót vùng tổn thương ở góc 3 giờ..."
                                    value={feedbackContent}
                                    onChange={(e) => setFeedbackContent(e.target.value)}
                                />
                                <p style={{fontSize:'12px', color:'#64748b', marginTop:'8px'}}>
                                    * Phản hồi của bạn sẽ được gửi trực tiếp đến đội ngũ kỹ thuật để tinh chỉnh mô hình AI trong phiên bản tới.
                                </p>
                            </div>

                            <div style={styles.footer}>
                                <button 
                                    className="btn-primary-hover pulse-on-active"
                                    onClick={handleSubmitReport} 
                                    disabled={isSubmitting}
                                    style={styles.submitBtn}
                                >
                                    {isSubmitting ? <><FaSpinner className="spin"/> Đang gửi...</> : <><FaPaperPlane/> Gửi Báo Cáo</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    loading: { display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', backgroundColor: '#f4f6f9', color: '#64748b' },
    
    container: { 
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
        backgroundColor: '#f4f6f9', fontFamily: '"Segoe UI", sans-serif', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden' 
    },

    // Header
    header: { backgroundColor: 'white', borderBottom: '1px solid #e1e4e8', height: '70px', display: 'flex', alignItems: 'center', flexShrink: 0 },
    headerContent: { width: '100%', maxWidth: '900px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '20px' },
    backBtn: { background: 'white', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', color: '#64748b', cursor: 'pointer', fontWeight: '600', fontSize:'13px', display:'flex', alignItems:'center', transition: 'all 0.2s' },
    pageTitle: { margin: 0, fontSize: '18px', color: '#1e293b', fontWeight: '700', letterSpacing: '-0.5px' },
    subTitle: { fontSize: '12px', color: '#64748b' },

    // Body
    contentBody: { flex: 1, overflowY: 'auto', padding: '30px 20px' },
    contentWrapper: { width: '100%', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '25px' },

    // Card Styles
    card: { backgroundColor: 'white', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', overflow: 'hidden' },
    cardHeader: { padding: '20px 25px', borderBottom: '1px solid #f1f5f9', background: '#fff' },
    cardTitle: { margin: 0, fontSize: '16px', fontWeight: '700', color: '#334155', display: 'flex', alignItems: 'center' },

    // Info Grid
    infoGrid: { padding: '25px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    infoItem: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9' },
    iconBox: { width: '40px', height: '40px', borderRadius: '10px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 2px 5px rgba(0,0,0,0.03)', border: '1px solid #e2e8f0' },
    label: { fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '2px' },
    value: { fontSize: '15px', color: '#1e293b', fontWeight: '700' },
    subValue: { fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' },

    // Comparison Section
    comparisonBody: { padding: '25px', display: 'flex', gap: '30px', alignItems: 'center' },
    imageContainer: { position: 'relative', width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' },
    thumbnail: { width: '100%', height: '100%', objectFit: 'cover' },
    imageOverlay: { position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '10px', textAlign: 'center', padding: '4px 0' },
    
    diagnosisContainer: { flex: 1, display: 'flex', alignItems: 'center', gap: '15px' },
    diagnosisBox: { flex: 1, padding: '15px', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0' },
    diagnosisLabel: { fontSize: '13px', color: '#64748b', marginBottom: '8px', display:'flex', alignItems:'center', fontWeight:'600' },
    badge: { padding: '8px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', display: 'inline-block' },
    arrowDivider: { color: '#cbd5e1', fontSize: '20px' },

    // Form
    formGroup: { marginBottom: '20px' },
    formLabel: { fontSize: '14px', color: '#334155', fontWeight: '600', marginBottom: '8px', display: 'block' },
    textarea: { width: '100%', padding: '15px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: '#f8fafc', outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
    
    footer: { display: 'flex', justifyContent: 'flex-end', paddingTop: '10px' },
    submitBtn: { padding: '12px 30px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.25)', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s' }
};

// --- CSS GLOBAL ---
const cssGlobal = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }

.spin { animation: spin 1s linear infinite; }
.fade-in { animation: fadeIn 0.4s ease-out forwards; }
.slide-up-card { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1) !important; background-color: #fff !important; }
.btn-secondary-hover:hover { background-color: #f1f5f9 !important; color: #1e293b !important; }
.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(239, 68, 68, 0.3) !important; filter: brightness(1.1); }
.btn-primary-hover:active { transform: translateY(0); }
.pulse-on-active:active { animation: pulse 0.3s; }

::-webkit-scrollbar { width: 6px; } 
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default DoctorReport;