from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("website", "0010_communications_subscription_operations"),
    ]

    operations = [
        migrations.AlterField(
            model_name="residentcommand",
            name="operation",
            field=models.CharField(
                choices=[
                    ("create_request", "Create request"),
                    ("read_request", "Read request"),
                    ("comment", "Comment"),
                    ("reopen", "Reopen"),
                    ("upload_attachment", "Upload attachment"),
                    ("begin_recovery", "Begin recovery"),
                    ("complete_recovery", "Complete recovery"),
                    ("download_attachment", "Download attachment"),
                    ("comms_subscribe", "Subscribe to communications"),
                    ("comms_confirm", "Confirm communications subscription"),
                    ("comms_preferences", "Update communications preferences"),
                    ("parks_create_household", "Create parks household"),
                    ("parks_read_household", "Read parks household"),
                    ("parks_add_participant", "Add parks participant"),
                    ("parks_update_participant", "Update parks participant"),
                    ("parks_create_booking", "Create parks booking"),
                    ("parks_cancel_booking", "Cancel parks booking"),
                    ("parks_reschedule_booking", "Reschedule parks booking"),
                    ("parks_register", "Register for parks program"),
                    ("parks_cancel_registration", "Cancel parks registration"),
                    ("parks_availability", "Check parks availability"),
                    ("parks_prepare_checkout", "Prepare parks checkout"),
                    ("parks_read_checkout", "Read parks checkout"),
                ],
                max_length=32,
            ),
        ),
        migrations.CreateModel(
            name="ParksCatalog",
            fields=[
                (
                    "id",
                    models.PositiveSmallIntegerField(
                        default=1,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("catalog", models.JSONField(default=dict)),
                ("sha256", models.CharField(max_length=64)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "parks catalog",
                "verbose_name_plural": "parks catalog",
            },
        ),
    ]
