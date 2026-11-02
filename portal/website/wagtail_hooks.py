# SPDX-License-Identifier: AGPL-3.0-only
from django import forms
from django.contrib.admin.views.decorators import staff_member_required
from django.core.exceptions import PermissionDenied
from django.shortcuts import render
from django.urls import path, reverse
from wagtail import hooks
from wagtail.admin.menu import MenuItem
from .townlight import sync, publication_choices


class LookupForm(forms.Form):
    request_id = forms.UUIDField(label='Records request ID')

class PublicationForm(forms.Form):
    action = forms.ChoiceField(choices=[('publish', 'Publish or update'), ('withdraw', 'Withdraw')])
    archive_id = forms.UUIDField()
    meeting_id = forms.UUIDField()
    recording_id = forms.UUIDField()
    request_id = forms.UUIDField()
    release_copy_id = forms.UUIDField()
    expected_release_sha256 = forms.RegexField(r'^[0-9a-f]{64}$', max_length=64)
    approve_publication = forms.BooleanField(label='I explicitly approve this public action')

@staff_member_required
def publication(request):
    if not request.user.is_superuser:
        raise PermissionDenied
    message = ''
    choices = []
    initial = {}
    lookup = LookupForm(request.GET or None)
    if request.method == 'GET' and lookup.is_valid():
        try:
            choices = publication_choices(lookup.cleaned_data['request_id'])
            selected = request.GET.get('release_copy_id')
            for choice in choices:
                if (choice['selection']['release_copy_id'] == selected
                        and choice['selection']['archive_id'] == request.GET.get('archive_id')):
                    initial = dict(choice['selection'], approve_publication=False)
                    break
            if not choices:
                message = 'No eligible approved release was found for this request.'
        except Exception:
            message = 'Release lookup failed. Check the active native session and source readiness.'
    form = PublicationForm(request.POST or None, initial=initial)
    if request.method == 'POST' and form.is_valid():
        data = {key: str(value) if key.endswith('_id') else value for key, value in form.cleaned_data.items()}
        try:
            sync(data)
            message = 'Publication action completed.'
        except Exception:
            message = 'Publication failed. The existing publication remains unchanged.'
    return render(request, 'website/publication_admin.html', {'form': form, 'message': message, 'lookup': lookup, 'choices': choices})

@hooks.register('register_admin_urls')
def admin_urls():
    return [path('townlight-publication/', publication, name='townlight-publication')]

@hooks.register('register_admin_menu_item')
def admin_menu():
    return MenuItem('Townlight publication', reverse('townlight-publication'), icon_name='upload', order=9000)
