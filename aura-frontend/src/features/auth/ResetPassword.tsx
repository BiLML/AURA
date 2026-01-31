import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../../styles/App.css';

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp!');
            return;
        }

        try {
            const response = await fetch('http://103.200.23.81:8000/api/v1/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    token: token, 
                    new_password: password 
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setMessage('Đặt lại mật khẩu thành công! Đang chuyển hướng...');
                setTimeout(() => navigate('/login'), 3000); 
            } else {
                setError(data.detail || 'Token không hợp lệ hoặc đã hết hạn.');
            }
        } catch (err) {
            setError('Lỗi kết nối Server!');
        }
    };

    // Trường hợp thiếu Token
    if (!token) {
        return (
            <div className="login-container">
                <div className="login-box" style={{textAlign: 'center', padding: '50px'}}>
                    <h3 style={{color: '#ff6b6b', marginBottom: '20px'}}>Lỗi Truy Cập</h3>
                    <p style={{color: 'white', marginBottom: '30px'}}>Đường dẫn không hợp lệ hoặc thiếu Token xác thực.</p>
                    <button onClick={() => navigate('/login')} style={{width: 'auto', padding: '10px 30px', margin: '0 auto'}}>
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    // Trường hợp hiển thị Form
    return (
        <div className="login-container">
            <div className="login-box">
                <div className="form-title">
                    <h3>Reset Password</h3>
                </div>
                
                <form onSubmit={handleResetPassword}>
                    {error && <p style={{color: '#ff6b6b', marginBottom: '15px', fontWeight: 'bold'}}>{error}</p>}
                    {message && <p style={{color: '#4caf50', marginBottom: '15px', fontWeight: 'bold'}}>{message}</p>}

                    <div className="input-group">
                        <i className="fas fa-lock icon"></i>
                        <input 
                            type="password" 
                            placeholder="New Password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="input-group">
                        <i className="fas fa-lock icon"></i>
                        <input 
                            type="password" 
                            placeholder="Confirm Password" 
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" style={{marginTop: '10px'}}>Change Password</button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;