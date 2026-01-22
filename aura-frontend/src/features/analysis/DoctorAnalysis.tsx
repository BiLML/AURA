import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    FaArrowLeft, FaExpand, FaCompress, FaExclamationTriangle, 
    FaSave, FaSpinner, FaStethoscope, FaCheckCircle, FaTimesCircle, FaEdit
} from 'react-icons/fa';

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
        { value: "Normal", label: "Normal (Bình thường)" },
        { value: "Mild NPDR (Early Signs)", label: "Mild NPDR (Nhẹ)" },
        { value: "Moderate NPDR", label: "Moderate NPDR (Trung bình)" },
        { value: "Severe NPDR", label: "Severe NPDR (Nặng)" },
        { value: "PDR", label: "PDR (Tăng sinh - Nguy hiểm)" }
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
                
                if (normalized.doctor_note) setInternalNote(normalized.doctor_note);
                setFinalDiagnosis(normalized.ai_result); 
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
                ai_detailed_report: reportContent 
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

    if (loading) return <div style={styles.loading}><FaSpinner className="spin" size={40} color="#007bff"/></div>;
    if (!data) return <div style={styles.loading}>Không tìm thấy dữ liệu.</div>;

    const currentImage = (viewMode === 'annotated' && data.annotated_image_url) ? data.annotated_image_url : data.image_url;

    return (
        <div ref={containerRef} style={styles.container} className="fade-in">
            {/* Header Toolbar */}
            <header style={styles.toolbar}>
                <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                    <button onClick={() => navigate(-1)} style={styles.backBtn} className="btn-secondary-hover">
                        <FaArrowLeft style={{marginRight: '6px'}}/> Thoát
                    </button>
                    <div style={styles.divider}></div>
                    <div style={{display:'flex', flexDirection:'column'}}>
                        <h2 style={{margin: 0, fontSize: '16px', color: '#1e293b', fontWeight: '700'}}>Thẩm định Hồ sơ #{data.id}</h2>
                        <span style={{fontSize:'12px', color:'#64748b'}}>Ngày tải lên: {new Date(data.upload_date).toLocaleDateString('vi-VN')}</span>
                    </div>
                </div>
                
                <div style={{display: 'flex', gap: '10px'}}>
                    <button onClick={toggleFullscreen} style={styles.toolBtn} className="btn-secondary-hover" title="Toàn màn hình">
                        {isFullscreen ? <FaCompress/> : <FaExpand/>}
                    </button>
                    <button onClick={handleReportIssue} style={styles.reportBtn} className="btn-warning-hover">
                        <FaExclamationTriangle style={{marginRight:'6px'}}/> Báo lỗi
                    </button>
                </div>
            </header>

            <div style={styles.mainGrid}>
                {/* --- CỘT TRÁI (Hình ảnh & AI Info) --- */}
                <div style={styles.leftPanel}>
                    {/* Image Viewer */}
                    <div style={styles.imageBox}>
                        <img src={currentImage} alt="Retina" style={styles.image} />
                        
                        <div style={styles.overlayControls}>
                            {data.annotated_image_url ? (
                                <div style={styles.viewModeGroup}>
                                    <button 
                                        style={viewMode === 'original' ? styles.toggleActive : styles.toggleBtn}
                                        onClick={() => setViewMode('original')}
                                    >Ảnh gốc</button>
                                    <button 
                                        style={viewMode === 'annotated' ? styles.toggleActive : styles.toggleBtn}
                                        onClick={() => setViewMode('annotated')}
                                    >AI Khoanh vùng</button>
                                </div>
                            ) : <span style={{color:'white', fontSize:'12px', padding:'5px 10px', background:'rgba(0,0,0,0.5)', borderRadius:'12px'}}>Không có ảnh khoanh vùng</span>}
                        </div>
                    </div>
                    
                    <div className="slide-up-card" style={{padding: '0 5px'}}>
                        <div style={styles.cardInfo}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px', borderBottom:'1px solid #f1f5f9', paddingBottom:'10px'}}>
                                <h4 style={{margin:0, color:'#1e293b', display:'flex', alignItems:'center'}}>
                                    <FaStethoscope style={{marginRight:'8px', color:'#007bff'}}/> Kết quả AI
                                </h4>
                                <span style={{
                                    ...styles.badge, 
                                    backgroundColor: (data.ai_result||'').includes('Normal') ? '#dcfce7' : '#fee2e2',
                                    color: (data.ai_result||'').includes('Normal') ? '#166534' : '#991b1b'
                                }}>
                                    {data.ai_result}
                                </span>
                            </div>

                            {/* Legend */}
                            {viewMode === 'annotated' && (
                                <div style={styles.legendGrid}>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'red'}}></span>Xuất huyết</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'yellow'}}></span>Xuất tiết</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'green'}}></span>Mạch máu</div>
                                    <div style={styles.legendItem}><span style={{...styles.dot, background: 'blue'}}></span>Đĩa thị</div>
                                </div>
                            )}

                            {/* Editable AI Report */}
                            <div style={{marginTop:'20px'}}>
                                <label style={styles.label}>
                                    <FaEdit style={{marginRight:'5px', color:'#64748b'}}/> 
                                    Thông số chi tiết (AI trích xuất)
                                </label>
                                <textarea
                                    className="input-focus"
                                    style={styles.codeEditor}
                                    value={reportContent}
                                    onChange={(e) => setReportContent(e.target.value)}
                                    placeholder="Nội dung báo cáo chi tiết..."
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- CỘT PHẢI (Form Chẩn đoán) --- */}
                <div style={styles.rightPanel}>
                    <div style={styles.formHeader}>
                        <h3 style={{margin:0, color:'#0f172a', fontSize:'18px'}}>CHẨN ĐOÁN CỦA BÁC SĨ</h3>
                        <div style={{fontSize:'13px', color:'#64748b', marginTop:'4px'}}>Vui lòng xác thực kết quả từ AI</div>
                    </div>
                    
                    <div style={styles.formScroll}>
                        {/* Section 1: AI Verification */}
                        <div style={styles.section}>
                            <label style={styles.sectionLabel}>1. Đánh giá kết quả AI</label>
                            <div style={styles.radioGroup}>
                                <div 
                                    onClick={() => { setIsAiCorrect(true); setFinalDiagnosis(data.ai_result); }}
                                    style={{
                                        ...styles.radioCard, 
                                        borderColor: isAiCorrect ? '#22c55e' : '#e2e8f0',
                                        backgroundColor: isAiCorrect ? '#f0fdf4' : '#fff'
                                    }}
                                >
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                        <div style={{...styles.radioCircle, borderColor: isAiCorrect ? '#22c55e' : '#cbd5e1'}}>
                                            {isAiCorrect && <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#22c55e'}}></div>}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:'600', color: isAiCorrect ? '#15803d' : '#334155'}}>Chính xác</div>
                                            <div style={{fontSize:'12px', color:'#64748b'}}>Đồng ý với AI</div>
                                        </div>
                                    </div>
                                    <FaCheckCircle style={{color: isAiCorrect ? '#22c55e' : '#e2e8f0', fontSize:'20px'}}/>
                                </div>

                                <div 
                                    onClick={() => { setIsAiCorrect(false); setFinalDiagnosis(''); }}
                                    style={{
                                        ...styles.radioCard, 
                                        borderColor: !isAiCorrect ? '#ef4444' : '#e2e8f0',
                                        backgroundColor: !isAiCorrect ? '#fef2f2' : '#fff'
                                    }}
                                >
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                        <div style={{...styles.radioCircle, borderColor: !isAiCorrect ? '#ef4444' : '#cbd5e1'}}>
                                            {!isAiCorrect && <div style={{width:'8px', height:'8px', borderRadius:'50%', background:'#ef4444'}}></div>}
                                        </div>
                                        <div>
                                            <div style={{fontWeight:'600', color: !isAiCorrect ? '#b91c1c' : '#334155'}}>Sai lệch</div>
                                            <div style={{fontSize:'12px', color:'#64748b'}}>Cần chẩn đoán lại</div>
                                        </div>
                                    </div>
                                    <FaTimesCircle style={{color: !isAiCorrect ? '#ef4444' : '#e2e8f0', fontSize:'20px'}}/>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Final Diagnosis */}
                        <div style={styles.section}>
                            <label style={styles.sectionLabel}>
                                2. Kết luận cuối cùng
                                {!isAiCorrect && <span style={{color: 'red', marginLeft:'4px'}}>*</span>}
                            </label>
                            
                            <select
                                className="input-focus"
                                style={{
                                    ...styles.select, 
                                    borderColor: !isAiCorrect && !finalDiagnosis ? '#ef4444' : '#cbd5e1',
                                    backgroundColor: isAiCorrect ? '#f8fafc' : '#fff', 
                                    cursor: isAiCorrect ? 'not-allowed' : 'pointer',
                                    color: isAiCorrect ? '#64748b' : '#0f172a'
                                }}
                                value={finalDiagnosis}
                                onChange={(e) => setFinalDiagnosis(e.target.value)}
                                disabled={isAiCorrect} 
                            >
                                <option value="" disabled>-- Chọn mức độ bệnh --</option>
                                {DIAGNOSIS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Section 3: Notes */}
                        <div style={styles.section}>
                            <label style={styles.sectionLabel}>3. Ghi chú</label>
                            <textarea
                                className="input-focus"
                                style={styles.textarea}
                                rows={5}
                                value={internalNote}
                                onChange={(e) => setInternalNote(e.target.value)}
                                placeholder="Ghi chú cho hồ sơ bệnh nhân"
                            />
                        </div>
                    </div>

                    <div style={styles.formFooter}>
                        <button 
                            onClick={handleSubmitDiagnosis} 
                            disabled={isSaving} 
                            className="btn-primary-hover pulse-on-active"
                            style={styles.saveBtn}
                        >
                            {isSaving ? <><FaSpinner className="spin"/> Đang lưu...</> : <><FaSave/> Xác nhận & Lưu hồ sơ</>}
                        </button>
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
        zIndex: 9999, backgroundColor: '#f4f6f9', display: 'flex', flexDirection: 'column', 
        fontFamily: '"Segoe UI", sans-serif', overflow: 'hidden', boxSizing: 'border-box'
    },
    
    // TOOLBAR
    toolbar: { 
        height: '60px', padding: '0 25px', background: 'white', borderBottom: '1px solid #e2e8f0', 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, zIndex: 10
    },
    backBtn: { background: 'white', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: '8px', color: '#64748b', cursor: 'pointer', fontWeight: '600', fontSize:'13px', display:'flex', alignItems:'center', transition: 'all 0.2s' },
    divider: { height: '24px', width: '1px', background: '#e2e8f0', margin: '0 5px' },
    toolBtn: { background: '#f1f5f9', border: 'none', color: '#475569', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', display:'flex', alignItems:'center', transition: 'all 0.2s' },
    reportBtn: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display:'flex', alignItems:'center', transition: 'all 0.2s' },

    // GRID LAYOUT
    mainGrid: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 400px', overflow: 'hidden' },

    // LEFT PANEL
    leftPanel: { padding: '20px', overflowY: 'auto', backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', gap: '20px' },
    
    imageBox: { 
        width: '100%', flex: 1, minHeight: '450px', backgroundColor: '#0f172a', 
        borderRadius: '12px', overflow: 'hidden', position: 'relative', 
        display: 'flex', justifyContent: 'center', alignItems: 'center', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)', border: '1px solid #334155'
    },
    image: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    
    overlayControls: { position: 'absolute', bottom: '20px', width: '100%', display: 'flex', justifyContent: 'center' },
    viewModeGroup: { background: 'rgba(255,255,255,0.15)', padding: '5px', borderRadius: '30px', display: 'flex', gap: '0', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.2)' },
    toggleBtn: { background: 'transparent', border: 'none', color: '#e2e8f0', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight:'500' },
    toggleActive: { background: '#007bff', border: 'none', color: 'white', padding: '8px 18px', borderRadius: '25px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' },

    cardInfo: { background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', border: '1px solid #e2e8f0' },
    badge: { padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '700' },
    
    legendGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', fontSize: '13px', marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px' },
    legendItem: { display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: '500' },
    dot: { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },
    
    codeEditor: { width: '100%', height: '180px', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '13px', fontFamily: 'Consolas, monospace', lineHeight: '1.6', color: '#334155', resize: 'vertical', marginTop: '8px', outline:'none', boxSizing: 'border-box' },

    // RIGHT PANEL (FORM)
    rightPanel: { 
        backgroundColor: 'white', borderLeft: '1px solid #e2e8f0', 
        display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 25px rgba(0,0,0,0.03)',
        zIndex: 20
    },
    formHeader: { padding: '25px', borderBottom: '1px solid #f1f5f9', background: '#fff' },
    formScroll: { flex: 1, overflowY: 'auto', padding: '25px', display: 'flex', flexDirection: 'column', gap: '30px' },
    
    section: { display: 'flex', flexDirection: 'column', gap: '12px' },
    sectionLabel: { fontWeight: '700', fontSize: '14px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' },
    label: { fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '4px', display:'flex', alignItems:'center' },
    
    radioGroup: { display: 'flex', flexDirection: 'column', gap: '15px' },
    radioCard: { 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '16px', borderRadius: '10px', border: '1px solid', 
        cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.02)'
    },
    radioCircle: { width: '20px', height: '20px', borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center' },

    select: { padding: '12px', borderRadius: '8px', border: '1px solid', fontSize: '14px', width: '100%', outline: 'none', transition: 'all 0.2s' },
    textarea: { padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', fontFamily: '"Segoe UI", sans-serif', width: '100%', outline: 'none', transition: 'all 0.2s', backgroundColor:'#fff', boxSizing:'border-box' },
    
    formFooter: { padding: '25px', borderTop: '1px solid #f1f5f9', background: '#fff' },
    saveBtn: { 
        width: '100%', padding: '14px', background: 'linear-gradient(135deg, #007bff, #0069d9)', 
        color: 'white', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', 
        cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,123,255,0.25)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        transition: 'all 0.2s'
    },
};

// --- CSS GLOBAL ---
const cssGlobal = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }

.spin { animation: spin 1s linear infinite; }
.fade-in { animation: fadeIn 0.4s ease-out forwards; }
.slide-up-card { animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }

.input-focus:focus { border-color: #007bff !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.1) !important; background-color: #fff !important; }
.btn-secondary-hover:hover { background-color: #f1f5f9 !important; color: #1e293b !important; }
.btn-primary-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(0,123,255,0.3) !important; }
.btn-primary-hover:active { transform: translateY(0); }
.btn-warning-hover:hover { background-color: #fef3c7 !important; color: #92400e !important; }
.pulse-on-active:active { animation: pulse 0.3s; }

::-webkit-scrollbar { width: 6px; } 
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = cssGlobal;
document.head.appendChild(styleSheet);

export default DoctorAnalysis;