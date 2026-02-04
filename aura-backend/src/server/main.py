from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os


# Import các router
from api import auth, users, medical_records, clinic, billing, admin, chat, doctor
from api import billing_webhook # Import file vừa tạo
from api import public

app = FastAPI(title="Aura AI Backend")

origins = [
    "http://localhost:5173",       # Localhost
    "http://127.0.0.1:5173",       # Localhost IP
    "https://aurahealth.name.vn",      # <--- QUAN TRỌNG: Domain chính (HTTPS)
    "https://www.aurahealth.name.vn",  # <--- Domain có www (HTTPS)
    "http://103.200.23.81",        # IP gốc (Dự phòng)
    "*"                            # Cho phép tất cả (Chỉ dùng khi test, nên hạn chế khi chạy thật)
]

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount thư mục uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/static", StaticFiles(directory="uploads"), name="static")

# --- ĐĂNG KÝ ROUTER ---

# 1. Auth & Users
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(public.router, prefix="/api/v1/public", tags=["Public"])
# 2. Chức năng chính
app.include_router(medical_records.router, prefix="/api/v1/medical-records", tags=["Medical Records"])
app.include_router(clinic.router, prefix="/api/v1/clinics", tags=["Clinics"])
app.include_router(doctor.router, prefix="/api/v1/doctor", tags=["Doctor"])

# 3. Chức năng phụ trợ
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(chat.router, prefix="/api/v1/chats", tags=["Chat"]) # Gom chung Chat Actions và Chat List vào 1 tag

# 4. Admin (Sửa lại chỉ để 1 dòng này)
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin Management"]) 

app.include_router(billing_webhook.router, prefix="/api/v1/billing", tags=["Billing"])
@app.get("/")
def root():
    return {"message": "Welcome to Aura AI Backend API"}
