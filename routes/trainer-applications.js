import { Router } from "express";
import { TrainerApplication } from "../models/TrainerApplication.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";

const router = Router();

const ALLOWED_SPECIALTIES = ["strength", "cardio", "hiit", "yoga", "pilates", "mobility"];
const ALLOWED_STATUSES    = ["pending", "approved", "rejected"];
/**
 * GET /api/trainer-applications/me
 * Returns the current user's application (or null if none yet).
 * Open to any authenticated user — they need to see their own status.
 */
router.get("/me", verifyToken,requireRole("member"), async (req, res) => {
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
        const specialty = String(req.body.specialty || "").toLowerCase();

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
            existing.experience = experience;
            existing.specialty = specialty;
            existing.status = "pending";
            existing.rejectionReason = null;
            existing.reviewedBy = null;
            existing.reviewedAt = null;
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
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        const status = ALLOWED_STATUSES.includes(req.query.status) ? req.query.status : "pending";

        const apps = await TrainerApplication.aggregate([
            { $match: { status } },
            {
                $lookup: {
                    from: "user",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user",
                }
            },
            { $unwind: "$user" },
            {
                $project: {
                    experience: 1, specialty: 1, status: 1, feedback: 1,
                    createdAt: 1, updatedAt: 1, reviewedAt: 1,
                    "user._id": 1, "user.name": 1, "user.email": 1, "user.image": 1,
                }
            },
            { $sort: { createdAt: -1 } },
        ]);

        res.json(apps.map((a) => ({
            id: String(a._id),
            experience: a.experience,
            specialty: a.specialty,
            status: a.status,
            feedback: a.feedback,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            reviewedAt: a.reviewedAt,
            applicant: {
                id: String(a.user._id),
                name: a.user.name,
                email: a.user.email,
                image: a.user.image,
            },
        })));
    } catch (err) {
        console.error("GET /trainer-applications failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load applications" });
    }
});
/**
 * PATCH /api/trainer-applications/:id/approve
 * Body: { feedback?: string }
 *
 * Marks the application approved AND promotes the user to trainer.
 * Two writes — not transactional unless your Mongo is a replica set.
 * If the second write fails, the application is approved but the user is
 * still a member. Worth knowing for a class project; production code would
 * use a session/transaction here.
 */
router.patch("/:id/approve", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid application id" });
 
        const feedback = (req.body.feedback || "").trim() || null;
 
        const app = await TrainerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ ok: false, error: "Application not found" });
        if (app.status !== "pending")
            return res.status(409).json({ ok: false, error: `Already ${app.status}` });
 
        // 1) Update application
        app.status     = "approved";
        app.feedback   = feedback;
        app.reviewedBy = req.user.id;
        app.reviewedAt = new Date();
        await app.save();
        // 2) Promote user
        const role = await User.findByIdAndUpdate(app.userId, { role: "trainer", updatedAt: new Date() });
        const lean = app.toObject();
        res.json({ ok: true, application: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /approve failed:", err);
        res.status(500).json({ ok: false, error: "Failed to approve" });
    }
});
 
/**
 * PATCH /api/trainer-applications/:id/reject
 * Body: { feedback: string }   ← required
 *
 * Marks the application rejected, saves the feedback. User role unchanged.
 */
router.patch("/:id/reject", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid application id" });
 
        const rejectionReason = (req.body.feedback || "").trim();
        if (!rejectionReason)
            return res.status(400).json({ ok: false, error: "Feedback is required to reject." });
 
        const app = await TrainerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ ok: false, error: "Application not found" });
        if (app.status !== "pending")
            return res.status(409).json({ ok: false, error: `Already ${app.status}` });
 
        app.status     = "rejected";
        app.rejectionReason   = rejectionReason;
        app.reviewedBy = req.user.id;
        app.reviewedAt = new Date();
        await app.save();
 
        const lean = app.toObject();
        res.json({ ok: true, application: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /reject failed:", err);
        res.status(500).json({ ok: false, error: "Failed to reject" });
    }
});
export default router;