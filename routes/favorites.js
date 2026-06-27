import express from "express";
import mongoose from "mongoose";

import { Favorite } from "../models/Favorite.js";

import { verifyToken, requireActiveUser, requireRole } from "../middleware/auth.js";
import { GymClass } from "../models/GymClasses.js";

const router = express.Router();

router.use(verifyToken);

router.post("/", requireActiveUser, async (req, res) => {
    try {
        const { classId } = req.body || {};

        if (!mongoose.isValidObjectId(classId)) {
            return res.status(400).json({ ok: false, error: "Invalid class ID" });
        }

        const cls = await GymClass.findOne({ _id: classId, status: "approved" });
        if (!cls) {
            return res.status(404).json({ ok: false, error: "Class not found" });
        }

        const fav = await Favorite.findOneAndUpdate(
            { userId: req.user.id, classId },
            { userId: req.user.id, classId },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        return res.json({
            ok: true,
            favorite: { id: String(fav._id), classId: String(fav.classId) },
        });
    } catch (err) {
        console.error("POST /api/favorites failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to add favorite" });
    }
});

router.delete("/:classId", requireActiveUser, async (req, res) => {
    try {
        const { classId } = req.params;
        if (!mongoose.isValidObjectId(classId)) {
            return res.status(400).json({ ok: false, error: "Invalid class ID" });
        }

        await Favorite.deleteOne({ userId: req.user.id, classId });
        return res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/favorites/:classId failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to remove favorite" });
    }
});

router.get("/me", requireRole('member'), async (req, res) => {
    try {
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);

        const favorites = await Favorite.aggregate([
            { $match: { userId: userObjectId } },
            {
                $lookup: {
                    from: "classes",
                    localField: "classId",
                    foreignField: "_id",
                    as: "class",
                }
            },
            { $unwind: "$class" },
            { $match: { "class.status": "approved" } },
            {
                $lookup: {
                    from: "user",
                    localField: "class.trainerId",
                    foreignField: "_id",
                    as: "trainer",
                }
            },
            { $unwind: "$trainer" },
            { $sort: { createdAt: -1 } },
        ]);

        return res.json({
            favorites: favorites.map((f) => ({
                id: String(f._id),
                createdAt: f.createdAt,
                class: {
                    id: String(f.class._id),
                    title: f.class.title,
                    image: f.class.image,
                    category: f.class.category,
                    difficulty: f.class.difficulty,
                    duration: f.class.duration,
                    price: f.class.price,
                    scheduleDays: f.class.scheduleDays,
                    scheduleTime: f.class.scheduleTime,
                    trainer: {
                        id: String(f.trainer._id),
                        name: f.trainer.name,
                        image: f.trainer.image,
                    },
                },
            })),
        });
    } catch (err) {
        console.error("GET /api/favorites/me failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load favorites" });
    }
});

export default router;