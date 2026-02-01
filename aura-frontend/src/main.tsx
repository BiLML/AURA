import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// 1. Import thư viện Google OAuth
import { GoogleOAuthProvider } from '@react-oauth/google';

// 2. PHẢI dùng CÙNG Client ID với backend (.env GOOGLE_CLIENT_ID)
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "786264685176-gov7th6qah7cmfo1tv1aokctv31lam5h.apps.googleusercontent.com"; 

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 3. Bọc toàn bộ App bên trong GoogleOAuthProvider */}
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)