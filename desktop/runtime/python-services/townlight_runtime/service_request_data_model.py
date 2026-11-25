from datetime import datetime
from typing import ClassVar
from uuid import UUID

from sqlalchemy import DateTime, LargeBinary, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from townlight_runtime.data_staff import _Base


class ServiceRequestPublicationRevision(_Base):
    __tablename__ = "service_request_publication_revisions"
    __table_args__: ClassVar[dict[str, str]] = {"schema": "townlight_data"}

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    saved_by: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=False,
    )
    approved_by: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sha256: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )
    inner_zip: Mapped[bytes] = mapped_column(
        LargeBinary,
        nullable=False,
    )