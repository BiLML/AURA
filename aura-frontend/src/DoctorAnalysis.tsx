import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Interface dữ liệu
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

const DoctorAnalysis: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    // Ref cho chế độ Fullscreen API (nếu muốn ẩn cả thanh address trình duyệt)
    const containerRef = useRef<HTMLDivElement>(null);

    // State dữ liệu
    const [data, setData] = useState<MedicalRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'original' | 'annotated'>('annotated');
    const [isFullscreen, setIsFullscreen] = useState(false); 

    // State cho Doctor Validation
    const [isAiCorrect, setIsAiCorrect] = useState<boolean>(true);
    const [finalDiagnosis, setFinalDiagnosis] = useState('');      
    const [internalNote, setInternalNote] = useState('');          
    const [isSaving, setIsSaving] = useState(false);

    const [reportContent, setReportContent] = useState(''); 


    // --- 1. FETCH DATA ---
    const normalizeData = (rawData: any): MedicalRecord => {
        const analysisData = rawData.analysis_result || rawData.ai_analysis_result || rawData;
        return {
            id: rawData.id || 0,
            ai_result: analysisData.risk_level || rawData.ai_result || "Unknown",
            ai_detailed_report: analysisData.ai_detailed_report || rawData.detailed_risk || "",
            annotated_image_url: analysisData.annotated_image_url || null,
            image_url: rawData.image_url || rawData.original_image_url || "",
            upload_date: rawData.upload_date || rawData.created_at || new Date().toISOString(),
            doctor_note: rawData.doctor_note || null,
            ai_analysis_status: rawData.ai_analysis_status || "COMPLETED"
        };
    };
    const DIAGNOSIS_OPTIONS = [
        { value: "Normal", label: "Normal" },
        { value: "Mild NPDR (Early Signs)", label: "Mild NPDR (Early Signs)" },
        { value: "Moderate NPDR", label: "Moderate NPDR" },
        { value: "Severe NPDR", label: "Severe NPDR" },
        { value: "PDR", label: "PDR" }
    ];

    const fetchData = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!id || !token) return;

        try {
            const res = await fetch(`http://localhost:8000/api/v1/medical-records/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const resultRaw = await res.json();
                const normalized = normalizeData(resultRaw);
                setData(normalized);
                
                // --- LOAD DỮ LIỆU CŨ VÀO STATE ĐỂ HIỂN THỊ LẠI ---
                if (normalized.doctor_note) setInternalNote(normalized.doctor_note);
                
                // Nếu backend trả về kết quả bác sĩ đã lưu trước đó thì ưu tiên lấy, nếu không lấy của AI
                setFinalDiagnosis(normalized.ai_result); 
                
                // Load nội dung report vào State chỉnh sửa
                setReportContent(normalized.ai_detailed_report);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [fetchData]);

    // --- XỬ LÝ FULLSCREEN (API Trình duyệt) ---
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => alert(`Lỗi: ${err.message}`));
        } else {
            document.exitFullscreen();
        }
    };
    

    // --- 2. XỬ LÝ LƯU ---
    const handleSubmitDiagnosis = async () => {
        if (!id) return;
        if (isAiCorrect === false && (!finalDiagnosis || finalDiagnosis === "")) {
            alert("Vui lòng chọn loại bệnh chính xác trong danh sách!");
            return; 
        }
        
        setIsSaving(true);
        const token = localStorage.getItem('token');
        try {
            const payload = {
                doctor_diagnosis: finalDiagnosis, 
                doctor_notes: internalNote,       
                is_correct: isAiCorrect,
                ai_detailed_report: reportContent // <--- THÊM TRƯỜNG NÀY
            };
            const res = await fetch(`http://localhost:8000/api/v1/doctor/records/${id}/diagnosis`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert("✅ Đã lưu kết quả thẩm định thành công!");
                navigate('/dashboarddr'); 
            } else {
                const err = await res.json();
                alert("Lỗi: " + err.detail);
            }
        } catch (error) {
            alert("Lỗi kết nối server");
        } finally {
            setIsSaving(false);
        }
    };

    const handleReportIssue = () => {
        navigate(`/doctor/report/${id}`, { 
            state: { 
                recordId: id,
                aiResult: data?.ai_result,
                imageUrl: data?.image_url
            } 
        });
    };

    if (loading) return <div>Đang tải...</div>;
    if (!data) return <div>Không tìm thấy dữ liệu.</div>;

    const currentImage = (viewMode === 'annotated' && data.annotated_image_url) ? data.annotated_image_url : data.image_url;

    return (
        <div ref={containerRef} style={styles.container}>
            {/* Header Toolbar */}
            <div style={styles.toolbar}>
                <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                    <button onClick={() => navigate(-1)} style={styles.backBtn}>&larr; Thoát</button>
                    <h2 style={{margin: 0, fontSize: '18px', color: '#444'}}>Thẩm định: #{data.id}</h2>
                </div>
                
                <div style={{display: 'flex', gap: '10px'}}>
                    <button onClick={toggleFullscreen} style={styles.fullscreenBtn}>
                        {isFullscreen ? '⛶ Thu nhỏ' : '⛶ Toàn màn hình'}
                    </button>
                    <button onClick={handleReportIssue} style={styles.reportBtn}>Báo lỗi</button>
                </div>
            </div>

            <div style={styles.mainGrid}>
                {/* --- CỘT TRÁI --- */}
                <div style={styles.leftPanel}>
                    <div style={styles.imageBox}>
                        <img src={currentImage} alt="Retina" style={styles.image} />
                        
                        {data.annotated_image_url && (
                            <div style={styles.viewModeToggle}>
                                <button 
                                    style={viewMode === 'original' ? styles.toggleActive : styles.toggleBtn}
                                    onClick={() => setViewMode('original')}
                                >Ảnh gốc</button>
                                <button 
                                    style={viewMode === 'annotated' ? styles.toggleActive : styles.toggleBtn}
                                    onClick={() => setViewMode('annotated')}
                                >AI Khoanh vùng</button>
                            </div>
                        )}
                    </div>
                    
                    <div style={styles.aiResultBox}>
                        <span style={styles.aiLabel}>Đánh giá:</span>
                        <span style={styles.aiValue}>{data.ai_result}</span>
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
                    
                    {/* --- CẬP NHẬT PHẦN CHI TIẾT AI THÀNH EDITABLE TEXTAREA --- */}
                    <div style={styles.detailsBox}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                            <h4 style={{margin: 0}}>Tham số (Có thể chỉnh sửa):</h4>
                            <span style={{fontSize: '11px', color: '#666', fontStyle: 'italic'}}>Bác sĩ có thể sửa lại nội dung này</span>
                        </div>
                        <textarea
                            style={{
                                ...styles.textarea, 
                                height: '200px', 
                                fontFamily: 'Consolas, monospace', // Font dễ nhìn cho báo cáo kỹ thuật
                                fontSize: '13px',
                                lineHeight: '1.5'
                            }}
                            value={reportContent}
                            onChange={(e) => setReportContent(e.target.value)}
                            placeholder="Nội dung báo cáo chi tiết..."
                        />
                    </div>
                </div>

                {/* --- CỘT PHẢI --- */}
                <div style={styles.rightPanel}>
                    <h3 style={{fontSize: '24px', marginTop: 0, color: '#0056b3'}}>BÁC SĨ CHẨN ĐOÁN</h3>
                    
                    <div style={styles.section}>
                        <label style={styles.label}>Đánh giá kết quả AI:</label>
                        <div style={styles.radioGroup}>
                            <label style={{...styles.radioLabel, background: isAiCorrect ? '#d4edda' : '#fff', borderColor: isAiCorrect ? '#28a745' : '#ddd'}}>
                                <input type="radio" checked={isAiCorrect === true} onChange={() => { setIsAiCorrect(true); setFinalDiagnosis(data.ai_result); }} />
                                AI Đúng
                            </label>

                            <label style={{...styles.radioLabel, background: !isAiCorrect ? '#f8d7da' : '#fff', borderColor: !isAiCorrect ? '#dc3545' : '#ddd'}}>
                                <input type="radio" checked={isAiCorrect === false} onChange={() => { setIsAiCorrect(false); setFinalDiagnosis(''); }} />
                                AI Sai
                            </label>
                        </div>
                    </div>

                    <div style={styles.section}>
                        <label style={styles.label}>
                            Chẩn đoán cuối cùng:
                            {!isAiCorrect && <span style={{color: 'red'}}> *</span>}
                        </label>
                        
                        <select
                            style={{
                                ...styles.select, 
                                borderColor: !isAiCorrect && !finalDiagnosis ? 'red' : '#ccc',
                                backgroundColor: isAiCorrect ? '#e9ecef' : '#fff', 
                                cursor: isAiCorrect ? 'not-allowed' : 'pointer'
                            }}
                            value={finalDiagnosis}
                            onChange={(e) => setFinalDiagnosis(e.target.value)}
                            disabled={isAiCorrect} 
                        >
                            <option value="" disabled>-- Chọn bệnh --</option>
                            {DIAGNOSIS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>

                    <div style={styles.section}>
                        <label style={styles.label}>Ghi chú:</label>
                        <textarea
                            style={styles.textarea}
                            rows={6}
                            value={internalNote}
                            onChange={(e) => setInternalNote(e.target.value)}
                            placeholder="Nhập ghi chú..."
                        />
                    </div>

                    <div style={styles.actionFooter}>
                        <button onClick={handleSubmitDiagnosis} disabled={isSaving} style={styles.saveBtn}>
                            {isSaving ? 'Đang lưu...' : 'Hoàn tất & Lưu'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Styles Update: Dùng Position Fixed để thoát khỏi layout cha
const styles: { [key: string]: React.CSSProperties } = {
    container: { 
        position: 'fixed',    // MẤU CHỐT: Thoát khỏi dòng chảy layout bình thường
        top: 0,
        left: 0,
        width: '100vw',       // Chiều rộng 100% viewport
        height: '100vh',      // Chiều cao 100% viewport
        zIndex: 9999,         // Đè lên tất cả menu, sidebar cũ
        backgroundColor: '#f4f6f8', 
        display: 'flex', 
        flexDirection: 'column', 
        fontFamily: 'Segoe UI, sans-serif', 
        overflow: 'hidden',
        boxSizing: 'border-box'
    },
    toolbar: { 
        height: '50px', 
        padding: '0 20px', 
        background: 'white', 
        borderBottom: '1px solid #ddd', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        flexShrink: 0
    },
    backBtn: { background: 'none', border: '1px solid #ddd', padding: '5px 10px', borderRadius: '4px', color: '#666', cursor: 'pointer', fontWeight: '500' },
    fullscreenBtn: { background: '#e2e6ea', border: 'none', color: '#333', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
    reportBtn: { background: '#fff3cd', border: 'none', color: '#856404', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' },
    
    mainGrid: { 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '1fr 400px', // Cột phải cố định 400px, cột trái co giãn
        overflow: 'hidden' 
    },
    
    // Left Panel (Image Viewer)
    leftPanel: { 
        padding: '20px', 
        overflowY: 'auto', 
        backgroundColor: '#e9ecef', // Nền tối hơn chút để nổi bật ảnh
        display: 'flex', 
        flexDirection: 'column', 
        gap: '15px' 
    },
    imageBox: { 
        width: '100%', 
        flex: 1, // Chiếm phần lớn không gian
        backgroundColor: '#000', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        position: 'relative', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '400px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    },
    image: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    
    // Các nút toggle trên ảnh
    viewModeToggle: { position: 'absolute', bottom: '20px', background: 'rgba(0,0,0,0.7)', padding: '4px', borderRadius: '20px', display: 'flex', gap: '5px' },
    toggleBtn: { background: 'transparent', border: 'none', color: '#ccc', padding: '6px 14px', cursor: 'pointer', fontSize: '13px' },
    toggleActive: { background: '#007bff', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '15px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' },
    
    aiResultBox: { padding: '15px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
    aiLabel: { fontWeight: 'bold', color: '#555' },
    aiValue: { fontSize: '20px', color: '#dc3545', fontWeight: 'bold' },
    
    detailsBox: { background: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },

    // Right Panel (Form)
    rightPanel: { 
        padding: '25px', 
        backgroundColor: 'white', 
        borderLeft: '1px solid #ddd',
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px',
        boxShadow: '-2px 0 5px rgba(0,0,0,0.05)'
    },
    section: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontWeight: '600', fontSize: '14px', color: '#333' },
    radioGroup: { display: 'flex', gap: '10px' },
    radioLabel: { flex: 1, padding: '12px', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' },
    select: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', width: '100%', height: '42px' },
    textarea: { padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit' },
    
    actionFooter: { marginTop: 'auto', paddingTop: '20px' },
    saveBtn: { width: '100%', padding: '14px', background: '#28a745', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' },
    
    legendBox: { marginTop: '5px', backgroundColor: 'white', padding: '10px', borderRadius: '8px' },
    legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '8px', color: '#444', fontWeight: '500' },
    dot: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' },
};

export default DoctorAnalysis;