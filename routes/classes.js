import { Router } from "express";
import {
    CLASS_CATEGORIES,
    CLASS_DIFFICULTIES,
    CLASS_DAYS,
    GymClass,
} from "../models/GymClasses.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";
import mongoose from "mongoose";

const router = Router();
const STATUSES = ["pending", "approved", "rejected"];
/**
 * POST /api/classes
 * Trainer creates a class. Defaults to status: "pending" — admin must approve.
 * Image upload happens on the Next.js side first; this route just stores the URL.
 */
router.post("/", verifyToken, requireRole("trainer"), requireActiveUser, async (req, res) => {
    try {
        const {
            title, description, image,
            category, difficulty,
            duration, price,
            scheduleDays, scheduleTime,
        } = req.body;

        // Validation
        if (!title?.trim())        return res.status(400).json({ ok: false, error: "Title is required." });
        if (!description?.trim())  return res.status(400).json({ ok: false, error: "Description is required." });
        if (!CLASS_CATEGORIES.includes(category))
            return res.status(400).json({ ok: false, error: "Invalid category." });
        if (!CLASS_DIFFICULTIES.includes(difficulty))
            return res.status(400).json({ ok: false, error: "Invalid difficulty level." });

        const dur = Number(duration);
        if (!Number.isFinite(dur) || dur < 5 || dur > 240)
            return res.status(400).json({ ok: false, error: "Duration must be 5–240 minutes." });

        const prc = Number(price);
        if (!Number.isFinite(prc) || prc < 0)
            return res.status(400).json({ ok: false, error: "Price must be a non-negative number." });

        if (!Array.isArray(scheduleDays) || scheduleDays.length === 0)
            return res.status(400).json({ ok: false, error: "Pick at least one day." });
        if (!scheduleDays.every((d) => CLASS_DAYS.includes(d)))
            return res.status(400).json({ ok: false, error: "Invalid schedule day." });
        if (!scheduleTime || !/^\d{2}:\d{2}$/.test(scheduleTime))
            return res.status(400).json({ ok: false, error: "Invalid time. Use HH:MM." });

        const created = await GymClass.create({
            title: title.trim(),
            description: description.trim(),
            image: image || null,
            category,
            difficulty,
            duration: dur,
            price: prc,
            scheduleDays,
            scheduleTime,
            trainerId: req.user.id,
            status: "pending",
        });

        const lean = created.toObject();
        res.status(201).json({ ok: true, class: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("POST /api/classes failed:", err);
        res.status(500).json({ ok: false, error: "Failed to create class." });
    }
});
/* ---------- ADMIN ROUTES ---------- */
 
/**
 * GET /api/classes?status=pending|approved|rejected|all
 * Joins each class with its trainer's name, email, image for the admin table.
 */
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        const status = STATUSES.includes(req.query.status) ? req.query.status : null;
        const match = status ? { status } : {};
 
        const classes = await GymClass.aggregate([
            { $match: match },
            { $lookup: {
                from: "user",
                localField: "trainerId",
                foreignField: "_id",
                as: "trainer",
            }},
            { $unwind: "$trainer" },
            { $project: {
                title: 1, description: 1, image: 1,
                category: 1, difficulty: 1,
                duration: 1, price: 1,
                scheduleDays: 1, scheduleTime: 1,
                status: 1, feedback: 1,
                createdAt: 1, reviewedAt: 1,
                "trainer._id": 1, "trainer.name": 1,
                "trainer.email": 1, "trainer.image": 1,
            }},
            { $sort: { createdAt: -1 } },
        ]);
 
        res.json(classes.map((c) => ({
            id:           String(c._id),
            title:        c.title,
            description:  c.description,
            image:        c.image,
            category:     c.category,
            difficulty:   c.difficulty,
            duration:     c.duration,
            price:        c.price,
            scheduleDays: c.scheduleDays,
            scheduleTime: c.scheduleTime,
            status:       c.status,
            feedback:     c.feedback,
            createdAt:    c.createdAt,
            reviewedAt:   c.reviewedAt,
            trainer: {
                id:    String(c.trainer._id),
                name:  c.trainer.name,
                email: c.trainer.email,
                image: c.trainer.image,
            },
        })));
    } catch (err) {
        console.error("GET /api/classes failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load classes" });
    }
});
 
/**
 * PATCH /api/classes/:id/approve — body: { feedback?: string }
 */
router.patch("/:id/approve", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid class id" });
 
        const feedback = (req.body.feedback || "").trim() || null;
        const cls = await GymClass.findById(req.params.id);
        if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
        if (cls.status === "approved")
            return res.status(409).json({ ok: false, error: "Already approved" });
 
        cls.status     = "approved";
        cls.feedback   = feedback;
        cls.reviewedBy = req.user.id;
        cls.reviewedAt = new Date();
        await cls.save();
 
        const lean = cls.toObject();
        res.json({ ok: true, class: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/classes/:id/approve failed:", err);
        res.status(500).json({ ok: false, error: "Failed to approve class." });
    }
});
 
/**
 * PATCH /api/classes/:id/reject — body: { feedback: string }
 */
router.patch("/:id/reject", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid class id" });
 
        const feedback = (req.body.feedback || "").trim();
        if (!feedback)
            return res.status(400).json({ ok: false, error: "Feedback is required to reject." });
 
        const cls = await GymClass.findById(req.params.id);
        if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
        if (cls.status === "rejected")
            return res.status(409).json({ ok: false, error: "Already rejected" });
 
        cls.status     = "rejected";
        cls.feedback   = feedback;
        cls.reviewedBy = req.user.id;
        cls.reviewedAt = new Date();
        await cls.save();
 
        const lean = cls.toObject();
        res.json({ ok: true, class: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/classes/:id/reject failed:", err);
        res.status(500).json({ ok: false, error: "Failed to reject class." });
    }
});
 
/**
 * DELETE /api/classes/:id — permanently removes the class.
 */
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid class id" });
 
        const deleted = await GymClass.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ ok: false, error: "Class not found" });
 
        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/classes/:id failed:", err);
        res.status(500).json({ ok: false, error: "Failed to delete class." });
    }
});
 
router.get("/public", async (req, res) => {
    try {
        const classes = await GymClass.aggregate([
            { $match: { status: "approved" } },
            { $lookup: {
                from: "user",
                localField: "trainerId",
                foreignField: "_id",
                as: "trainer",
            }},
            { $unwind: "$trainer" },
            { $project: {
                title: 1, description: 1, image: 1,
                category: 1, difficulty: 1,
                duration: 1, price: 1,
                scheduleDays: 1, scheduleTime: 1,
                createdAt: 1,
                "trainer._id": 1, "trainer.name": 1, "trainer.image": 1,
            }},
            { $sort: { createdAt: -1 } },
        ]);
 
        res.json(classes.map((c) => ({
            id:           String(c._id),
            title:        c.title,
            description:  c.description,
            image:        c.image,
            category:     c.category,
            difficulty:   c.difficulty,
            duration:     c.duration,
            price:        c.price,
            scheduleDays: c.scheduleDays,
            scheduleTime: c.scheduleTime,
            createdAt:    c.createdAt,
            trainer: {
                id:    String(c.trainer._id),
                name:  c.trainer.name,
                image: c.trainer.image,
            },
        })));
    } catch (err) {
        console.error("GET /api/classes/public failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load classes" });
    }
});
export default router;