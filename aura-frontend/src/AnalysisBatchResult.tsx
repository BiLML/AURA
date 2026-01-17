import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

const AnalysisBatchResult: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    
    // Nhận dữ liệu từ trang Upload
    const { batchResults } = location.state || { batchResults: [] };
    const [results, setResults] = useState(batchResults);
    const [filter, setFilter] = useState('ALL'); 

    // Lấy thông tin User hiện tại để quyết định luồng
    const getUserRole = () => {
        try {
            const userInfo = JSON.parse(localStorage.getItem('user_info') || '{}');
            return userInfo.role ? userInfo.role.toUpperCase() : 'USER';
        } catch { return 'USER'; }
    };
    const currentRole = getUserRole();
    const isClinicOrDoctor = currentRole === 'CLINIC' || currentRole === 'DOCTOR';

    if (!batchResults || batchResults.length === 0) {
        return (
            <div style={styles.emptyContainer}>
                <h3>Không có dữ liệu phân tích</h3>
                <button onClick={() => navigate('/upload')} style={styles.backBtn}>Quay lại tải ảnh</button>
            </div>
        );
    }

    const getStatusColor = (diagnosis: string) => {
        const d = diagnosis.toLowerCase();
        if (d.includes('severe') || d.includes('pdr')) return '#dc3545';
        if (d.includes('moderate')) return '#fd7e14';
        if (d.includes('mild')) return '#ffc107';
        if (d.includes('normal')) return '#28a745';
        return '#6c757d';
    };

    const filteredResults = results.filter((item: any) => {
        if (filter === 'ALL') return true;
        const isNormal = item.diagnosis.toLowerCase().includes('normal');
        if (filter === 'NORMAL') return isNormal;
        if (filter === 'ABNORMAL') return !isNormal;
        return true;
    });

    // --- LOGIC POLLING (TỰ ĐỘNG CẬP NHẬT) ---
    useEffect(() => {
        const hasPending = results.some((r: any) => 
            r.diagnosis === "Đang xử lý..." || r.status === "PENDING" || r.diagnosis === "Unknown"
        );

        if (hasPending) {
            const interval = setInterval(async () => {
                const token = localStorage.getItem('token');
                
                // [QUAN TRỌNG] Chọn API Endpoint dựa trên Role
                const apiEndpoint = isClinicOrDoctor
                    ? `http://localhost:8000/api/v1/clinics/medical-records/?limit=50&t=${Date.now()}` // API cho Clinic
                    : `http://localhost:8000/api/v1/medical-records/?limit=50&t=${Date.now()}`;       // API cho User thường

                try {
                    const res = await fetch(apiEndpoint, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        const serverRecords = Array.isArray(data) ? data : (data.items || []);

                        setResults((prevResults: any) => {
                            let hasUpdate = false;
                            const newResults = prevResults.map((localItem: any) => {
                                if (localItem.status === "COMPLETED") return localItem;

                                const serverItem = serverRecords.find((s: any) => 
                                    String(s.id).trim().toLowerCase() === String(localItem.id).trim().toLowerCase()
                                );
                                
                                if (serverItem) {
                                    let updatedItem = { ...localItem };
                                    
                                    // Logic lấy kết quả từ server (Clinic trả về cấu trúc hơi khác User chút nên cần check kỹ)
                                    let analysis = serverItem.analysis_result;
                                    if (!analysis && serverItem.analysis_results && serverItem.analysis_results.length > 0) {
                                        analysis = serverItem.analysis_results[0];
                                    }
                                    // Fallback nếu API clinic trả thẳng field
                                    const risk = analysis?.risk_level || serverItem.ai_risk_level;

                                    if (risk && risk !== "Processing..." && risk !== "Unknown") {
                                        hasUpdate = true;
                                        updatedItem = {
                                            ...updatedItem,
                                            diagnosis: risk,
                                            annotated_image_url: analysis?.annotated_image_url || serverItem.annotated_image_url,
                                            report: analysis?.ai_detailed_report || serverItem.ai_detailed_report || "Đã có kết quả.",
                                            status: "COMPLETED", 
                                            confidence: 99.9
                                        };
                                    }
                                    return updatedItem;
                                }
                                return localItem;
                            });
                            return hasUpdate ? newResults : prevResults;
                        });
                    }
                } catch (e) { console.error("Polling error", e); }
            }, 3000); // Poll mỗi 3s

            return () => clearInterval(interval);
        }
    }, [results, isClinicOrDoctor]);
    
    // --- HÀM XỬ LÝ CHUYỂN HƯỚNG ---
    const handleViewDetail = (item: any) => {
        if (isClinicOrDoctor) {
            // 👉 Điều hướng sang trang ClinicAnalysisResult
            navigate(`/clinic/analysis/${item.id}`);
        } else {
            // 👉 Điều hướng sang trang Analysis (User thường)
            navigate(`/analysis-result/${item.id}`, { 
                state: { 
                    result: {
                        id: item.id,
                        ai_result: item.diagnosis,
                        ai_detailed_report: item.report,
                        annotated_image_url: item.annotated_image_url,
                        image_url: item.image_url || item.local_preview,
                        upload_date: new Date().toISOString()
                    }
                } 
            });
        }
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <button onClick={() => navigate('/upload')} style={styles.backBtn}>
                    <FaArrowLeft /> Tải thêm ảnh khác
                </button>
                <div style={styles.headerTitle}>
                    <h2>KẾT QUẢ PHÂN TÍCH ({isClinicOrDoctor ? 'PHÒNG KHÁM' : 'CÁ NHÂN'})</h2>
                    <span style={styles.badge}>{batchResults.length} Ảnh</span>
                </div>
                <div style={styles.filterGroup}>
                    <button style={filter === 'ALL' ? styles.filterBtnActive : styles.filterBtn} onClick={() => setFilter('ALL')}>Tất cả</button>
                    <button style={filter === 'ABNORMAL' ? styles.filterBtnActive : styles.filterBtn} onClick={() => setFilter('ABNORMAL')}>Có bệnh</button>
                </div>
            </header>

            <div style={styles.grid}>
                {filteredResults.map((item: any, index: number) => (
                    <div key={index} style={styles.card}>
                        <div style={styles.imageWrapper}>
                            <img 
                                src={item.annotated_image_url || item.image_url || item.local_preview || `data:image/jpeg;base64,${item.image_base64}`}
                                alt={`Result ${index}`} 
                                style={styles.image} 
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = 'https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg';
                                }}
                            />
                            <div style={styles.confidenceBadge}>{item.confidence || 99}%</div>
                        </div>

                        <div style={styles.cardBody}>
                            <h3 style={{...styles.diagnosis, color: getStatusColor(item.diagnosis)}}>
                                {item.diagnosis}
                            </h3>
                            <div style={styles.reportBox}>
                                <p style={styles.reportText}>
                                    {item.report ? item.report.split('\n')[0] : "Không có ghi chú thêm."}
                                </p>
                            </div>

                            <div style={styles.cardFooter}>
                                {item.diagnosis.toLowerCase().includes('normal') ? (
                                    <span style={{color: '#28a745', display:'flex', alignItems:'center', gap:'5px', fontSize:'13px', fontWeight:'bold'}}>
                                        <FaCheckCircle /> An toàn
                                    </span>
                                ) : (
                                    <span style={{color: '#dc3545', display:'flex', alignItems:'center', gap:'5px', fontSize:'13px', fontWeight:'bold'}}>
                                        <FaExclamationTriangle /> Cần lưu ý
                                    </span>
                                )}
                                
                                {/* GỌI HÀM ĐIỀU HƯỚNG ĐÃ TÁCH Ở TRÊN */}
                                <button style={styles.detailBtn} onClick={() => handleViewDetail(item)}>
                                    Xem chi tiết
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: { minHeight: '100vh', backgroundColor: '#f8f9fa', padding: '30px', fontFamily: '"Segoe UI", sans-serif' },
    emptyContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', background: 'white', padding: '15px 25px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' },
    headerTitle: { display: 'flex', alignItems: 'center', gap: '15px' },
    badge: { background: '#e3f2fd', color: '#0d47a1', padding: '5px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' },
    backBtn: { background: 'transparent', border: '1px solid #dee2e6', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#495057' },
    filterGroup: { display: 'flex', gap: '10px' },
    filterBtn: { background: '#f1f3f5', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', color: '#495057' },
    filterBtnActive: { background: '#007bff', border: 'none', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '14px', color: 'white', fontWeight: 'bold' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '25px' },
    card: { background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', transition: 'transform 0.2s', border: '1px solid #f0f0f0' },
    imageWrapper: { width: '100%', height: '220px', background: '#000', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    image: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
    confidenceBadge: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '11px' },
    cardBody: { padding: '20px' },
    diagnosis: { margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' },
    reportBox: { background: '#f8f9fa', padding: '10px', borderRadius: '6px', marginBottom: '15px', height: '50px', overflow: 'hidden' },
    reportText: { margin: 0, fontSize: '13px', color: '#666', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
    cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '15px' },
    detailBtn: { background: 'transparent', border: '1px solid #007bff', color: '#007bff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }
};

export default AnalysisBatchResult;