from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

# Import các router
from api import auth, users, medical_records, clinic, billing, admin, chat, doctor

app = FastAPI(title="Aura AI Backend")

origins = [
    "http://localhost:5173",    # Frontend của bạn
    "http://127.0.0.1:5173",    # Dự phòng
    "http://103.200.23.81",      # <-- QUAN TRỌNG: IP VPS của bạn
    "http://103.200.23.81:80",   # <-- Cổng web mặc định
    "*"
]

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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

# 2. Chức năng chính
app.include_router(medical_records.router, prefix="/api/v1/medical-records", tags=["Medical Records"])
app.include_router(clinic.router, prefix="/api/v1/clinics", tags=["Clinics"])
app.include_router(doctor.router, prefix="/api/v1/doctor", tags=["Doctor"])

# 3. Chức năng phụ trợ
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(chat.router, prefix="/api/v1/chats", tags=["Chat"]) # Gom chung Chat Actions và Chat List vào 1 tag

# 4. Admin (Sửa lại chỉ để 1 dòng này)
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin Management"]) 

@app.get("/")
def root():
    return {"message": "Welcome to Aura AI Backend API"}