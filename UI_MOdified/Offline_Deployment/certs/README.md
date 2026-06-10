# RMOOZ Offline Certificates — OFFLINE-LITELLM-CA-1 / OFFLINE-LITELLM-MTLS-1

The whole `certs/` directory is mounted read-only into the container at `/app/certs`.
Place the certificate files here **before running the container**.

```
certs/
  README.md            ← this file (the ONLY thing committed to git)
  ._mil_dir.crt       ← Public CA chain used to TRUST the LiteLLM server certificate
  rmooz-client.crt     ← OPTIONAL public client certificate for mutual TLS (mTLS)
  rmooz-client.key     ← OPTIONAL private client key for mTLS — DO NOT COMMIT
```

## When do I need each file?

- **Normal HTTPS + Bearer token:** only `._mil_dir.crt` is needed (server-cert trust).
- **LiteLLM requires mTLS:** also add `rmooz-client.crt` **and** `rmooz-client.key`
  (both are required together) and set the `RMOOZ_AI_CLIENT_*` env vars.

## `._mil_dir.crt` — server-certificate trust

The **public** Root CA or Intermediate CA certificate that signed the LiteLLM server's TLS
certificate (e.g. `your-litellm-host`).

> **Note:** `._mil_dir.crt` is only a placeholder filename — no site-specific CA name is
> committed to this repo. Name the file to match your own internal CA and point
> `RMOOZ_AI_CA_CERT_PATH` (and `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` / `NODE_EXTRA_CA_CERTS`)
> at that path in `.env.offline`.

- **Format:** PEM (plain text, starts with `-----BEGIN CERTIFICATE-----`)
- **Source:** your PKI/IT team, or exported from the Windows Certificate Store

## `rmooz-client.crt` / `rmooz-client.key` — OPTIONAL mTLS client cert

Only required if the LiteLLM endpoint demands a client certificate (mutual TLS).

- `rmooz-client.crt` — public client certificate (PEM).
- `rmooz-client.key` — **private key (PEM). NEVER commit this to git, and never
  include it in a shared bundle unless transferred through an approved secure
  channel.** If the key is passphrase-protected, set `RMOOZ_AI_CLIENT_CERT_PASSWORD`
  in `.env.offline` (the password is read server-side only — never logged, never
  returned by any API).

## What does NOT go here / must NEVER be committed

- Private keys (`*.key`)
- Real API keys or secrets
- Passwords
- Any real certificate files (only this README is committed; `*.crt`/`*.pem`/`*.key`
  are gitignored and the transfer bundle ships the README only)

## How it is used

`docker-compose.offline.yml` mounts the whole `certs/` directory at `/app/certs`.
Set these env vars in `.env.offline` so both Node.js and Python trust the CA:

```env
RMOOZ_AI_CA_CERT_PATH=/app/certs/._mil_dir.crt
SSL_CERT_FILE=/app/certs/._mil_dir.crt
REQUESTS_CA_BUNDLE=/app/certs/._mil_dir.crt
NODE_EXTRA_CA_CERTS=/app/certs/._mil_dir.crt
```

For mTLS, also set (only if the server requires a client cert):

```env
RMOOZ_AI_CLIENT_CERT_PATH=/app/certs/rmooz-client.crt
RMOOZ_AI_CLIENT_KEY_PATH=/app/certs/rmooz-client.key
# RMOOZ_AI_CLIENT_CERT_PASSWORD=   (only if the key is encrypted)
```

## Verify after container restart

```
curl http://<server-ip>:8640/api/ai/generation-health
```

Expected (CA trust only):
```json
{ "caCertConfigured": true, "caCertPathExists": true, "tlsVerify": true, "mtlsConfigured": false }
```

Expected (mTLS enabled):
```json
{ "caCertConfigured": true, "caCertPathExists": true,
  "mtlsConfigured": true, "clientCertPathExists": true, "clientKeyPathExists": true, "mtlsConfigValid": true }
```

## Exporting the CA certificate on Windows

```powershell
# Find the cert in the Windows cert store (run on a machine that already trusts it)
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "<your-internal-ca-name>" }

# Export to PEM
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "<your-internal-ca-name>" } | Select-Object -First 1
[System.IO.File]::WriteAllText("._mil_dir.crt", [System.Convert]::ToBase64String($cert.RawData, "InsertLineBreaks"))
```

Then prepend `-----BEGIN CERTIFICATE-----` and append `-----END CERTIFICATE-----`.

This directory is in `.gitignore` for the certificate file itself (`*.crt`, `*.pem`, `*.key`).
Only this README is committed.
