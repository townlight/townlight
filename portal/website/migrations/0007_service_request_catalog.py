from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("website", "0006_resident_command")]  # noqa: RUF012

    operations = [  # noqa: RUF012
        migrations.CreateModel(
            name="ServiceRequestCatalog",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=311, editable=False, primary_key=True, serialize=False)),
                ("categories", models.JSONField(default=list)),
                ("digest", models.CharField(max_length=64)),
                ("updated_at", models.DateTimeField()),
            ],
            options={
                "verbose_name": "service request catalog",
                "verbose_name_plural": "service request catalog",
            },
        ),
    ]
