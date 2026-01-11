import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
// Định nghĩa kiểu dữ liệu chuẩn cho Frontend
interface MedicalRecord {
    id: number;
    ai_result: string;           // Tên bệnh chuẩn hóa
    ai_detailed_report: string;  // Báo cáo chuẩn hóa
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

    // --- HÀM MỚI: CHUẨN HÓA DỮ LIỆU (ĐÃ UPDATE CHO KHỚP BACKEND PYTHON) ---
    const normalizeData = (rawData: any): MedicalRecord => {
        // TRƯỜNG HỢP 1: Dữ liệu trả về từ API Upload (Có dạng nested { image: ..., analysis: ... })
        // Cấu trúc này khớp với return của medical_service.py: return { "image": ..., "analysis": ... }
        if (rawData.image && rawData.analysis) {
            return {
                id: rawData.image.id,
                // Backend lưu kết quả vào trường 'risk_level'
                ai_result: rawData.analysis.risk_level || "Unknown",
                
                // Backend lưu báo cáo vào 'ai_detailed_report'
                ai_detailed_report: rawData.analysis.ai_detailed_report || rawData.analysis.detailed_risk || "",
                
                annotated_image_url: rawData.analysis.annotated_image_url || null,
                image_url: rawData.image.image_url || "",
                
                // Ngày tháng thường nằm trong object image (created_at hoặc upload_date)
                upload_date: rawData.image.created_at || rawData.image.upload_date || new Date().toISOString(),
                
                doctor_note: rawData.image.doctor_note || null,
                ai_analysis_status: "COMPLETED"
            };
        }

        // TRƯỜNG HỢP 2: Dữ liệu trả về từ API GET (Lấy lịch sử)
        // Khi GET /records/{id}, thường backend trả về đối tượng RetinalImage phẳng, 
        // nhưng kết quả AI có thể nằm trong một trường con (ví dụ: analysis_results)
        // Bạn cần kiểm tra xem API GET của bạn trả về cấu trúc nào. 
        // Dưới đây là logic fallback cố gắng bóc tách mọi trường hợp:
        
        const analysisData = rawData.analysis_result || rawData.ai_analysis_result || rawData; // Tìm chỗ chứa kết quả AI

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
        if (d.includes("mild") || d.includes("early")) { // Thêm từ khóa "early"
            return { color: '#ffc107', label: 'LƯU Ý', bg: '#fff3cd', advice: 'ℹ️ Dấu hiệu sớm (Vi phình mạch). Cần theo dõi định kỳ.' };
        }
        return { color: '#28a745', label: 'AN TOÀN', bg: '#d4edda', advice: '✅ Võng mạc ổn định.' };
    };

    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        
        // 1. Dữ liệu từ trang Upload chuyển sang
        if (location.state && location.state.result && !data) {
            const normalized = normalizeData(location.state.result);
            setData(normalized);
            setLoading(false);
            return;
        }

        // 2. Gọi API lấy chi tiết
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
        <div style={styles.container}>
            <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>&larr; Quay lại</button>
            
            <div style={styles.card}>
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
                    {/* CỘT TRÁI: ẢNH (Giữ nguyên) */}
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
                            <h1 style={{color: severity.color, margin: '5px 0 15px 0'}}>{data.ai_result}</h1>
                            <div style={{backgroundColor: severity.bg, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${severity.color}`}}>
                                <p style={{margin: 0, fontWeight: '500'}}>{severity.advice}</p>
                            </div>
                        </div>

                        {/* HIỂN THỊ KẾT LUẬN CỦA BÁC SĨ (READ-ONLY) */}
                        {data.doctor_note ? (
                            <div style={{marginTop: '10px', padding: '15px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #90caf9'}}>
                                <h4 style={{margin: '0 0 8px 0', fontSize: '15px', color: '#0d47a1'}}>👨‍⚕️ Kết luận của Bác sĩ:</h4>
                                <p style={{margin: 0, fontSize: '15px', fontWeight: '500', color: '#1565c0'}}>
                                    {data.doctor_note}
                                </p>
                            </div>
                        ) : (
                            <div style={{marginTop: '10px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', border: '1px dashed #ccc', color: '#777', fontStyle: 'italic'}}>
                                Chưa có đánh giá từ bác sĩ chuyên khoa.
                            </div>
                        )}

                        <div style={styles.analysisDetails}>
                            <h4 style={{color: '#0056b3', borderBottom: '1px solid #eee', paddingBottom: '8px', marginTop: 0}}>
                                📊 Chi tiết phân tích AI:
                            </h4>
                            <div style={{whiteSpace: 'pre-line', lineHeight: '1.6', color: '#444', fontSize: '14px', maxHeight: '300px', overflowY: 'auto'}}>
                                {data.ai_detailed_report}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Giữ nguyên phần STYLES cũ của bạn ở dưới...
const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '30px', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'Segoe UI, sans-serif' },
    loadingScreen: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' },
    backBtn: { border: 'none', background: 'none', color: '#007bff', cursor: 'pointer', marginBottom: '15px', fontSize: '16px', fontWeight: '600' },
    card: { backgroundColor: 'white', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxWidth: '1100px', margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '20px' },
    dateBadge: { background: '#f8f9fa', padding: '5px 12px', borderRadius: '15px', fontSize: '13px', color: '#666', fontWeight: '600' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' },
    leftColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
    imageContainer: { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    image: { width: '100%', height: '100%', objectFit: 'contain' },
    toggleContainer: { position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.9)', borderRadius: '30px', padding: '4px', display: 'flex', gap: '5px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' },
    toggleBtn: { border: 'none', background: 'transparent', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: '#555' },
    toggleActive: { border: 'none', background: '#007bff', color: 'white', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,123,255,0.3)' },
    legendBox: { backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #e9ecef' },
    legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '8px', color: '#333' },
    dot: { width: '12px', height: '12px', borderRadius: '50%', border: '1px solid rgba(0,0,0,0.1)' },
    rightColumn: { display: 'flex', flexDirection: 'column', gap: '25px' },
    resultBox: {},
    label: { textTransform: 'uppercase', fontSize: '12px', color: '#888', fontWeight: 'bold', letterSpacing: '0.5px' },
    analysisDetails: { backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '20px' },
    doctorArea: { marginTop: 'auto', borderTop: '2px dashed #eee', paddingTop: '20px' },
    textArea: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', marginBottom: '10px', fontFamily: 'inherit' },
    saveBtn: { background: '#28a745', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    spinner: { width: '40px', height: '40px', border: '3px solid #eee', borderTop: '3px solid #007bff', borderRadius: '50%', animation: 'spin 1s linear infinite' },
};

const styleSheet = document.createElement("style");
styleSheet.innerText = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(styleSheet);

export default AnalysisResult;