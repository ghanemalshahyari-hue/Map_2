/**
 * LDAP-AUTH-1 — LDAP bind + attribute fetch module.
 *
 * All configuration is read from environment variables at call time.
 * No domain or server address is hardcoded except the env-default for LDAP_DOMAIN.
 *
 * Exported API:
 *   getLdapConfig()                     → config object or throws
 *   normaliseUsername(raw)              → employeeNumber string or null
 *   buildUpn(employeeNumber)            → "employeeNumber@LDAP_DOMAIN"
 *   checkTcpReachability()              → Promise<{ reachable, latencyMs, error?, code? }>
 *   authenticateLdapUser(user, pass)    → Promise<{ ok, user } | { ok:false, reason }>
 *
 * checkTcpReachability uses Node's built-in `net` module only — ldapjs is NOT
 * required for the health endpoint. ldapjs is lazily required only inside
 * authenticateLdapUser, so the module loads cleanly even before ldapjs is installed.
 */
'use strict';

const net = require('net');

// Single source of truth for the env-default domain.
// Operator must set LDAP_DOMAIN in .env.offline to change it — never hardcode here.
const LDAP_DOMAIN_DEFAULT = 'sss.dir';

// ─── LDAP filter escape (RFC 4515) ───────────────────────────────────────────
// Escapes characters that have special meaning inside LDAP filter value strings.
function ldapFilterEscape(str) {
    return String(str).replace(/[\x00\\*()\x80-\xff]/g, c => {
        return `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`;
    });
}

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Read LDAP configuration from environment variables.
 * Throws { code: 'LDAP_CONFIG_ERROR' } if LDAP_SERVER is not set.
 */
function getLdapConfig() {
    const server  = (process.env.LDAP_SERVER  || '').trim();
    const port    = Math.abs(parseInt(process.env.LDAP_PORT    || '389', 10)) || 389;
    const domain  = (process.env.LDAP_DOMAIN  || LDAP_DOMAIN_DEFAULT).trim();
    const timeout = Math.abs(parseInt(process.env.LDAP_TIMEOUT || '5',   10)) || 5;
    const useSsl  = (process.env.LDAP_USE_SSL || '0').trim() === '1';

    if (!server) {
        const e = new Error('LDAP_SERVER environment variable is not set');
        e.code = 'LDAP_CONFIG_ERROR';
        throw e;
    }
    if (!domain) {
        const e = new Error('LDAP_DOMAIN environment variable is empty');
        e.code = 'LDAP_CONFIG_ERROR';
        throw e;
    }

    return { server, port, domain, timeout, useSsl };
}

// ─── Username normalisation ───────────────────────────────────────────────────

// Accepted pattern after stripping domain and lowercasing.
// Starts with a letter, followed by letters/digits/dot/dash/underscore (1–64 chars total).
const USERNAME_RE = /^[a-z][a-z0-9._-]{0,63}$/;

/**
 * Normalise a raw username input.
 *
 * Handles:
 *   "s1234567"           → "s1234567"
 *   "S1234567"           → "s1234567"   (uppercased input)
 *   "s1234567@sss.dir"   → "s1234567"   (user accidentally typed domain)
 *   "  s1234567  "       → "s1234567"   (trimmed whitespace)
 *
 * Returns null for empty, invalid, or dangerous input.
 */
function normaliseUsername(raw) {
    if (!raw || typeof raw !== 'string') return null;

    let u = raw.trim().toLowerCase();

    // Strip any @domain suffix the user might have typed
    const atIdx = u.indexOf('@');
    if (atIdx !== -1) u = u.slice(0, atIdx);

    if (!u) return null;

    if (!USERNAME_RE.test(u)) return null;

    return u;
}

/**
 * Build a User Principal Name from an already-normalised employee number.
 * Reads LDAP_DOMAIN from env each time so hot-config changes take effect.
 */
function buildUpn(employeeNumber) {
    const domain = (process.env.LDAP_DOMAIN || LDAP_DOMAIN_DEFAULT).trim();
    return `${employeeNumber}@${domain}`;
}

// ─── TCP reachability (no credentials, no ldapjs) ────────────────────────────

/**
 * Test TCP connectivity to the LDAP server.
 * Uses Node's built-in `net` module only — ldapjs is NOT required.
 * Safe to call from the health endpoint with no user credentials involved.
 *
 * @returns {Promise<{ reachable: boolean, latencyMs: number, error?: string, code?: string }>}
 */
async function checkTcpReachability() {
    let config;
    try {
        config = getLdapConfig();
    } catch (e) {
        return { reachable: false, latencyMs: 0, error: e.message, code: e.code || 'CONFIG_ERROR' };
    }

    const timeoutMs = config.timeout * 1000;
    const startMs   = Date.now();

    return new Promise(resolve => {
        const socket    = new net.Socket();
        let   settled   = false;

        function done(result) {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch (_) {}
            resolve({ ...result, latencyMs: Date.now() - startMs });
        }

        socket.setTimeout(timeoutMs);

        socket.connect(config.port, config.server, () => {
            done({ reachable: true });
        });

        socket.on('timeout', () => {
            done({ reachable: false, error: 'Connection timed out', code: 'ETIMEDOUT' });
        });

        socket.on('error', err => {
            done({ reachable: false, error: err.message, code: err.code || 'CONNECT_ERROR' });
        });
    });
}

// ─── Attribute extraction (ldapjs v2/v3 compatible) ──────────────────────────

/**
 * Extract attributes from an ldapjs searchEntry to a plain object.
 * Handles both ldapjs v2 (entry.object / attr.vals) and
 * v3 (entry.pojo / attr.values).
 */
function extractAttrs(entry) {
    // ldapjs v3: entry.pojo (preferred)
    if (entry && entry.pojo && typeof entry.pojo === 'object') return entry.pojo;
    // ldapjs v2 / early v3: entry.object (deprecated in v3 but still present)
    if (entry && entry.object && typeof entry.object === 'object') return entry.object;
    // Manual fallback: iterate the attributes array
    const result = {};
    if (entry && Array.isArray(entry.attributes)) {
        for (const attr of entry.attributes) {
            const vals = attr.values || attr.vals || []; // v3: values, v2: vals
            if (Array.isArray(vals) && vals.length > 0) {
                result[attr.type] = vals.length === 1 ? vals[0] : vals;
            }
        }
    }
    return result;
}

// ─── LDAP bind + attribute fetch ─────────────────────────────────────────────

/**
 * Authenticate a user by binding to LDAP with their UPN and password,
 * then fetching display attributes from their directory entry.
 *
 * Security contract:
 *  - `password` is never logged, stored, or included in any returned object.
 *  - On bind failure the reason is normalised to one of three values to avoid
 *    leaking whether the account exists.
 *  - The ldapjs client is unbound / destroyed after every call.
 *
 * @param {string} rawUsername  Employee number (e.g. "s1234567" or "S1234567@domain")
 * @param {string} rawPassword  Windows/domain password
 * @returns {Promise<
 *   { ok: true,  user: { employeeNumber, upn, displayName, title } } |
 *   { ok: false, reason: "invalid_credentials"|"network_error"|"config_error" }
 * >}
 */
async function authenticateLdapUser(rawUsername, rawPassword) {
    // Validate inputs before touching any LDAP connection
    const password = String(rawPassword || '');
    if (!password) return { ok: false, reason: 'invalid_credentials' };

    const employeeNumber = normaliseUsername(rawUsername);
    if (!employeeNumber) return { ok: false, reason: 'invalid_credentials' };

    let config;
    try {
        config = getLdapConfig();
    } catch (_) {
        return { ok: false, reason: 'config_error' };
    }

    const upn = `${employeeNumber}@${config.domain}`;

    // Lazy-require ldapjs so the server starts cleanly even before ldapjs is installed.
    let ldap;
    try {
        ldap = require('ldapjs');
    } catch (_) {
        return { ok: false, reason: 'config_error' };
    }

    return new Promise(resolve => {
        const url = config.useSsl
            ? `ldaps://${config.server}:${config.port}`
            : `ldap://${config.server}:${config.port}`;

        let client;
        try {
            client = ldap.createClient({
                url,
                timeout:        config.timeout * 1000,
                connectTimeout: config.timeout * 1000,
                reconnect:      false
            });
        } catch (_) {
            resolve({ ok: false, reason: 'config_error' });
            return;
        }

        let settled = false;
        function done(result) {
            if (settled) return;
            settled = true;
            try { client.unbind(); } catch (_) {}
            resolve(result);
        }

        // Socket-level errors emitted before bind completes (e.g. ECONNREFUSED)
        client.on('error', () => {
            done({ ok: false, reason: 'network_error' });
        });

        // Attempt bind with User Principal Name
        client.bind(upn, password, bindErr => {
            if (bindErr) {
                // LDAP protocol result code 49 = invalidCredentials (RFC 4511)
                if (bindErr.code === 49) {
                    done({ ok: false, reason: 'invalid_credentials' });
                } else {
                    done({ ok: false, reason: 'network_error' });
                }
                return;
            }

            // ── Bind succeeded — search for display attributes ────────────
            // Build base DN from domain parts: "sss.dir" → "DC=sss,DC=dir"
            const baseDn = config.domain
                .split('.')
                .map(part => `DC=${part}`)
                .join(',');

            const searchOpts = {
                scope:      'sub',
                filter:     `(userPrincipalName=${ldapFilterEscape(upn)})`,
                attributes: ['displayName', 'cn', 'title', 'sAMAccountName', 'employeeNumber'],
                sizeLimit:  1,
                timeLimit:  config.timeout
            };

            client.search(baseDn, searchOpts, (searchErr, res) => {
                if (searchErr) {
                    // Search failed but bind succeeded — return minimal identity
                    done({
                        ok: true,
                        user: { employeeNumber, upn, displayName: employeeNumber, title: '' }
                    });
                    return;
                }

                let firstEntry = null;

                res.on('searchEntry', entry => {
                    if (firstEntry !== null) return; // take only the first result
                    firstEntry = extractAttrs(entry);
                });

                res.on('error', () => {
                    // Search stream error — still a successful auth
                    done({
                        ok: true,
                        user: {
                            employeeNumber,
                            upn,
                            displayName: String(
                                (firstEntry && (firstEntry.displayName || firstEntry.cn)) ||
                                employeeNumber
                            ),
                            title: String((firstEntry && firstEntry.title) || '')
                        }
                    });
                });

                res.on('end', () => {
                    const displayName = String(
                        (firstEntry && (firstEntry.displayName || firstEntry.cn)) ||
                        employeeNumber
                    );
                    const title = String((firstEntry && firstEntry.title) || '');
                    done({ ok: true, user: { employeeNumber, upn, displayName, title } });
                });
            });
        });
    });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
    getLdapConfig,
    normaliseUsername,
    buildUpn,
    checkTcpReachability,
    authenticateLdapUser
};
