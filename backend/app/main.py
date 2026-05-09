from fastapi import FastAPI

from app.api.chat_records import router as chat_records_router
from app.api.chat import router as chat_router
from app.api.feedback import admin_router as feedback_admin_router
from app.api.feedback import router as feedback_router
from app.api.knowledge import router as knowledge_router


app = FastAPI(title="AI Digital Human Scenic Guide")
app.include_router(chat_records_router)
app.include_router(chat_router)
app.include_router(feedback_router)
app.include_router(feedback_admin_router)
app.include_router(knowledge_router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-digital-human-guide",
    }
