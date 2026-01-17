import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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
    const [feedbackContent, setFeedbackContent] = useState('');    // Nội dung phản hồi cho Admin
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // Giả lập fetch dữ liệu chi tiết (Bao gồm cả thông tin User/Patient)
        // Trong thực tế: Bạn gọi API: GET /api/v1/medical-records/{id}/detail
        const fetchReportDetails = async () => {
            const token = localStorage.getItem('token');
            if (!id || !token) return;

            try {
                // GỌI API THẬT (Thay thế đoạn code mock data cũ)
                const res = await fetch(`http://localhost:8000/api/v1/doctor/records/${id}/report-detail`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    // Cập nhật state bằng dữ liệu thật từ Backend trả về
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
            // Gọi API gửi báo cáo/feedback
            // Map với DoctorValidation model: feedback_for_ai & is_correct
            const payload = {
                doctor_diagnosis: info?.current_doctor_diagnosis || info?.ai_diagnosis, // Giữ nguyên chẩn đoán
                feedback_for_ai: feedbackContent // Trường quan trọng để Admin huấn luyện lại AI
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
                alert("Đã gửi báo cáo thành công!");
                navigate(-1); // Quay lại trang trước
            } else {
                alert("Gửi thất bại. Vui lòng thử lại.");
            }
        } catch (error) {
            alert("Lỗi kết nối Server");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div style={{padding: 20}}>Đang tải thông tin hồ sơ...</div>;
    if (!info) return <div style={{padding: 20}}>Không tìm thấy hồ sơ.</div>;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <button onClick={() => navigate(-1)} style={styles.backBtn}>&larr; Quay lại</button>
                <h2 style={styles.title}>BÁO CÁO SAI SÓT / PHẢN HỒI AI</h2>
            </div>

            <div style={styles.contentWrapper}>
                {/* Phần 1: Thông tin định danh (Grid 2 cột) */}
                <div style={styles.card}>
                    <h3 style={styles.cardTitle}>Thông tin hồ sơ</h3>
                    <div style={styles.infoGrid}>
                        <div style={styles.infoItem}>
                            <span style={styles.label}>Mã số thẩm định (Record ID):</span>
                            <span style={styles.valueHighlight}>{info.record_id}</span>
                        </div>
                        <div style={styles.infoItem}>
                            {/* Placeholder để căn chỉnh nếu cần */}
                        </div>

                        <div style={styles.infoItem}>
                            <span style={styles.label}>Bệnh nhân:</span>
                            <span style={styles.value}>{info.patient_name}</span>
                            <span style={styles.subValue}>(ID: {info.patient_id})</span>
                        </div>
                        
                        <div style={styles.infoItem}>
                            <span style={styles.label}>Bác sĩ báo cáo:</span>
                            <span style={styles.value}>{info.doctor_name}</span>
                            <span style={styles.subValue}>(ID: {info.doctor_id})</span>
                        </div>
                    </div>
                </div>

                {/* Phần 2: So sánh Chẩn đoán */}
                <div style={styles.card}>
                    <h3 style={styles.cardTitle}>Dữ liệu chẩn đoán hiện tại</h3>
                    <div style={{display: 'flex', gap: '20px', alignItems: 'flex-start'}}>
                        {/* Ảnh thu nhỏ */}
                        <img src={info.image_url} alt="Scan" style={styles.thumbnail} />
                        
                        <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '10px'}}>
                            <div style={styles.diagnosisRow}>
                                <span style={styles.label}>Kết quả AI đưa ra:</span>
                                <span style={{...styles.badge, backgroundColor: '#ffeeba', color: '#856404'}}>
                                    {info.ai_diagnosis}
                                </span>
                            </div>
                            <div style={styles.diagnosisRow}>
                                <span style={styles.label}>Thẩm định hiện tại:</span>
                                <span style={{...styles.badge, backgroundColor: '#d4edda', color: '#155724'}}>
                                    {info.current_doctor_diagnosis || "Chưa có"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Phần 3: Form Phản hồi */}
                <div style={styles.card}>
                    <h3 style={{...styles.cardTitle, color: '#dc3545'}}>Nội dung báo cáo</h3>
                    
                    {/* Xác nhận tính đúng đắn */}
                    {/* Text area nhập liệu */}
                    <div style={styles.formGroup}>
                        <label style={styles.label}>
                            Mô tả chi tiết lỗi sai hoặc góp ý cải thiện (Gửi cho Admin/Dev):
                            <span style={{color: 'red'}}> *</span>
                        </label>
                        <textarea 
                            rows={6}
                            style={styles.textarea}
                            placeholder="Ví dụ: AI bỏ sót xuất huyết ở vùng hoàng điểm, hoặc nhận diện sai đĩa thị..."
                            value={feedbackContent}
                            onChange={(e) => setFeedbackContent(e.target.value)}
                        />
                    </div>

                    <div style={styles.footer}>
                        <button 
                            onClick={handleSubmitReport} 
                            disabled={isSubmitting}
                            style={styles.submitBtn}
                        >
                            {isSubmitting ? "Đang gửi..." : "Gửi Báo Cáo"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Styles (Inline CSS để đồng bộ với file DoctorAnalysis của bạn)
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: '100vh',
        backgroundColor: '#f4f6f8',
        fontFamily: 'Segoe UI, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
    },
    header: {
        width: '100%',
        backgroundColor: 'white',
        padding: '15px 30px',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    },
    backBtn: {
        background: 'none', border: '1px solid #ccc', borderRadius: '4px', padding: '6px 12px', cursor: 'pointer', color: '#555'
    },
    title: {
        margin: 0, fontSize: '20px', color: '#d9534f'
    },
    contentWrapper: {
        width: '100%',
        maxWidth: '800px',
        padding: '30px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
    },
    card: {
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '25px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #eee'
    },
    cardTitle: {
        marginTop: 0,
        marginBottom: '20px',
        fontSize: '16px',
        fontWeight: '700',
        color: '#0056b3',
        textTransform: 'uppercase',
        borderBottom: '2px solid #f0f0f0',
        paddingBottom: '10px'
    },
    infoGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '15px 30px'
    },
    infoItem: {
        display: 'flex',
        flexDirection: 'column',
    },
    label: {
        fontSize: '13px',
        color: '#666',
        fontWeight: '600',
        marginBottom: '4px'
    },
    value: {
        fontSize: '15px',
        color: '#333',
        fontWeight: '500'
    },
    valueHighlight: {
        fontSize: '15px',
        color: '#0056b3',
        fontWeight: 'bold',
        fontFamily: 'monospace'
    },
    subValue: {
        fontSize: '12px',
        color: '#888'
    },
    thumbnail: {
        width: '100px',
        height: '100px',
        objectFit: 'cover',
        borderRadius: '6px',
        border: '1px solid #ddd'
    },
    badge: {
        padding: '5px 10px',
        borderRadius: '4px',
        fontSize: '14px',
        fontWeight: 'bold',
        display: 'inline-block'
    },
    diagnosisRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    },
    formGroup: {
        marginBottom: '20px'
    },
    radioGroup: {
        display: 'flex',
        gap: '15px',
        marginTop: '8px'
    },
    radioBtn: {
        padding: '10px 15px',
        border: '1px solid #ddd',
        borderRadius: '6px',
        cursor: 'pointer',
        backgroundColor: '#fff'
    },
    radioSelected: {
        padding: '10px 15px',
        border: '1px solid #28a745',
        backgroundColor: '#e8f5e9',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold',
        color: '#155724'
    },
    radioSelectedError: {
        padding: '10px 15px',
        border: '1px solid #dc3545',
        backgroundColor: '#f8d7da',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: 'bold',
        color: '#721c24'
    },
    textarea: {
        width: '100%',
        padding: '12px',
        fontSize: '14px',
        border: '1px solid #ccc',
        borderRadius: '6px',
        marginTop: '8px',
        boxSizing: 'border-box'
    },
    footer: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '10px'
    },
    submitBtn: {
        padding: '12px 24px',
        backgroundColor: '#d9534f',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(217, 83, 79, 0.3)'
    }
};

export default DoctorReport;