import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.auth.router import router as auth_router
from app.scans.router import router as scans_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.screenshot_base_path, exist_ok=True)

    from app.nuclei.updater import nuclei_update_loop
    asyncio.create_task(nuclei_update_loop())

    yield


app = FastAPI(title="Exoscan API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(scans_router, prefix="/api/v1")

app.mount(
    "/static/screenshots",
    StaticFiles(directory=settings.screenshot_base_path),
    name="screenshots",
)
