import { createRemoteJWKSet, jwtVerify } from "jose-cjs";

const JWKS_URL = `${process.env.FRONTEND_ORIGIN}/api/auth/jwks`;
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export async function verifyToken(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ ok: false, error: "Not authenticated" });
    }
    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = payload;
        next();
    } catch (err) {
        console.error("JWT verify failed:", err.message);
        return res.status(401).json({ ok: false, error: "Invalid or expired token" });
    }
}

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