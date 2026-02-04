import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import FacebookLogin from '@greatsumini/react-facebook-login';
import '../../styles/App.css';

const Login = () => {
    const [userName, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    
    const navigate = useNavigate();

    // --- XỬ LÝ SAU KHI ĐĂNG NHẬP THÀNH CÔNG ---
    const handleLoginSuccess = (data: any) => {
        localStorage.setItem('token', data.access_token);
        
        const userInfoToSave = data.user_info || { username: userName, role: data.role };

        if (rememberMe) {
            localStorage.setItem('user_info', JSON.stringify(userInfoToSave));
        } else {
            sessionStorage.setItem('user_info', JSON.stringify(userInfoToSave));
        }

        if (data.is_new_user) {
            navigate('/set-username', { replace: true });
            return;
        }

        const standardizedRole = data.role ? data.role.toLowerCase() : '';
        if (standardizedRole === 'admin') navigate('/admin', { replace: true });
        else if (standardizedRole === 'doctor') navigate('/dashboarddr', { replace: true });
        else if (standardizedRole === 'clinic') navigate('/clinic-dashboard', { replace: true });
        else navigate('/dashboard', { replace: true });
    };

    // --- GOOGLE ---
    const loginWithGoogle = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            try {
                const response = await fetch('https://aurahealth.name.vn/api/v1/auth/google-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenResponse.access_token }),
                });
                const data = await response.json();
                if (!response.ok) setError(data.detail || 'Đăng nhập Google thất bại');
                else handleLoginSuccess(data);
            } catch (err) {
                setError('Lỗi kết nối Server (Google Login)');
            }
        },
        onError: () => setError('Đăng nhập Google thất bại'),
    });

    // --- FACEBOOK (Đã sửa lỗi logic lấy Token) ---
    const handleFacebookResponse = async (response: any) => {
        // 1. In ra để kiểm tra (Debug)
        console.log("Facebook Response Raw:", response);

        // 2. Lấy Token an toàn (Chấp nhận cả 2 cấu trúc phẳng hoặc lồng nhau)
        const token = response.accessToken || response.authResponse?.accessToken;
        const uid = response.userID || response.authResponse?.userID;

        // 3. Nếu không tìm thấy token thì dừng ngay, không gọi API để tránh lỗi 400
        if (!token || !uid) {
            console.error("Lỗi: Không tìm thấy AccessToken trong response Facebook");
            setError("Không lấy được dữ liệu từ Facebook. Vui lòng thử lại.");
            return;
        }

        try {
            const res = await fetch('https://aurahealth.name.vn/api/v1/auth/facebook-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken: token, // Dùng biến đã xử lý an toàn
                    userID: uid
                })
            });
            const data = await res.json();
            
            if (res.ok) {
                handleLoginSuccess(data);
            } else {
                // Hiển thị lỗi chi tiết từ Server nếu có
                console.error("Server Error:", data);
                setError(data.detail || "Đăng nhập Facebook thất bại");
            }
        } catch (error) {
            console.error("Network Error:", error);
            setError('Lỗi kết nối Server (Facebook Login)');
        }
    };

    // --- LOGIN THƯỜNG ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const formData = new URLSearchParams();
            formData.append('username', userName);
            formData.append('password', password);

            const response = await fetch('https://aurahealth.name.vn/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(typeof data.detail === 'string' ? data.detail : 'Sai tài khoản hoặc mật khẩu');
                return;
            }
            // Gọi hàm xử lý thành công với dữ liệu trả về từ API Login thường
            // API thường trả về: access_token, role, v.v.
            handleLoginSuccess({ ...data, is_new_user: false }); 

        } catch (err) {
            setError('Không thể kết nối đến Server!');
        }
    };

    return (
        // QUAN TRỌNG: Thêm wrapper login-container ở đây
        <div className="login-container">
            <div className="login-box">
                <div className="form-title">
                    <h3>Login</h3>
                </div>
                
                <form onSubmit={handleLogin}>
                    {error && <p style={{color: '#ff6b6b', marginBottom: '15px', fontWeight: 'bold'}}>{error}</p>}

                    <div className="input-group">
                        <i className="fas fa-user icon"></i> 
                        <input 
                            type="text" 
                            placeholder="Email/Username" 
                            value={userName} 
                            onChange={(e) => setUserName(e.target.value)} 
                            required
                        />
                    </div>
                    <div className="input-group">
                        <i className="fas fa-lock icon"></i>
                        <input 
                            type="password" 
                            placeholder="Password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className="login-options"> 
                        <div className="remember-me" onClick={() => setRememberMe(!rememberMe)}>
                            <input 
                                type="checkbox" 
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                            />
                            <label style={{cursor: 'pointer', marginLeft: '5px'}}>Remember me</label>
                        </div>
                        <div className="forgot-password">
                            <span onClick={() => navigate('/forgot-password')} className='hover-underline' style={{cursor: 'pointer'}}>
                                Forgot Password?
                            </span>
                        </div>
                    </div>

                    <button type="submit">Login</button>
                    
                    <div className="divider">Or</div>
                    
                    <button type="button" className="social-button google-btn" onClick={() => loginWithGoogle()}>
                        <i className="fab fa-google" style={{color: '#DB4437'}}></i> Login with Google
                    </button>

                    {/* Nút Facebook đã được làm sạch style để đồng bộ */}
                    <FacebookLogin
                        appId="1383927066801418"
			scope="public_profile,email" 
   			fields="name,email,picture"
                        onSuccess={handleFacebookResponse}
                        onFail={(error) => console.log('Login Failed!', error)}
                        className="social-button facebook-btn-custom"
                        style={{
                            // Reset style mặc định của thư viện để dùng class CSS
                            backgroundColor: '#1877f2',
                            color: 'white',
                            border: 'none',
                            outline: 'none',
                            padding: '12px' 
                        }}
                    >
                        <i className="fab fa-facebook-f"></i> Login with Facebook
                    </FacebookLogin>

                    <div className="policy-note" style={{ marginTop: '20px', fontSize: '0.8em', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                        Bằng cách đăng nhập, bạn đồng ý với 
                        <span 
                            onClick={() => navigate('/privacy')} 
                            style={{ cursor: 'pointer', textDecoration: 'underline', marginLeft: '5px' }}
                        >
                            Chính sách và Điều khoản
                        </span> của chúng tôi.
                    </div>

                    <div className="register-section" style={{marginTop: '20px'}}>
                        <p style={{display: 'inline', color: 'rgba(255,255,255,0.8)'}}>Don't have an account?</p>
                        <span
                            className="register-link hover-underline"
                            style={{cursor: 'pointer', marginLeft: '5px', fontWeight: 'bold'}}
                            onClick={() => navigate('/register')}
                        >
                            Register
                        </span>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
