from django.db import migrations, models
import uuid

class Migration(migrations.Migration):
    dependencies = [("website", "0004_publisher_projection")]
    operations = [
        migrations.CreateModel(
            name="DatasetPublication",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=400)),
                ("sequence", models.PositiveBigIntegerField(default=0)),
                ("digest", models.CharField(max_length=64)),
                ("artifact_sha256", models.CharField(blank=True, max_length=64)),
            ],
            options={"ordering": ("title", "id")},
        ),
    ]
