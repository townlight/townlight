import pydantic
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from townlight_runtime.email_settings import EmailSettingsError
from townlight_runtime.service_requests import AdminActor

router = APIRouter(prefix="/desktop/v1/service-requests")


class EmailSettingsPayload(pydantic.BaseModel):
    model_config = pydantic.ConfigDict(extra="forbid")

    enabled: pydantic.StrictBool
    host: str = pydantic.Field(min_length=1, max_length=255)
    port: int = pydantic.Field(ge=1, le=65535)
    sender: str = pydantic.Field(min_length=1, max_length=254)
    username: str = ""
    password: str | None = pydantic.Field(default=None, max_length=2048)
    clear_password: bool = False


@router.get("/email-settings")
async def get_email_settings(request: Request, actor: AdminActor):
    try:
        store = request.app.state.desktop_notification_email
        return await run_in_threadpool(store.public_settings)
    except (EmailSettingsError, AttributeError):
        raise HTTPException(status_code=503, detail="Email settings unavailable")


@router.post("/email-settings")
async def save_email_settings(
    request: Request,
    actor: AdminActor,
    payload: EmailSettingsPayload,
):
    try:
        store = request.app.state.desktop_notification_email
        return await run_in_threadpool(
            store.save,
            payload.model_dump(exclude_unset=True),
        )
    except (EmailSettingsError, AttributeError):
        raise HTTPException(status_code=503, detail="Email settings unavailable")