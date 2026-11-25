import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("website", "0005_dataset_publication")]  # noqa: RUF012

    operations = [  # noqa: RUF012
        migrations.CreateModel(
            name="ResidentCommand",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("owner_session_digest64", models.CharField(max_length=64)),
                ("operation", models.CharField(choices=[
                    ("create_request", "Create request"),
                    ("read_request", "Read request"),
                    ("comment", "Comment"),
                    ("reopen", "Reopen"),
                    ("upload_attachment", "Upload attachment"),
                ], max_length=32)),
                ("encrypted_payload", models.TextField()),
                ("payload_sha256", models.CharField(max_length=64)),
                ("state", models.CharField(choices=[
                    ("queued", "Queued"),
                    ("claimed", "Claimed"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                ], default="queued", max_length=9)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("lease_id", models.UUIDField(blank=True, null=True)),
                ("lease_until", models.DateTimeField(blank=True, null=True)),
                ("encrypted_result", models.TextField(blank=True, default="")),
            ],
            options={
                "ordering": ("created_at", "id"),
                "indexes": [
                    models.Index(fields=("owner_session_digest64", "state", "created_at"),
                                 name="resident_owner_state_idx"),
                ],
            },
        ),
    ]
