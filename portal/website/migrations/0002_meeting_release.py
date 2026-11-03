from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('website', '0001_initial')]
    operations = [
        migrations.AddField(model_name='meeting', name='release_path', field=models.CharField(blank=True, editable=False, max_length=80)),
        migrations.AddField(model_name='meeting', name='release_media_type', field=models.CharField(blank=True, max_length=80)),
    ]
