from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TemplateBase(BaseModel):
    subject: str
    content: str

class TemplateUpdate(TemplateBase):
    pass

class TemplateResponse(TemplateBase):
    code: str
    name: str
    available_variables: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True