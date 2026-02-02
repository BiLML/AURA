import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft, FaFilePdf, FaFileCsv } from 'react-icons/fa';
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
    const [annotatedImageError, setAnnotatedImageError] = useState(false); 

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
                const res = await fetch(`https://aurahealth.name.vn/api/v1/medical-records/${id}`, {
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
    useEffect(() => { setAnnotatedImageError(false); }, [viewMode, data?.id]);

    if (loading) return <div style={styles.loadingScreen}>Đang tải...</div>;
    if (!data) return <div style={{padding: 40, textAlign: 'center'}}>Không tìm thấy dữ liệu.</div>;

    const severity = getSeverityInfo(data.ai_result);
    const formattedDate = new Date(data.upload_date).toLocaleString('vi-VN');

    // --- 1. XUẤT CSV (Excel) ---
    const handleExportCSV = () => {
        if (!data) return;
        
        // Định nghĩa Header
        const headers = ["Mã Hồ Sơ", "Ngày Khám", "Bệnh Nhân", "Kết Quả AI", "Bác Sĩ Chẩn Đoán", "Ghi Chú", "Link Ảnh"];
        
        // Định nghĩa Dòng dữ liệu (Xử lý các ký tự đặc biệt)
        const row = [
            data.id,
            new Date(data.upload_date).toLocaleDateString('vi-VN'),
            "Bệnh nhân AURA", // Hoặc lấy tên thật nếu có trong data
            data.ai_result,
            data.doctor_note ? "Đã xác thực" : "Chưa xác thực",
            `"${(data.doctor_note || '').replace(/"/g, '""')}"`, // Escape dấu ngoặc kép
            data.annotated_image_url || data.image_url
        ];

        // Tạo nội dung file (Thêm \uFEFF để Excel nhận diện tiếng Việt UTF-8)
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), row.join(",")].join("\n");
        
        // Tải xuống
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = `AURA_Report_${data.id}.csv`;
        link.click();
    };

    // --- 2. XUẤT PDF (In ấn) ---
    const handlePrintPDF = () => {
        window.print();
    };
    return (
        // --- KEY CHANGE: fullScreenOverlay ---
        // Dùng position fixed để đè lên toàn bộ background cũ
        <div style={styles.fullScreenOverlay}>
            <style>{`
                @media print {
                    /* Ẩn các nút bấm, thanh điều hướng khi in */
                    .no-print { display: none !important; }
                    
                    /* Căn chỉnh trang giấy A4 */
                    @page { margin: 2cm; size: A4; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                    
                    /* Bung rộng nội dung */
                    div[style*="innerContainer"] { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
                    div[style*="fullScreenOverlay"] { position: static; height: auto; overflow: visible; }
                    
                    /* Tùy chỉnh layout khi in (để ảnh và chữ nằm dọc cho dễ đọc nếu cần) */
                    div[style*="contentGrid"] { display: block !important; }
                    div[style*="leftColumn"] { margin-bottom: 20px; page-break-inside: avoid; }
                    div[style*="rightColumn"] { page-break-inside: avoid; }
                }
            `}</style>            
            {/* innerContainer để giới hạn nội dung ở giữa cho đẹp, không bị bè ra quá rộng */}
            <div style={styles.innerContainer}>
                <button onClick={() => navigate('/dashboard')} style={styles.modernBackBtn} onMouseOver={(e) => e.currentTarget.style.borderColor = '#94a3b8'} onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}><div style={styles.iconCircle}><FaArrowLeft size={14} /></div><span>Quay lại</span></button>
                
                <div style={styles.header}>
                    <div>
                        <h2 style={{margin: 0, color: '#333'}}>Kết quả phân tích AURA</h2>
                        <p style={{margin: '5px 0 0 0', color: '#666'}}>Mã hồ sơ: #{data.id}</p>
                    </div>

                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                        
                        {/* Nút CSV */}
                        <button onClick={handleExportCSV} className="no-print" style={{...styles.exportBtn, backgroundColor: '#107c41'}}>
                            <FaFileCsv style={{marginRight: 6}}/> Xuất CSV
                        </button>

                        {/* Nút PDF */}
                        <button onClick={handlePrintPDF} className="no-print" style={{...styles.exportBtn, backgroundColor: '#dc3545'}}>
                            <FaFilePdf style={{marginRight: 6}}/> Lưu PDF
                        </button>

                        <span style={styles.dateBadge}>{formattedDate}</span>
                    </div>
                </div>

                <div style={styles.contentGrid}>
                    {/* CỘT TRÁI: ẢNH */}
                    <div style={styles.leftColumn}>
                        <div style={styles.imageContainer}>
                            {/* LỚP 1: ẢNH GỐC (Luôn nằm dưới đáy) */}
                            <img
                                src={data.image_url}
                                alt="Original Scan"
                                style={{
                                    display: 'block',
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'contain'
                                }}
                            />

                            {/* LỚP 2: ẢNH AI (Nằm đè lên trên, chỉ thay đổi Opacity) */}
                            {data.annotated_image_url && (
                                <img
                                    src={data.annotated_image_url}
                                    alt="AI Analysis"
                                    onLoad={() => setAnnotatedImageError(false)}
                                    onError={() => setAnnotatedImageError(true)}
                                    style={{
                                        position: 'absolute', 
                                        top: 0, 
                                        left: 0, 
                                        width: '100%', 
                                        height: '100%', 
                                        objectFit: 'contain',
                                        
                                        // ✨ MAGIC HAPPENS HERE ✨
                                        // Nếu mode là annotated VÀ ảnh không lỗi -> Hiện (Opacity 1)
                                        // Ngược lại -> Ẩn (Opacity 0) để lộ ảnh gốc bên dưới
                                        opacity: (viewMode === 'annotated' && !annotatedImageError) ? 1 : 0,
                                        
                                        // Hiệu ứng chuyển đổi mượt mà
                                        transition: 'opacity 0.4s ease-in-out',
                                        
                                        // Để chuột xuyên qua bấm được ảnh dưới (nếu cần)
                                        pointerEvents: 'none' 
                                    }}
                                />
                            )}

                            {/* Nút Toggle chuyển đổi */}
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
                        
                        {/* Thông báo lỗi nếu ảnh AI hỏng */}
                        {viewMode === 'annotated' && annotatedImageError && (
                            <div style={{
                                marginTop: 8, padding: '10px', background: '#fff3cd', 
                                borderRadius: 8, fontSize: 13, color: '#856404', border:'1px solid #ffeeba'
                            }}>
                                ⚠️ Ảnh phân tích chưa sẵn sàng. Đang hiển thị ảnh gốc.
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
    modernBackBtn: { display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '6px 16px 6px 6px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '30px', color: '#475569', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '25px', transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
    iconCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155' },
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
    reportContent: { whiteSpace: 'pre-line', lineHeight: '1.7', color: '#333', fontSize: '15px' },

    exportBtn: {display: 'inline-flex',alignItems: 'center',padding: '8px 14px',color: 'white',border: 'none',borderRadius: '6px',fontSize: '13px',fontWeight: '600',cursor: 'pointer',boxShadow: '0 2px 4px rgba(0,0,0,0.1)',transition: 'opacity 0.2s'}
};

export default AnalysisResult;