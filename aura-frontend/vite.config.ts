import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 1. Cho phép Docker map port ra ngoài
    host: true, 
    
    // 2. Cố định port 5173
    port: 5173, 
    
    // 3. Không tự đổi port
    strictPort: true,

    // 👇 THÊM DÒNG NÀY ĐỂ SỬA LỖI BLOCKED REQUEST 👇
    allowedHosts: ['aurahealth.name.vn'],
    
    // 4. Hot Reload trên Docker
    watch: {
      usePolling: true,
    },
  },
})