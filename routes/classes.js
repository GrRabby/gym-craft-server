import { Router } from "express";
import {
    CLASS_CATEGORIES,
    CLASS_DIFFICULTIES,
    CLASS_DAYS,
    GymClass,
} from "../models/GymClasses.js";
import { verifyToken, requireRole, requireActiveUser } from "../middleware/auth.js";
import mongoose from "mongoose";
import { Favorite } from "../models/Favorite.js";
import { Booking } from "../models/Booking.js";
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
        if (!title?.trim()) return res.status(400).json({ ok: false, error: "Title is required." });
        if (!description?.trim()) return res.status(400).json({ ok: false, error: "Description is required." });
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
            {
                $lookup: {
                    from: "user",
                    localField: "trainerId",
                    foreignField: "_id",
                    as: "trainer",
                }
            },
            { $unwind: "$trainer" },
            {
                $project: {
                    title: 1, description: 1, image: 1,
                    category: 1, difficulty: 1,
                    duration: 1, price: 1,
                    scheduleDays: 1, scheduleTime: 1,
                    status: 1, feedback: 1,
                    createdAt: 1, reviewedAt: 1,
                    "trainer._id": 1, "trainer.name": 1,
                    "trainer.email": 1, "trainer.image": 1,
                }
            },
            { $sort: { createdAt: -1 } },
        ]);

        res.json(classes.map((c) => ({
            id: String(c._id),
            title: c.title,
            description: c.description,
            image: c.image,
            category: c.category,
            difficulty: c.difficulty,
            duration: c.duration,
            price: c.price,
            scheduleDays: c.scheduleDays,
            scheduleTime: c.scheduleTime,
            status: c.status,
            feedback: c.feedback,
            createdAt: c.createdAt,
            reviewedAt: c.reviewedAt,
            trainer: {
                id: String(c.trainer._id),
                name: c.trainer.name,
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

        cls.status = "approved";
        cls.feedback = feedback;
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

        cls.status = "rejected";
        cls.feedback = feedback;
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

/* ---------- TRAINER ROUTES ---------- */

/**
 * GET /api/classes/trainer/my-classes
 * Returns all classes created by the currently logged-in trainer.
 */
router.get("/trainer/my-classes", verifyToken, requireRole("trainer"), async (req, res) => {
    try {
        const trainerObjectId = new mongoose.Types.ObjectId(req.user.id);
        const classes = await GymClass.aggregate([
            { $match: { trainerId: trainerObjectId } },
            {
                $lookup: {
                    from: "user",
                    localField: "trainerId",
                    foreignField: "_id",
                    as: "trainer",
                }
            },
            { $unwind: "$trainer" },
            {
                $project: {
                    title: 1, description: 1, image: 1,
                    category: 1, difficulty: 1,
                    duration: 1, price: 1,
                    scheduleDays: 1, scheduleTime: 1,
                    status: 1, feedback: 1,
                    createdAt: 1, reviewedAt: 1,
                    "trainer._id": 1, "trainer.name": 1,
                    "trainer.email": 1, "trainer.image": 1,
                }
            },
            { $sort: { createdAt: -1 } },
        ]);

        res.json(classes.map((c) => ({
            id: String(c._id),
            title: c.title,
            description: c.description,
            image: c.image,
            category: c.category,
            difficulty: c.difficulty,
            duration: c.duration,
            price: c.price,
            scheduleDays: c.scheduleDays,
            scheduleTime: c.scheduleTime,
            status: c.status,
            feedback: c.feedback,
            createdAt: c.createdAt,
            reviewedAt: c.reviewedAt,
            trainer: {
                id: String(c.trainer._id),
                name: c.trainer.name,
                email: c.trainer.email,
                image: c.trainer.image,
            },
        })));
    } catch (err) {
        console.error("GET /api/classes/trainer/my-classes failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load trainer classes" });
    }
});

/**
 * GET /api/classes/trainer/:id/attendees
 * Fetches all paid bookings for the given class and returns student names and emails.
 * Only the owner trainer is permitted.
 */
router.get("/trainer/:id/attendees", verifyToken, requireRole("trainer"), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid class id" });
        }

        const cls = await GymClass.findById(id);
        if (!cls) {
            return res.status(404).json({ ok: false, error: "Class not found" });
        }

        if (String(cls.trainerId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Access denied. You do not own this class." });
        }

        const attendees = await Booking.aggregate([
            { $match: { classId: new mongoose.Types.ObjectId(id), status: "paid" } },
            {
                $lookup: {
                    from: "user",
                    localField: "userId",
                    foreignField: "_id",
                    as: "student",
                }
            },
            { $unwind: { path: "$student", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    id: "$student._id",
                    name: "$student.name",
                    email: "$student.email",
                }
            },
        ]);

        res.json({
            ok: true,
            students: attendees.map((s) => ({
                id: s.id ? String(s.id) : null,
                name: s.name || "Unknown User",
                email: s.email || "Unknown Email",
            })),
        });
    } catch (err) {
        console.error("GET /api/classes/trainer/:id/attendees failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load attendees" });
    }
});

/**
 * PATCH /api/classes/trainer/:id
 * Trainer updates their own class. Resets status to pending.
 */
router.patch("/trainer/:id", verifyToken, requireRole("trainer"), requireActiveUser, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid class id" });

        const cls = await GymClass.findById(req.params.id);
        if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
        if (String(cls.trainerId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Access denied. You do not own this class." });
        }

        const {
            title, description, image,
            category, difficulty,
            duration, price,
            scheduleDays, scheduleTime,
        } = req.body;

        // Validation
        if (title !== undefined && !title?.trim())
            return res.status(400).json({ ok: false, error: "Title is required." });
        if (description !== undefined && !description?.trim())
            return res.status(400).json({ ok: false, error: "Description is required." });
        if (category !== undefined && !CLASS_CATEGORIES.includes(category))
            return res.status(400).json({ ok: false, error: "Invalid category." });
        if (difficulty !== undefined && !CLASS_DIFFICULTIES.includes(difficulty))
            return res.status(400).json({ ok: false, error: "Invalid difficulty level." });

        if (duration !== undefined) {
            const dur = Number(duration);
            if (!Number.isFinite(dur) || dur < 5 || dur > 240)
                return res.status(400).json({ ok: false, error: "Duration must be 5–240 minutes." });
        }

        if (price !== undefined) {
            const prc = Number(price);
            if (!Number.isFinite(prc) || prc < 0)
                return res.status(400).json({ ok: false, error: "Price must be a non-negative number." });
        }

        if (scheduleDays !== undefined) {
            if (!Array.isArray(scheduleDays) || scheduleDays.length === 0)
                return res.status(400).json({ ok: false, error: "Pick at least one day." });
            if (!scheduleDays.every((d) => CLASS_DAYS.includes(d)))
                return res.status(400).json({ ok: false, error: "Invalid schedule day." });
        }

        if (scheduleTime !== undefined) {
            if (!scheduleTime || !/^\d{2}:\d{2}$/.test(scheduleTime))
                return res.status(400).json({ ok: false, error: "Invalid time. Use HH:MM." });
        }

        // Apply changes
        if (title !== undefined) cls.title = title.trim();
        if (description !== undefined) cls.description = description.trim();
        if (image !== undefined) cls.image = image || null;
        if (category !== undefined) cls.category = category;
        if (difficulty !== undefined) cls.difficulty = difficulty;
        if (duration !== undefined) cls.duration = Number(duration);
        if (price !== undefined) cls.price = Number(price);
        if (scheduleDays !== undefined) cls.scheduleDays = scheduleDays;
        if (scheduleTime !== undefined) cls.scheduleTime = scheduleTime;

        // Reset approval fields on edit
        cls.status = "pending";
        cls.feedback = null;
        cls.reviewedBy = null;
        cls.reviewedAt = null;

        await cls.save();

        const lean = cls.toObject();
        res.json({ ok: true, class: { ...lean, id: lean._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/classes/trainer/:id failed:", err);
        res.status(500).json({ ok: false, error: "Failed to update class." });
    }
});

/**
 * DELETE /api/classes/trainer/:id
 * Trainer deletes their own class.
 */
router.delete("/trainer/:id", verifyToken, requireRole("trainer"), requireActiveUser, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id))
            return res.status(400).json({ ok: false, error: "Invalid class id" });

        const cls = await GymClass.findById(req.params.id);
        if (!cls) return res.status(404).json({ ok: false, error: "Class not found" });
        if (String(cls.trainerId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Access denied. You do not own this class." });
        }

        await GymClass.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/classes/trainer/:id failed:", err);
        res.status(500).json({ ok: false, error: "Failed to delete class." });
    }
});

router.get("/public", async (req, res) => {
    try {
        // ---------- Pagination ----------
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 9));
        const skip = (page - 1) * limit;

        // ---------- Filter clause ----------
        const match = { status: "approved" };

        // $in — accept comma-separated categories: ?category=yoga,strength
        const raw = String(req.query.category || "").trim();
        const categories = raw
            .split(",")
            .map((c) => c.trim().toLowerCase())
            .filter((c) => c && CLASS_CATEGORIES.includes(c));

        if (categories.length > 0) {
            match.category = { $in: categories };
        }

        // $regex — case-insensitive substring on title
        const search = String(req.query.search || "").trim();
        if (search) {
            // Escape regex specials so user input can't break the query
            const safe = search.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
            match.title = { $regex: safe, $options: "i" };
        }

        // ---------- Query + count in parallel ----------
        const [classes, total] = await Promise.all([
            GymClass.aggregate([
                { $match: match },
                {
                    $lookup: {
                        from: "user",
                        localField: "trainerId",
                        foreignField: "_id",
                        as: "trainer",
                    }
                },
                { $unwind: "$trainer" },
                {
                    $project: {
                        title: 1, description: 1, image: 1,
                        category: 1, difficulty: 1,
                        duration: 1, price: 1,
                        scheduleDays: 1, scheduleTime: 1,
                        createdAt: 1,
                        "trainer._id": 1, "trainer.name": 1, "trainer.image": 1,
                    }
                },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
            ]),
            GymClass.countDocuments(match),
        ]);

        res.json({
            classes: classes.map((c) => ({
                id: String(c._id),
                title: c.title,
                description: c.description,
                image: c.image,
                category: c.category,
                difficulty: c.difficulty,
                duration: c.duration,
                price: c.price,
                scheduleDays: c.scheduleDays,
                scheduleTime: c.scheduleTime,
                createdAt: c.createdAt,
                trainer: {
                    id: String(c.trainer._id),
                    name: c.trainer.name,
                    image: c.trainer.image,
                },
            })),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        });
    } catch (err) {
        console.error("GET /api/classes/public failed:", err);
        res.status(500).json({ ok: false, error: "Failed to load classes" });
    }
});
/**
 * GET /api/classes/:id
 *
 * Auth-gated. Returns:
 *   - Full class detail (with trainer joined)
 *   - isBooked   — whether the current user has a paid/pending booking
 *   - isFavorited — whether the current user has favorited this class
 *
 * Single round trip so the details page doesn't flicker as separate
 * checks resolve.
 */
router.get("/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid class ID" });
        }

        // Class + trainer in one aggregate
        const result = await GymClass.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(id),
                    status: "approved",
                }
            },
            {
                $lookup: {
                    from: "user",
                    localField: "trainerId",
                    foreignField: "_id",
                    as: "trainer",
                }
            },
            { $unwind: "$trainer" },
            { $limit: 1 },
        ]);

        if (result.length === 0) {
            return res.status(404).json({ ok: false, error: "Class not found" });
        }

        const c = result[0];

        // Booking + favorite checks in parallel
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);
        const classObjectId = new mongoose.Types.ObjectId(id);

        const [bookedDoc, favoritedDoc] = await Promise.all([
            Booking.exists({
                userId: userObjectId,
                classId: classObjectId,
                // Treat any non-cancelled booking as "booked" so a user
                // mid-Stripe-flow doesn't see Book Now still active
                status: { $in: ["paid", "pending"] },
            }),
            Favorite.exists({
                userId: userObjectId,
                classId: classObjectId,
            }),
        ]);

        return res.json({
            class: {
                id: String(c._id),
                title: c.title,
                description: c.description,
                image: c.image,
                category: c.category,
                difficulty: c.difficulty,
                duration: c.duration,
                price: c.price,
                scheduleDays: c.scheduleDays,
                scheduleTime: c.scheduleTime,
                createdAt: c.createdAt,
                trainer: {
                    id: String(c.trainer._id),
                    name: c.trainer.name,
                    image: c.trainer.image,
                },
            },
            isBooked: !!bookedDoc,
            isFavorited: !!favoritedDoc,
        });
    } catch (err) {
        console.error("GET /api/classes/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load class" });
    }
});
export default router;