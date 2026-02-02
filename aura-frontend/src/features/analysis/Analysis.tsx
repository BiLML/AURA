import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft, FaFilePdf, FaFileCsv } from 'react-icons/fa';
// @ts-ignore (Bỏ qua lỗi type nếu chưa cài @types/html2pdf.js)
import html2pdf from 'html2pdf.js';

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
    
    // REF CHO TEMPLATE IN PDF
    const reportTemplateRef = useRef<HTMLDivElement>(null);

    const [data, setData] = useState<MedicalRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'original' | 'annotated'>('annotated');
    const [annotatedImageError, setAnnotatedImageError] = useState(false); 

    // --- Logic Data Normalization (Giữ nguyên) ---
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

    // --- XỬ LÝ XUẤT CSV ---
    const handleExportCSV = () => {
        const headers = ["Mã Hồ Sơ", "Ngày Khám", "Kết Quả AI", "Ghi Chú BS"];
        const row = [data.id, formattedDate, data.ai_result, `"${(data.doctor_note || '').replace(/"/g, '""')}"`];
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), row.join(",")].join("\n");
        const link = document.createElement("a");
        link.href = encodeURI(csvContent);
        link.download = `Report_${data.id}.csv`;
        link.click();
    };

    // --- XỬ LÝ TẠO PDF CHUẨN (Mới) ---
    const handleDownloadPDF = () => {
        const element = reportTemplateRef.current;
        if (!element) return;

        const opt = {
            margin:       10, // lề 10mm
            filename:     `AURA_Medical_Report_${data.id}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: true }, // scale 2 để nét, useCORS để tải ảnh từ server khác
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Hiệu ứng loading nút bấm (optional)
        const btn = document.getElementById('btn-download-pdf');
        if(btn) btn.innerText = 'Đang tạo PDF...';

        html2pdf().set(opt).from(element).save().then(() => {
            if(btn) btn.innerText = 'Tải Báo Cáo PDF';
        });
    };

    return (
        <div style={styles.fullScreenOverlay}>
            <div style={styles.innerContainer}>
                {/* --- HEADER UI --- */}
                <button onClick={() => navigate('/dashboard')} style={styles.modernBackBtn}><div style={styles.iconCircle}><FaArrowLeft size={14} /></div><span>Quay lại</span></button>
                
                <div style={styles.header}>
                    <div>
                        <h2 style={{margin: 0, color: '#333'}}>Kết quả phân tích AURA</h2>
                        <p style={{margin: '5px 0 0 0', color: '#666'}}>Mã hồ sơ: #{data.id}</p>
                    </div>
                    <div style={{display: 'flex', gap: '10px', alignItems: 'center'}}>
                        <button onClick={handleExportCSV} style={{...styles.exportBtn, backgroundColor: '#107c41'}}>
                            <FaFileCsv style={{marginRight: 6}}/> Xuất CSV
                        </button>
                        <button id="btn-download-pdf" onClick={handleDownloadPDF} style={{...styles.exportBtn, backgroundColor: '#dc3545'}}>
                            <FaFilePdf style={{marginRight: 6}}/> Tải Báo Cáo PDF
                        </button>
                    </div>
                </div>

                {/* --- MÀN HÌNH UI (Interactive) --- */}
                <div style={styles.contentGrid}>
                    <div style={styles.leftColumn}>
                        <div style={styles.imageContainer}>
                            <img src={data.image_url} alt="Original" style={{display: 'block', width: '100%', height: '100%', objectFit: 'contain'}} />
                            {data.annotated_image_url && (
                                <img
                                    src={data.annotated_image_url} alt="AI Analysis"
                                    onLoad={() => setAnnotatedImageError(false)} onError={() => setAnnotatedImageError(true)}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain',
                                        opacity: (viewMode === 'annotated' && !annotatedImageError) ? 1 : 0,
                                        transition: 'opacity 0.4s ease-in-out', pointerEvents: 'none' 
                                    }}
                                />
                            )}
                            {data.annotated_image_url && (
                                <div style={styles.toggleContainer}>
                                    <button onClick={() => setViewMode('original')} style={viewMode === 'original' ? styles.toggleActive : styles.toggleBtn}>Ảnh gốc</button>
                                    <button onClick={() => setViewMode('annotated')} style={viewMode === 'annotated' ? styles.toggleActive : styles.toggleBtn}>AI Chẩn đoán</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={styles.rightColumn}>
                        <div style={styles.resultBox}>
                            <label style={styles.label}>Tình trạng:</label>
                            <h1 style={{color: severity.color, margin: '5px 0 15px 0', fontSize: '28px'}}>{data.ai_result}</h1>
                            <div style={{backgroundColor: severity.bg, padding: '15px', borderRadius: '8px', borderLeft: `4px solid ${severity.color}`}}>{severity.advice}</div>
                        </div>
                        {data.doctor_note && (
                            <div style={styles.doctorNoteBox}>
                                <h4>👨‍⚕️ Lời khuyên Bác sĩ</h4>
                                <p style={styles.doctorNoteText}>{data.doctor_note}</p>
                            </div>
                        )}
                         <div style={styles.analysisDetails}>
                            <h4>📊 Chi tiết:</h4>
                            <div style={styles.reportContent}>{data.ai_detailed_report}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* === HIDDEN REPORT TEMPLATE (Chỉ dùng để xuất PDF) === */}
            {/* ========================================================= */}
            <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }}>
                <div ref={reportTemplateRef} style={pdfStyles.container}>
                    {/* Header Report */}
                    <div style={pdfStyles.header}>
                        <div style={{flex: 1}}>
                            <h1 style={pdfStyles.brandTitle}>AURA HEALTH</h1>
                            <p style={pdfStyles.brandSubtitle}>HỆ THỐNG CHẨN ĐOÁN VÕNG MẠC TỰ ĐỘNG</p>
                            <p style={pdfStyles.metaInfo}>Website: aurahealth.name.vn | Hotline: 1900-xxxx</p>
                        </div>
                        <div style={{textAlign: 'right'}}>
                            <div style={pdfStyles.reportBadge}>BÁO CÁO Y KHOA</div>
                            <p style={pdfStyles.metaInfo}>Ngày tạo: {new Date().toLocaleDateString('vi-VN')}</p>
                        </div>
                    </div>
                    <div style={pdfStyles.divider}></div>

                    {/* Patient Info */}
                    <div style={pdfStyles.section}>
                        <table style={pdfStyles.table}>
                            <tbody>
                                <tr>
                                    <td style={pdfStyles.tdLabel}>Mã hồ sơ:</td>
                                    <td style={pdfStyles.tdValue}>#{data.id}</td>
                                    <td style={pdfStyles.tdLabel}>Ngày tải lên:</td>
                                    <td style={pdfStyles.tdValue}>{new Date(data.upload_date).toLocaleString('vi-VN')}</td>
                                </tr>
                                <tr>
                                    <td style={pdfStyles.tdLabel}>Chẩn đoán AI:</td>
                                    <td style={{...pdfStyles.tdValue, color: severity.color, fontWeight: 'bold'}}>{data.ai_result}</td>
                                    <td style={pdfStyles.tdLabel}>Trạng thái:</td>
                                    <td style={pdfStyles.tdValue}>Đã hoàn tất</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Image Section - Side by Side for PDF */}
                    <div style={pdfStyles.section}>
                        <h3 style={pdfStyles.sectionTitle}>HÌNH ẢNH SOI ĐÁY MẮT</h3>
                        <div style={pdfStyles.imageRow}>
                            <div style={pdfStyles.imageBox}>
                                <p style={pdfStyles.imageCaption}>Ảnh gốc</p>
                                {/* Dùng crossOrigin="anonymous" để tránh lỗi CORS khi vẽ canvas */}
                                <img src={data.image_url} crossOrigin="anonymous" style={pdfStyles.medicalImage} alt="Original" />
                            </div>
                            {data.annotated_image_url && (
                                <div style={pdfStyles.imageBox}>
                                    <p style={pdfStyles.imageCaption}>Phân tích tổn thương (AI)</p>
                                    <img src={data.annotated_image_url} crossOrigin="anonymous" style={pdfStyles.medicalImage} alt="AI Analysis" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detailed Result */}
                    <div style={pdfStyles.section}>
                        <h3 style={pdfStyles.sectionTitle}>KẾT QUẢ PHÂN TÍCH CHI TIẾT</h3>
                        <div style={pdfStyles.resultContent}>
                            {data.ai_detailed_report}
                        </div>
                    </div>

                    {/* Doctor Note */}
                    {data.doctor_note && (
                        <div style={{...pdfStyles.section, backgroundColor: '#f9f9f9', padding: '15px', border: '1px dashed #ccc'}}>
                            <h3 style={{...pdfStyles.sectionTitle, margin: 0, color: '#0d47a1'}}>LỜI KHUYÊN CỦA BÁC SĨ</h3>
                            <p style={{marginTop: '10px', whiteSpace: 'pre-wrap'}}>{data.doctor_note}</p>
                        </div>
                    )}

                    {/* Footer / Signature */}
                    <div style={pdfStyles.footer}>
                        <div style={pdfStyles.signatureBox}>
                            <p style={{fontWeight: 'bold', marginBottom: '50px'}}>BÁC SĨ CHUYÊN KHOA</p>
                            <p>(Ký và ghi rõ họ tên)</p>
                        </div>
                    </div>
                    <p style={pdfStyles.footerNote}>* Báo cáo này được tạo tự động bởi hệ thống AI AURA. Kết quả mang tính chất tham khảo, vui lòng tham vấn bác sĩ chuyên khoa.</p>
                </div>
            </div>
        </div>
    );
};

// --- STYLES CHO UI MÀN HÌNH ---
const styles: { [key: string]: React.CSSProperties } = {
    fullScreenOverlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: '#fff', zIndex: 9999, overflowY: 'auto' },
    innerContainer: { maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', minHeight: '100%', backgroundColor: '#fff' },
    loadingScreen: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' },
    modernBackBtn: { display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '6px 16px 6px 6px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '30px', color: '#475569', cursor: 'pointer', marginBottom: '25px' },
    iconCircle: { width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '30px', borderBottom: '2px solid #f5f5f5', paddingBottom: '20px' },
    exportBtn: { display: 'inline-flex', alignItems: 'center', padding: '8px 16px', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '40px' },
    leftColumn: { display: 'flex', flexDirection: 'column', gap: '20px' },
    imageContainer: { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden' },
    toggleContainer: { position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.95)', borderRadius: '30px', padding: '5px', display: 'flex', gap: '5px' },
    toggleBtn: { border: 'none', background: 'transparent', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px' },
    toggleActive: { border: 'none', background: '#007bff', color: 'white', padding: '6px 15px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
    rightColumn: { display: 'flex', flexDirection: 'column', gap: '25px' },
    resultBox: {},
    label: { textTransform: 'uppercase', fontSize: '12px', color: '#999', fontWeight: 'bold' },
    doctorNoteBox: { padding: '20px', backgroundColor: '#e3f2fd', borderRadius: '12px', border: '1px solid #90caf9' },
    doctorNoteText: { margin: '10px 0 0 0', fontSize: '15px', color: '#1565c0', whiteSpace: 'pre-wrap' },
    analysisDetails: { backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '20px' },
    reportContent: { whiteSpace: 'pre-line', lineHeight: '1.6', fontSize: '14px', color: '#333' }
};

// --- STYLES CHO FILE PDF (A4 Format) ---
const pdfStyles: { [key: string]: React.CSSProperties } = {
    container: {
        width: '190mm', // Chiều rộng nội dung A4 (trừ margin)
        minHeight: '270mm',
        padding: '10mm',
        backgroundColor: '#ffffff',
        fontFamily: 'Times New Roman, serif',
        color: '#000',
        fontSize: '12pt',
        lineHeight: '1.5'
    },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' },
    brandTitle: { fontSize: '24pt', fontWeight: 'bold', color: '#1a73e8', margin: 0, letterSpacing: '1px' },
    brandSubtitle: { fontSize: '10pt', fontWeight: 'bold', color: '#555', margin: '5px 0' },
    metaInfo: { fontSize: '9pt', color: '#666', margin: 0 },
    reportBadge: { border: '2px solid #d93025', color: '#d93025', padding: '5px 10px', fontWeight: 'bold', fontSize: '14pt', borderRadius: '4px', display: 'inline-block', marginBottom: '5px' },
    divider: { height: '2px', backgroundColor: '#1a73e8', margin: '10px 0 20px 0' },
    section: { marginBottom: '20px' },
    sectionTitle: { fontSize: '14pt', fontWeight: 'bold', borderBottom: '1px solid #ccc', paddingBottom: '5px', marginBottom: '10px', color: '#333', textTransform: 'uppercase' },
    table: { width: '100%', borderCollapse: 'collapse', marginBottom: '10px' },
    tdLabel: { width: '15%', fontWeight: 'bold', padding: '5px', verticalAlign: 'top', color: '#555' },
    tdValue: { width: '35%', padding: '5px', verticalAlign: 'top' },
    imageRow: { display: 'flex', justifyContent: 'space-between', gap: '10mm' },
    imageBox: { flex: 1, textAlign: 'center', border: '1px solid #eee', padding: '5px' },
    imageCaption: { fontSize: '10pt', fontStyle: 'italic', marginBottom: '5px', color: '#444' },
    medicalImage: { width: '100%', height: 'auto', maxHeight: '200px', objectFit: 'contain' },
    resultContent: { fontSize: '11pt', textAlign: 'justify', whiteSpace: 'pre-line' },
    footer: { marginTop: '30px', display: 'flex', justifyContent: 'flex-end' },
    signatureBox: { textAlign: 'center', width: '200px' },
    footerNote: { marginTop: '50px', fontSize: '9pt', fontStyle: 'italic', textAlign: 'center', color: '#777', borderTop: '1px solid #eee', paddingTop: '10px' }
};

export default AnalysisResult;