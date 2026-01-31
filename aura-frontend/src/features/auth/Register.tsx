import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/App.css';

const Register = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    confirm_password: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirm_password) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }

    try {
      const API_URL = `${import.meta.env.VITE_API_URL}/api/v1/auth/register`; 
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          full_name: formData.full_name,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        let msg = "Đăng ký thất bại";
        if (data.detail) {
            msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        }
        setError(msg);
      } else {
        alert("Đăng ký thành công! Hãy đăng nhập ngay.");
        navigate('/login');
      }
    } catch (err) {
      console.error(err);
      setError("Không thể kết nối đến Server!");
    }
  };

  return (
    // --- SỬA QUAN TRỌNG: THÊM WRAPPER CONTAINER ---
    <div className="login-container">
        
        {/* Thêm style height: auto để khung tự giãn theo nội dung form dài */}
        <div className="login-box" style={{height: 'auto', padding: '40px 50px'}}> 
        
          <div className="form-title">
            <h3>Create Account</h3>
          </div>
          
          <form onSubmit={handleRegister}>
            {error && <p style={{color: '#ff6b6b', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9em', marginBottom: '15px'}}>{error}</p>}

            {/* 1. USERNAME */}
            <div className="input-group">
              <i className="fas fa-user icon"></i>
              <input 
                type="text"
                name="username"
                placeholder="Username" 
                required 
                onChange={handleChange}
                value={formData.username}
              />
            </div>

            {/* 2. EMAIL */}
            <div className="input-group">
              <i className="fas fa-envelope icon"></i>
              <input 
                type="email"
                name="email"
                placeholder="Email Address" 
                required 
                onChange={handleChange}
                value={formData.email}
              />
            </div>

            {/* 3. FULL NAME */}
            <div className="input-group">
              <i className="fas fa-id-card icon"></i>
              <input 
                type="text"
                name="full_name"
                placeholder="Full Name" 
                required 
                onChange={handleChange}
                value={formData.full_name}
              />
            </div>

            {/* 4. PASSWORD */}
            <div className="input-group">
              <i className="fas fa-lock icon"></i>
              <input 
                type="password" 
                name="password" 
                placeholder="Password" 
                required 
                onChange={handleChange}
                value={formData.password}
              />
            </div>

            {/* 5. CONFIRM PASSWORD */}
            <div className="input-group">
              <i className="fas fa-check-circle icon"></i>
              <input 
                type="password" 
                name="confirm_password" 
                placeholder="Confirm Password" 
                required 
                onChange={handleChange}
                value={formData.confirm_password}
              />
            </div>
            
            <button type="submit" style={{marginTop: '20px'}}>Register Now</button>

            <div className="register-section" style={{marginTop: '20px'}}>
                <p style={{display: 'inline', color: 'rgba(255,255,255,0.8)'}}>Already have an account?</p>
                <span 
                    style={{cursor: 'pointer', marginLeft: '5px', fontWeight: 'bold', color: '#fff'}} 
                    onClick={() => navigate('/login')} 
                    className="register-link hover-underline"
                >
                    Login here
                </span>
            </div>
          </form>
        </div>
    </div>
  );
};

export default Register;