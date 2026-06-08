# Internal CA Certificate — OFFLINE-LITELLM-CA-1

Place the internal CA certificate here as **`tawasol-ca.crt`** before running the container.

## What goes here

The **public** Root CA or Intermediate CA certificate that signed the LiteLLM server's TLS
certificate (e.g. `litellm.tawasol.mil.ae`).

- **Format:** PEM (plain text, starts with `-----BEGIN CERTIFICATE-----`)
- **Filename:** `tawasol-ca.crt`
- **Source:** your PKI/IT team, or exported from Windows Certificate Store

## What does NOT go here

- Private keys
- Real API keys or secrets
- Personal certificates
- Passwords

## How it is used

The `docker-compose.offline.yml` mounts this file into the container at:

```
/usr/local/share/ca-certificates/tawasol-ca.crt
```

The following env vars in `.env.offline` point to that path so both Node.js and Python
trust the certificate:

```env
RMOOZ_AI_CA_CERT_PATH=/usr/local/share/ca-certificates/tawasol-ca.crt
SSL_CERT_FILE=/usr/local/share/ca-certificates/tawasol-ca.crt
REQUESTS_CA_BUNDLE=/usr/local/share/ca-certificates/tawasol-ca.crt
NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/tawasol-ca.crt
```

## Verify after container restart

```
curl http://155.140.70.51:8640/api/ai/generation-health
```

Expected response includes:
```json
{
  "caCertConfigured": true,
  "caCertPathExists": true,
  "tlsVerify": true
}
```

## Exporting the CA certificate on Windows

```powershell
# Find the cert in the Windows cert store (run on a machine that already trusts it)
Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "tawasol" }

# Export to PEM
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "tawasol" } | Select-Object -First 1
[System.IO.File]::WriteAllText("tawasol-ca.crt", [System.Convert]::ToBase64String($cert.RawData, "InsertLineBreaks"))
```

Then prepend `-----BEGIN CERTIFICATE-----` and append `-----END CERTIFICATE-----`.

This directory is in `.gitignore` for the certificate file itself (`*.crt`, `*.pem`, `*.key`).
Only this README is committed.
