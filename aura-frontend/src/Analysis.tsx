import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

// ... (Giữ nguyên các interface và logic fetch data cũ) ...
interface MedicalRecord {
    id: number;
    ai_result: string;
    ai_detailed_report: string;
    annotated_image_url: string | null;
    image_url: string;
    upload_date: string;
    doctor_note: string | null;
    ai_analysis_status: string;
}

const AnalysisResult: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [data, setData] = useState<MedicalRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'original' | 'annotated'>('annotated'); 

    // --- (Giữ nguyên logic normalizeData, getSeverityInfo, fetchData) ---
    const normalizeData = (rawData: any): MedicalRecord => {
        if (rawData.image && rawData.analysis) {
            return {
                id: rawData.image.id,
                ai_result: rawData.analysis.risk_level || "Unknown",
                ai_detailed_report: rawData.analysis.ai_detailed_report || rawData.analysis.detailed_risk || "",
                annotated_image_url: rawData.analysis.annotated_image_url || null,
                image_url: rawData.image.image_url || "",
                upload_date: rawData.image.created_at || rawData.image.upload_date || new Date().toISOString(),
                doctor_note: rawData.image.doctor_note || null,
                ai_analysis_status: "COMPLETED"
            };
        }
        const analysisData = rawData.analysis_result || rawData.ai_analysis_result || rawData;
        return {
            id: rawData.id || 0,
            ai_result: analysisData.risk_level || rawData.ai_result || rawData.diagnosis_result || "Unknown",
            ai_detailed_report: analysisData.ai_detailed_report || rawData.ai_detailed_report || rawData.detailed_risk || "",
            annotated_image_url: analysisData.annotated_image_url || rawData.annotated_image_url || null,
            image_url: rawData.image_url || rawData.original_image_url || "",
            upload_date: rawData.upload_date || rawData.created_at || new Date().toISOString(),
            doctor_note: rawData.doctor_diagnosis || rawData.doctor_note || analysisData.doctor_diagnosis || null,
            ai_analysis_status: rawData.ai_analysis_status || "COMPLETED"
        };
    };

    const getSeverityInfo = (diagnosis: string) => {
        if (!diagnosis) return { color: '#6c757d', label: 'Processing...', bg: '#f8f9fa' };
        const d = diagnosis.toLowerCase();
        if (d.includes("severe") || d.includes("pdr")) {
            return { color: '#dc3545', label: 'NGUY HIỂM', bg: '#f8d7da', advice: '⚠️ CẢNH BÁO: Tổn thương nghiêm trọng. Cần can thiệp y tế ngay.' };
        }
        if (d.includes("moderate")) {
            return { color: '#fd7e14', label: 'CẢNH BÁO', bg: '#ffe5d0', advice: '⚠️ Tổn thương trung bình. Cần khám chuyên sâu.' };
        }
        if (d.includes("mild") || d.includes("early")) {
            return { color: '#ffc107', label: 'LƯU Ý', bg: '#fff3cd', advice: 'ℹ️ Dấu hiệu sớm. Cần theo dõi định kỳ.' };
        }
        return { color: '#28a745', label: 'AN TOÀN', bg: '#d4edda', advice: '✅ Võng mạc ổn định.' };
    };

    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (location.state && location.state.result && !data) {
            setData(normalizeData(location.state.result));
            setLoading(false);
            return;
        }
        if (id) {
            try {
                const res = await fetch(`http://localhost:8000/api/v1/medical-records/${id}`, {
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                if (res.ok) {
                    const resultRaw = await res.json();
                    setData(normalizeData(resultRaw));
                }
            } catch (err) { console.error(err); } finally { setLoading(false); }
        }
    }, [id, location.state]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <div style={styles.loadingScreen}>Đang tải...</div>;
    if (!data) return <div style={{padding: 40, textAlign: 'center'}}>Không tìm thấy dữ liệu.</div>;

    const severity = getSeverityInfo(data.ai_result);
    const imageUrl = (viewMode === 'annotated' && data.annotated_image_url) ? data.annotated_image_url : data.image_url;
    const formattedDate = new Date(data.upload_date).toLocaleString('vi-VN');

    return (
        // --- KEY CHANGE: fullScreenOverlay ---
        // Dùng position fixed để đè lên toàn bộ background cũ
        <div style={styles.fullScreenOverlay}>
            
            {/* innerContainer để giới hạn nội dung ở giữa cho đẹp, không bị bè ra quá rộng */}
            <div style={styles.innerContainer}>
                <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>&larr; Quay lại Dashboard</button>
                
                <div style={styles.header}>
                    <div>
                        <h2 style={{margin: 0, color: '#333'}}>Kết quả phân tích AURA</h2>
                        <p style={{margin: '5px 0 0 0', color: '#666'}}>Mã hồ sơ: #{data.id}</p>
                    </div>
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                        <span style={styles.dateBadge}>{formattedDate}</span>
                    </div>
                </div>

                <div style={styles.contentGrid}>
                    {/* CỘT TRÁI: ẢNH */}
                    <div style={styles.leftColumn}>
                        <div style={styles.imageContainer}>
                            <img src={imageUrl} alt="Scan" style={styles.image} onError={(e) => {e.currentTarget.src = 'https://via.placeholder.com/400'}}/>
                            {data.annotated_image_url && (
                                <div style={styles.toggleContainer}>
                                    <button onClick={() => setViewMode('original')} style={viewMode === 'original' ? styles.toggleActive : styles.toggleBtn}>Ảnh gốc</button>
                                    <button onClick={() => setViewMode('annotated')} style={viewMode === 'annotated' ? styles.toggleActive : styles.toggleBtn}>AI Chẩn đoán</button>
                                </div>
                            )}
                        </div>
                        {viewMode === 'annotated' && (
                            <div style={styles.legendBox}>
                                <div style={styles.legendGrid}>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'red'}}></span>Xuất huyết</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'yellow'}}></span>Xuất tiết</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'green'}}></span>Mạch máu</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'blue'}}></span>Đĩa thị</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CỘT PHẢI: KẾT QUẢ */}
                    <div style={styles.rightColumn}>
                        <div style={styles.resultBox}>
                            <label style={styles.label}>Tình trạng võng mạc:</label>
                            <h1 style={{color: severity.color, margin: '5px 0 15px 0', fontSize: '28px'}}>{data.ai_result}</h1>
                            <div style={{backgroundColor: severity.bg, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${severity.color}`}}>
                                <p style={{margin: 0, fontWeight: '500'}}>{severity.advice}</p>
                            </div>
                        </div>

                        {data.doctor_note && (
                            <div style={styles.doctorNoteBox}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
                                    <span style={{fontSize: '20px'}}>👨‍⚕️</span>
                                    <h4 style={{margin: 0, fontSize: '16px', color: '#0d47a1', textTransform: 'uppercase'}}>Lời khuyên của Bác sĩ</h4>
                                </div>
                                <p style={styles.doctorNoteText}>{data.doctor_note}</p>
                            </div>
                        )}

                        <div style={styles.analysisDetails}>
                            <h4 style={{color: '#0056b3', borderBottom: '1px solid #eee', paddingBottom: '8px', marginTop: 0}}>
                                📊 Chi tiết báo cáo y khoa:
                            </h4>
                            <div style={styles.reportContent}>
                                {data.ai_detailed_report}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    // --- KHU VỰC QUAN TRỌNG NHẤT ---
    fullScreenOverlay: {
        position: 'fixed', // Bắt buộc dùng fixed để đè lên parent layout
        top: 0,
        left: 0,
        width: '100vw',  // Chiếm trọn bề ngang màn hình
        height: '100vh', // Chiếm trọn bề dọc màn hình
        backgroundColor: '#ffffff', // Nền trắng tuyệt đối
        zIndex: 9999, // Đảm bảo nổi lên trên cùng (hơn cả sidebar/header cũ nếu có)
        overflowY: 'auto', // Cho phép cuộn nội dung bên trong trang trắng này
        boxSizing: 'border-box',
    },
    innerContainer: {
        maxWidth: '1200px', // Giới hạn chiều rộng nội dung để dễ đọc
        margin: '0 auto',   // Căn giữa nội dung
        padding: '40px 20px', // Khoảng cách với mép màn hình
        minHeight: '100%',
        backgroundColor: '#ffffff',
    },
    // ---------------------------------

    loadingScreen: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666', backgroundColor: '#fff', position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 10000 },
    
    // Style cũ giữ nguyên
    backBtn: { border: 'none', background: 'none', color: '#007bff', cursor: 'pointer', marginBottom: '20px', fontSize: '16px', fontWeight: '600', padding: 0 },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '40px', borderBottom: '2px solid #f5f5f5', paddingBottom: '20px' },
    dateBadge: { background: '#f8f9fa', padding: '6px 14px', borderRadius: '20px', fontSize: '14px', color: '#666', fontWeight: '600', border: '1px solid #eee' },
    
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '50px' }, // Tỉ lệ cột hơi lệch một chút để phần chữ rộng hơn
    
    leftColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
    imageContainer: { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
    image: { width: '100%', height: '100%', objectFit: 'contain' },
    toggleContainer: { position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.95)', borderRadius: '30px', padding: '5px', display: 'flex', gap: '5px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
    toggleBtn: { border: 'none', background: 'transparent', padding: '8px 20px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#555' },
    toggleActive: { border: 'none', background: '#007bff', color: 'white', padding: '8px 20px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,123,255,0.3)' },
    
    legendBox: { backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #e9ecef' },
    legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', fontSize: '14px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '10px', color: '#444', fontWeight: '500' },
    dot: { width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.1)' },
    
    rightColumn: { display: 'flex', flexDirection: 'column', gap: '30px' },
    resultBox: {},
    label: { textTransform: 'uppercase', fontSize: '13px', color: '#999', fontWeight: '700', letterSpacing: '0.8px', marginBottom: '5px', display: 'block' },
    
    doctorNoteBox: { padding: '25px', backgroundColor: '#e3f2fd', borderRadius: '12px', border: '1px solid #90caf9' },
    doctorNoteText: { margin: 0, fontSize: '15px', fontWeight: '500', color: '#1565c0', whiteSpace: 'pre-wrap', lineHeight: '1.6' },
    
    analysisDetails: { backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '25px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' },
    reportContent: { whiteSpace: 'pre-line', lineHeight: '1.7', color: '#333', fontSize: '15px' }
};

export default AnalysisResult;