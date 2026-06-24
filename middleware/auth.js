import { createRemoteJWKSet, jwtVerify } from "jose-cjs";


/**
 * Verifies JWTs issued by Better Auth's jwt() plugin.
 *
 * Better Auth exposes a JWKS endpoint at /api/auth/jwks. jose's
 * createRemoteJWKSet fetches and caches the public keys, then jwtVerify
 * checks the signature on every request. No shared secret needed — Better
 * Auth rotates the signing keys automatically.
 *
 * The JWKS is cached in-memory after the first fetch (default 10 min TTL).
 */
const JWKS_URL = `${process.env.FRONTEND_ORIGIN}/api/auth/jwks`;
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * verifyToken — reads Authorization: Bearer <jwt>, verifies via JWKS, attaches
 * the decoded payload to req.user. Bails with 401 on missing or invalid tokens.
 */
export async function verifyToken(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        // payload shape: { id, role, status, iat, exp, iss, aud, ... }
        req.user = payload;
        next();
    } catch (err) {
        console.error("JWT verify failed:", err.message);
        return res.status(401).json({ ok: false, error: "Invalid or expired token" });
    }
}

/** Gate routes by role. Use AFTER verifyToken. */
export function requireRole(...allowed) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ ok: false, error: "Not authenticated" });
        }
        if (!allowed.includes(req.user.role)) {
            return res.status(403).json({ ok: false, error: "Forbidden — insufficient role" });
        }
        next();
    };
}

/** Soft-block enforcement for state-changing routes. */
export function requireActiveUser(req, res, next) {
    if (req.user?.status === "blocked") {
        return res.status(403).json({
            ok: false,
            error: "Action restricted by Admin",
            blocked: true,
        });
    }
    next();
}