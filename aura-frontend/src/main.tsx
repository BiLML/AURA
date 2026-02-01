import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// 1. Import thư viện Google OAuth
import { GoogleOAuthProvider } from '@react-oauth/google';

// 2. Dán mã Client ID bạn vừa lấy được từ Google Cloud vào đây
// Ví dụ: "123456789-abcdef.apps.googleusercontent.com"
// Dùng đúng ID từ Google Cloud Console của bạn
const CLIENT_ID = "117647364092-9a25olu0rsmc5betuu4k95hijctgo37g.apps.googleusercontent.com";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 3. Bọc toàn bộ App bên trong GoogleOAuthProvider */}
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)