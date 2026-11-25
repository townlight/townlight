from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("website", "0009_communications_publications"),
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
                ],
                max_length=32,
            ),
        ),
    ]
