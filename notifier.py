"""Push notifications: ntfy.sh (default) and Discord webhooks (optional)."""
from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod

import requests

from http_utils import make_session
from models import Alert

log = logging.getLogger(__name__)


class Notifier(ABC):
    name = ""

    @abstractmethod
    def send(self, alert: Alert) -> None:
        """Deliver the alert. Raise on failure."""


class NtfyNotifier(Notifier):
    """https://ntfy.sh — free push notifications, no account needed."""
    name = "ntfy"

    def __init__(self, topic: str, server: str = "https://ntfy.sh", priority: int = 5,
                 token: str | None = None, session: requests.Session | None = None):
        if not topic:
            raise ValueError("NTFY_TOPIC is not set")
        self.topic = topic
        self.server = server.rstrip("/")
        self.priority = int(priority)
        self.token = token
        self.session = session or make_session(retries=3)

    def send(self, alert: Alert) -> None:
        # JSON publishing avoids header-encoding problems with names like "Sony™".
        payload = {
            "topic": self.topic,
            "title": alert.title[:250],
            "message": alert.body(),
            "priority": self.priority,
            "tags": ["rotating_light", "moneybag"],
            "click": alert.record.url,
            "actions": [{"action": "view", "label": "Open product", "url": alert.record.url}],
        }
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        resp = self.session.post(self.server, json=payload, headers=headers, timeout=15)
        resp.raise_for_status()


class DiscordNotifier(Notifier):
    name = "discord"

    def __init__(self, webhook_url: str, session: requests.Session | None = None):
        if not webhook_url:
            raise ValueError("DISCORD_WEBHOOK_URL is not set")
        self.webhook_url = webhook_url
        self.session = session or make_session(retries=3)

    def send(self, alert: Alert) -> None:
        r = alert.record
        fields = []
        if alert.baseline is not None:
            fields.append({"name": "Was", "value": f"${alert.baseline:,.2f}", "inline": True})
        fields.append({"name": "Now", "value": f"${r.price:,.2f}", "inline": True})
        if alert.drop_percent is not None:
            fields.append({"name": "Drop", "value": f"{alert.drop_percent:.1f}%", "inline": True})
        fields.append({"name": "Why", "value": "; ".join(alert.reasons)[:1000], "inline": False})
        payload = {
            "username": "Price Glitch Bot",
            "embeds": [{
                "title": alert.title[:256],
                "url": r.url,
                "color": 0xE53935,
                "fields": fields,
                "footer": {"text": f"{r.source} • {r.product_id}"},
            }],
        }
        resp = self.session.post(self.webhook_url, json=payload, timeout=15)
        resp.raise_for_status()


def build_notifiers(settings) -> list[Notifier]:
    notifiers: list[Notifier] = []

    ntfy = settings.notification_options("ntfy")
    if ntfy.get("enabled", True):
        topic = os.getenv("NTFY_TOPIC", "").strip()
        if topic:
            notifiers.append(NtfyNotifier(
                topic=topic,
                server=ntfy.get("server", "https://ntfy.sh"),
                priority=ntfy.get("priority", 5),
                token=os.getenv("NTFY_TOKEN") or None,
            ))
        else:
            log.warning("ntfy is enabled but NTFY_TOPIC is empty in .env — skipping ntfy")

    discord = settings.notification_options("discord")
    if discord.get("enabled", False):
        url = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
        if url:
            notifiers.append(DiscordNotifier(url))
        else:
            log.warning("Discord is enabled but DISCORD_WEBHOOK_URL is empty — skipping Discord")

    return notifiers


def send_all(notifiers: list[Notifier], alert: Alert) -> int:
    """Send to every notifier; one failing doesn't stop the others. Returns # succeeded."""
    ok = 0
    for n in notifiers:
        try:
            n.send(alert)
            ok += 1
            log.info("Sent alert via %s: %s", n.name, alert.title)
        except Exception as e:  # noqa: BLE001 — keep going for other channels
            log.error("Failed to send alert via %s: %s", n.name, e)
    return ok
