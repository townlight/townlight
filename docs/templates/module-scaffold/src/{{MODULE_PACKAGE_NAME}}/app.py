from fastapi import FastAPI

from . import __version__


app = FastAPI(title='{{MODULE_DISPLAY_NAME}}')


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "{{MODULE_PACKAGE_NAME}}",
        "version": __version__,
    }

