import { Router } from "express";
import { TrainerApplication } from "../models/TrainerApplication.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";

const router = Router();

const ALLOWED_SPECIALTIES = ["strength", "cardio", "hiit", "yoga", "pilates", "mobility"];

/**
 * GET /api/trainer-applications/me
 * Returns the current user's application (or null if none yet).
 * Open to any authenticated user — they need to see their own status.
 */
router.get("/me", verifyToken, async (req, res) => {
    try {
        const app = await TrainerApplication.findOne({ userId: req.user.id }).lean();
        if (!app) return res.json({ application: null });
        res.json({ application: { ...app, id: app._id, _id: undefined } });
    } catch (err) {
        console.error("GET /trainer-applications/me failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load application" });
    }
});

/**
 * POST /api/trainer-applications
 * Body: { experience: number, specialty: string }
 *
 * Members only. Active only (soft-block excludes them).
 * - If no existing application → creates one with status: "pending"
 * - If existing is "rejected"  → updates back to "pending" with new values
 * - If existing is "pending" or "approved" → 409 (already on file)
 */
router.post("/", verifyToken, requireRole("member"), requireActiveUser, async (req, res) => {
    try {
        const experience = Number(req.body.experience);
        const specialty  = String(req.body.specialty || "").toLowerCase();

        if (!Number.isFinite(experience) || experience < 0 || experience > 60) {
            return res.status(400).json({ ok: false, error: "Experience must be a number between 0 and 60." });
        }
        if (!ALLOWED_SPECIALTIES.includes(specialty)) {
            return res.status(400).json({ ok: false, error: "Pick a valid specialty." });
        }

        const existing = await TrainerApplication.findOne({ userId: req.user.id });

        if (existing && existing.status !== "rejected") {
            return res.status(409).json({
                ok: false,
                error: existing.status === "pending"
                    ? "You already have a pending application."
                    : "You're already an approved trainer.",
            });
        }

        let app;
        if (existing) {
            existing.experience      = experience;
            existing.specialty       = specialty;
            existing.status          = "pending";
            existing.rejectionReason = null;
            existing.reviewedBy      = null;
            existing.reviewedAt      = null;
            app = await existing.save();
        } else {
            app = await TrainerApplication.create({
                userId: req.user.id,
                experience,
                specialty,
                status: "pending",
            });
        }

        const lean = app.toObject();
        res.status(201).json({ ok: true, application: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("POST /trainer-applications failed:", err);
        res.status(500).json({ ok: false, error: "Failed to submit application." });
    }
});

export default router;