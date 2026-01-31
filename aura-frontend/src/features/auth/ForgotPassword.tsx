import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/App.css';

const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setMessage('');

        try {
            const response = await fetch('https://aurahealth.name.vn/api/v1/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('Vui lòng kiểm tra email của bạn để đặt lại mật khẩu.');
            } else {
                setError(data.detail || 'Không tìm thấy email này trong hệ thống.');
            }
        } catch (err) {
            setError('Lỗi kết nối Server!');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        // --- SỬA: Thêm wrapper container ---
        <div className="login-container">
            <div className="login-box">
                <div className="form-title">
                    <h3>Forgot Password</h3>
                </div>
                
                <form onSubmit={handleForgotPassword}>
                    {error && <p style={{color: '#ff6b6b', marginBottom: '15px', fontWeight: 'bold'}}>{error}</p>}
                    {message && <p style={{color: '#4caf50', marginBottom: '15px', fontWeight: 'bold'}}>{message}</p>}

                    <p style={{marginBottom: '20px', fontSize: '0.9em', color: 'rgba(255,255,255,0.9)'}}>
                        Nhập email đăng ký của bạn, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
                    </p>

                    <div className="input-group">
                        <i className="fas fa-envelope icon"></i> 
                        <input 
                            type="email" 
                            placeholder="Enter your email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required
                        />
                    </div>

                    <button type="submit" disabled={isLoading} style={{opacity: isLoading ? 0.7 : 1}}>
                        {isLoading ? 'Sending...' : 'Confirm Email'}
                    </button>

                    <div className="register-section" style={{marginTop: '20px'}}>
                        <span
                            className="register-link hover-underline"
                            style={{cursor: 'pointer', color: '#fff'}}
                            onClick={() => navigate('/login')} // Đổi về /login cho thống nhất
                        >
                            <i className="fas fa-arrow-left" style={{marginRight: '5px'}}></i> Back to Login
                        </span>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ForgotPassword;