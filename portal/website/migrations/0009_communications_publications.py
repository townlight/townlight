import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("website", "0008_resident_recovery_download_operations"),
    ]

    operations = [
        migrations.CreateModel(
            name="ArticlePublication",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=512)),
                ("language", models.CharField(max_length=16)),
                ("sequence", models.PositiveBigIntegerField()),
                ("digest", models.CharField(max_length=64)),
                ("artifact_sha256", models.CharField(blank=True, max_length=64)),
                ("withdrawn", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="ArticlePublicationRevision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sequence", models.PositiveBigIntegerField()),
                ("digest", models.CharField(max_length=64)),
                ("artifact_sha256", models.CharField(blank=True, max_length=64)),
                ("action", models.CharField(max_length=16)),
                ("title", models.CharField(max_length=512)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("article", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="publication_history", to="website.articlepublication")),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        fields=("article", "sequence"),
                        name="unique_article_publication_revision",
                    ),
                ],
            },
        ),
    ]
