from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("website", "0003_public_website_design")]

    operations = [
        migrations.AddField(
            model_name="meeting",
            name="packet_path",
            field=models.CharField(blank=True, editable=False, max_length=80),
        ),
        migrations.CreateModel(
            name="PublicationCursor",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("meeting_id", models.UUIDField()),
                ("kind", models.CharField(max_length=9)),
                ("sequence", models.PositiveBigIntegerField()),
                ("digest", models.CharField(max_length=64)),
            ],
            options={"constraints": [models.UniqueConstraint(
                fields=("meeting_id", "kind"), name="unique_publication_stream")]},
        ),
    ]
