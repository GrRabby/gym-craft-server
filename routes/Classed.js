import { Router } from "express";
import {
    GymClass,
    CLASS_CATEGORIES,
    CLASS_DIFFICULTIES,
    CLASS_DAYS,
} from "../models/GymClass.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";

const router = Router();

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

export default router;