"""Read explicitly selected public meeting material without local network access."""

from __future__ import annotations

import http.client
import ipaddress
import re
import socket
from time import monotonic, sleep
from typing import BinaryIO
from urllib.parse import urljoin, urlsplit

from townlight_runtime.meeting_imports import ImportInputError, read_json


def _public_addresses(host: str, port: int) -> tuple[str, ...]:
    answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = tuple(dict.fromkeys(answer[4][0] for answer in answers))
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise ImportInputError("Meeting import URLs must resolve to public addresses.")
    if not addresses:
        raise ImportInputError("The public meeting host did not resolve.")
    return addresses


def fetch_public(
    url: str, *, byte_limit: int, destination: BinaryIO | None = None, deadline_seconds: int = 45,
) -> tuple[str, bytes, str]:
    """Use validated DNS addresses for the actual socket and check every redirect."""
    deadline = monotonic() + deadline_seconds
    for _ in range(5):
        try:
            parsed = urlsplit(url)
            if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username is not None:
                raise ImportInputError("Enter a public HTTP or HTTPS meeting URL.")
            port = 443 if parsed.scheme == "https" else 80
            if parsed.port not in {None, port} or parsed.fragment:
                raise ImportInputError("Use a public meeting URL without a custom port or fragment.")
            addresses = _public_addresses(parsed.hostname, port)
            connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
            connection = connection_type(parsed.hostname, port, timeout=8)

            def connect_to_public_address(_address, timeout, source_address):
                last_error = None
                for address in addresses[:3]:
                    remaining = deadline - monotonic()
                    if remaining <= 0:
                        raise TimeoutError("Public meeting response timed out")
                    try:
                        return socket.create_connection((address, port), min(timeout, remaining), source_address)
                    except OSError as error:
                        last_error = error
                raise last_error or OSError("No public meeting address")

            connection._create_connection = connect_to_public_address
            target = parsed.path or "/"
            if parsed.query:
                target += "?" + parsed.query
            try:
                connection.request("GET", target, headers={"User-Agent": "Townlight meeting importer/1"})
                with connection.getresponse() as response:
                    if response.status in {301, 302, 303, 307, 308} and response.getheader("Location"):
                        url = urljoin(url, response.getheader("Location"))
                        continue
                    if response.status != 200:
                        raise ImportInputError(f"The public meeting host returned HTTP {response.status}.")
                    content = bytearray()
                    size = 0
                    while size <= byte_limit:
                        if monotonic() >= deadline:
                            raise TimeoutError("Public meeting response timed out")
                        chunk = response.read1(min(65536, byte_limit + 1 - size))
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > byte_limit:
                            raise ImportInputError("The public response is too large. Select a smaller input.")
                        if destination is None:
                            content.extend(chunk)
                        else:
                            destination.write(chunk)
                    media_type = response.getheader("Content-Type", "").partition(";")[0].strip().lower()
                    return url, bytes(content), media_type
            finally:
                connection.close()
        except ImportInputError:
            raise
        except (OSError, ValueError, http.client.HTTPException, UnicodeError) as error:
            raise ImportInputError("Could not read the public meeting URL. Save the source response and try again.") from error
    raise ImportInputError("The public meeting URL redirected too many times.")


def fetch_meeting_document(url: str, *, byte_limit: int) -> tuple[str, bytes, str]:
    """Resolve gWorks' public, short-lived download without saving its signed URL."""
    source = urlsplit(url)
    if (source.hostname == "api.gworks.cloud" and
            re.fullmatch(r"/cms/public/city/\d+/(?:agenda|minutes)/pdf/\d+/", source.path)):
        for delay in (0, 1, 2):
            if delay:
                sleep(delay)
            _, content, _ = fetch_public(url, byte_limit=64 * 1024)
            response = read_json(content)
            if isinstance(response, dict) and response.get("status") == "ready":
                signed_url = response.get("signedUrl")
                if isinstance(signed_url, str):
                    return fetch_public(signed_url, byte_limit=byte_limit)
                break
            if not isinstance(response, dict) or response.get("status") != "wait":
                break
        raise ImportInputError("gWorks has not made this PDF available. Retry from the saved import.")
    return fetch_public(url, byte_limit=byte_limit)
