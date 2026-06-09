#!/usr/bin/env python3
"""
diag-litellm.py — RMOOZ Offline LiteLLM connectivity diagnostic.

Runs INSIDE the rmooz-offline container and pinpoints exactly which layer fails
when generation cannot reach LiteLLM. It mirrors the real generation env: it maps
the operator RMOOZ_AI_* vars onto the LLM_* vars the WarGamingGEN client reads,
then walks the connection one layer at a time:

  1. config      — print resolved provider/base host/model/timeout/CA (NO secrets)
  2. DNS         — socket.getaddrinfo(host)
  3. TCP         — socket.create_connection((host, 443))
  4. TLS         — ssl handshake using the configured CA (+ client cert for mTLS)
  5. OpenAI/A    — a tiny raw OpenAI chat.completions call (max_tokens=1)
  6. WGEN/B      — the SAME call through the real WarGamingGEN LLMClient

It NEVER prints the API key, the private-key contents, or the password.

Usage (on the offline server):
  docker exec rmooz-offline /opt/rmooz-venv/bin/python /app/server/diag-litellm.py
"""
from __future__ import annotations
import os
import socket
import ssl
import sys
import traceback
from urllib.parse import urlparse


def line(msg=""):
    print(msg, flush=True)


def step(n, title):
    line()
    line(f"── [{n}] {title} ".ljust(72, "─"))


# ── Map RMOOZ_AI_* → LLM_* exactly like wargame-sim-bridge.buildLlmChildEnv ──
def map_env():
    base = (os.environ.get("RMOOZ_AI_BASE_URL") or "").strip()
    key = (os.environ.get("RMOOZ_AI_API_KEY") or "").strip()
    model = (os.environ.get("RMOOZ_AI_MODEL") or "").strip()
    if base:
        os.environ.setdefault("LLM_BASE_URL", base)
    if key:
        os.environ.setdefault("LLM_API_KEY", key)
        os.environ.setdefault("OPENAI_API_KEY", key)
    if model:
        os.environ.setdefault("LLM_MODEL", model)
    os.environ.setdefault("LLM_USE_RESPONSES_API", "0")
    return base, model, key


def redact_exc(e):
    """Return type+message of an exception with any bearer/key token scrubbed."""
    import re
    txt = f"{type(e).__name__}: {e}"
    # chain the underlying cause (httpx/socket errno) — the real signal
    cause = getattr(e, "__cause__", None)
    if cause is not None:
        txt += f"  | cause: {type(cause).__name__}: {cause}"
    txt = re.sub(r"(Bearer\s+)\S+", r"\1<redacted>", txt, flags=re.I)
    txt = re.sub(r"(sk-)[A-Za-z0-9._-]{8,}", r"\1<redacted>", txt)
    return txt


def main():
    base, model, key = map_env()
    provider = (os.environ.get("RMOOZ_AI_PROVIDER") or "ollama").strip()
    timeout_ms = (os.environ.get("RMOOZ_AI_TIMEOUT_MS") or "300000").strip()
    ca = (os.environ.get("RMOOZ_AI_CA_CERT_PATH")
          or os.environ.get("SSL_CERT_FILE")
          or os.environ.get("REQUESTS_CA_BUNDLE") or "").strip()
    client_cert = (os.environ.get("RMOOZ_AI_CLIENT_CERT_PATH")
                   or os.environ.get("LLM_CLIENT_CERT_PATH") or "").strip()
    client_key = (os.environ.get("RMOOZ_AI_CLIENT_KEY_PATH")
                  or os.environ.get("LLM_CLIENT_KEY_PATH") or "").strip()

    parsed = urlparse(base) if base else None
    host = parsed.hostname if parsed else None
    port = parsed.port or (443 if (parsed and parsed.scheme == "https") else 80) if parsed else None

    # [1] config (secrets shown only as booleans / existence) ──────────────────
    step(1, "Resolved configuration (no secrets)")
    line(f"  provider          : {provider}")
    line(f"  base url host     : {parsed.scheme + '://' + parsed.netloc if parsed else '(none)'}")
    line(f"  model             : {model or '(unset)'}")
    line(f"  timeout_ms        : {timeout_ms}")
    line(f"  api key set       : {bool(key)}")
    line(f"  CA path           : {ca or '(none)'}")
    line(f"  CA file exists    : {bool(ca) and os.path.exists(ca)}")
    line(f"  mTLS cert set     : {bool(client_cert)}  exists: {bool(client_cert) and os.path.exists(client_cert)}")
    line(f"  mTLS key set      : {bool(client_key)}  exists: {bool(client_key) and os.path.exists(client_key)}")
    if not base:
        line("  RESULT: RMOOZ_AI_BASE_URL is empty — set it to https://litellm.tawasol.mil.ae/v1")
        return 2
    if ca and not os.path.exists(ca):
        line(f"  WARNING: CA path is set but the file is MISSING at {ca}")
        line("           (check the ./certs:/app/certs:ro mount and the filename, incl. the '._' prefix)")

    overall_ok = True

    # [2] DNS ───────────────────────────────────────────────────────────────────
    step(2, f"DNS resolution of {host}")
    ips = []
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        ips = sorted({i[4][0] for i in infos})
        line(f"  OK — resolved to: {', '.join(ips)}")
    except Exception as e:
        overall_ok = False
        line(f"  FAIL — {redact_exc(e)}")
        line("  → DNS failure inside the container. The host resolves it but the container does not.")
        line("    FIX: use the host-networking compose (docker-compose.hostnet.offline.yml),")
        line("         or add the LiteLLM IP via extra_hosts, or point the container at the right DNS.")
        return 3

    # [3] TCP ────────────────────────────────────────────────────────────────────
    step(3, f"TCP connect to {host}:{port}")
    try:
        s = socket.create_connection((host, port), timeout=10)
        s.close()
        line("  OK — TCP connection established.")
    except Exception as e:
        overall_ok = False
        line(f"  FAIL — {redact_exc(e)}")
        line("  → DNS works but TCP cannot reach the endpoint (routing/firewall/VPN).")
        line("    FIX: use the host-networking compose so the container shares the host route/VPN.")
        return 4

    # [4] TLS ────────────────────────────────────────────────────────────────────
    step(4, "TLS handshake using the configured CA")
    try:
        if ca and os.path.exists(ca):
            ctx = ssl.create_default_context(cafile=ca)
        else:
            ctx = ssl.create_default_context()
        if client_cert and client_key and os.path.exists(client_cert) and os.path.exists(client_key):
            pw = os.environ.get("RMOOZ_AI_CLIENT_CERT_PASSWORD") or None
            ctx.load_cert_chain(certfile=client_cert, keyfile=client_key, password=pw)
            line("  (presenting client certificate — mTLS)")
        with socket.create_connection((host, port), timeout=10) as raw:
            with ctx.wrap_socket(raw, server_hostname=host) as tls:
                cert = tls.getpeercert()
                subj = dict(x[0] for x in cert.get("subject", [])) if cert else {}
                line(f"  OK — TLS established. peer CN: {subj.get('commonName', '(n/a)')}  proto: {tls.version()}")
    except ssl.SSLCertVerificationError as e:
        overall_ok = False
        line(f"  FAIL (verify) — {redact_exc(e)}")
        line("  → The CA does not trust the server cert. Check RMOOZ_AI_CA_CERT_PATH content/chain.")
        return 5
    except ssl.SSLError as e:
        overall_ok = False
        line(f"  FAIL (ssl) — {redact_exc(e)}")
        line("  → TLS handshake failed. If the server requires mTLS, set RMOOZ_AI_CLIENT_CERT_PATH/KEY_PATH.")
        return 5
    except Exception as e:
        overall_ok = False
        line(f"  FAIL — {redact_exc(e)}")
        return 5

    # [5] raw OpenAI call (Test A) ────────────────────────────────────────────────
    step(5, f"OpenAI chat.completions (Test A — raw, model={model})")
    try:
        from openai import OpenAI
        try:
            import httpx
            http_client = httpx.Client(verify=(ca if (ca and os.path.exists(ca)) else True),
                                       timeout=float(timeout_ms) / 1000.0)
            client = OpenAI(base_url=base, api_key=key or "x", http_client=http_client)
        except Exception:
            client = OpenAI(base_url=base, api_key=key or "x", timeout=float(timeout_ms) / 1000.0)
        r = client.chat.completions.create(
            model=model, max_tokens=1,
            messages=[{"role": "user", "content": "ping"}],
        )
        line(f"  OK — model replied. id={getattr(r, 'id', '(n/a)')}")
    except Exception as e:
        overall_ok = False
        line(f"  FAIL — {redact_exc(e)}")
        line("  → Connection layers passed but the API call failed (auth/model/path). See message above.")

    # [6] WarGamingGEN LLMClient (Test B) ─────────────────────────────────────────
    step(6, "WarGamingGEN LLMClient (Test B — real generation path)")
    try:
        sys.path.insert(0, "/app/TestingAI/WarGamingGEN")
        from src.llm.client import LLMClient
        c = LLMClient()
        line(f"  client model={c.cfg.model}  base={c.cfg.base_url}  timeout={c.cfg.timeout_seconds}s")
        out = c.call_text(system="Reply with one word.", user="Reply with READY.",
                          max_output_tokens=8, tag="diag")
        line(f"  OK — reply: {str(out)[:60]!r}")
    except Exception as e:
        overall_ok = False
        line(f"  FAIL — {redact_exc(e)}")
        line("  → If Test A passed but B failed, the WarGamingGEN client/config wiring is the problem.")

    step("=", "SUMMARY")
    line(f"  {'ALL LAYERS OK — RMOOZ can reach LiteLLM with this model.' if overall_ok else 'A layer FAILED — see the first FAIL above; that is the root cause.'}")
    return 0 if overall_ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        sys.exit(1)
