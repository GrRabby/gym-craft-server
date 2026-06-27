import { Router } from "express";
import { TrainerApplication } from "../models/TrainerApplication.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";
import { User } from "../models/User.js";
import mongoose from "mongoose";
import { Notification } from "../models/Notification.js";

const router = Router();

const ALLOWED_SPECIALTIES = ["strength", "cardio", "hiit", "yoga", "pilates", "mobility"];
const ALLOWED_STATUSES = ["pending", "approved", "rejected"];

router.get("/me", verifyToken, requireRole("member"), async (req, res) => {
    try {
        const app = await TrainerApplication.findOne({ userId: req.user.id }).lean();
        if (!app) return res.json({ application: null });
        res.json({ application: { ...app, id: app._id, _id: undefined } });
    } catch (err) {
        console.error("GET /trainer-applications/me failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load application" });
    }
});

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

router.patch("/:id/approve", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid application id" });

        const feedback = (req.body.feedback || "").trim() || null;

        const app = await TrainerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ ok: false, error: "Application not found" });
        if (app.status !== "pending")
            return res.status(409).json({ ok: false, error: `Already ${app.status}` });

        app.status = "approved";
        app.feedback = feedback;
        app.reviewedBy = req.user.id;
        app.reviewedAt = new Date();
        await app.save();

        await User.findByIdAndUpdate(app.userId, { role: "trainer", updatedAt: new Date() });
        const lean = app.toObject();
        await Notification.create({
            userId: app.userId,
            type: "trainer_approved",
            title: "Application Approved",
            message: feedback?.trim()
                ? feedback.trim()
                : "Welcome to the GymCraft trainer team! You can now create and manage classes.",
            link: "/dashboard/trainer",
        });
        res.json({ ok: true, application: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /approve failed:", err);
        res.status(500).json({ ok: false, error: "Failed to approve" });
    }
});

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

        app.status = "rejected";
        app.rejectionReason = rejectionReason;
        app.reviewedBy = req.user.id;
        app.reviewedAt = new Date();
        await app.save();
        await Notification.create({
            userId: app.userId,
            type: "trainer_rejected",
            title: "Application Needs Revisions",
            message: rejectionReason
                ? rejectionReason
                : "Your trainer application was not approved. Please review the feedback and reapply when ready.",
            link: "/dashboard/member/apply",
        });
        const lean = app.toObject();
        res.json({ ok: true, application: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /reject failed:", err);
        res.status(500).json({ ok: false, error: "Failed to reject" });
    }
});

export default router;