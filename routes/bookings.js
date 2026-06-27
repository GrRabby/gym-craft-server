import express from "express";
import mongoose from "mongoose";

import { Booking } from "../models/Booking.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken);

router.get("/me",requireRole("member"), async (req, res) => {
    try {
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);

        const bookings = await Booking.aggregate([
            {
                $match: {
                    userId: userObjectId,
                    status: "paid",
                }
            },
            {
                $lookup: {
                    from: "classes",
                    localField: "classId",
                    foreignField: "_id",
                    as: "class",
                }
            },
            { $unwind: "$class" },
            {
                $lookup: {
                    from: "user",
                    localField: "class.trainerId",
                    foreignField: "_id",
                    as: "trainer",
                }
            },
            { $unwind: "$trainer" },
            { $sort: { paidAt: -1 } },
        ]);

        return res.json({
            bookings: bookings.map((b) => ({
                id: String(b._id),
                paidAt: b.paidAt,
                amount: b.amount,
                class: {
                    id: String(b.class._id),
                    title: b.class.title,
                    image: b.class.image,
                    category: b.class.category,
                    difficulty: b.class.difficulty,
                    duration: b.class.duration,
                    scheduleDays: b.class.scheduleDays,
                    scheduleTime: b.class.scheduleTime,
                },
                trainer: {
                    id: String(b.trainer._id),
                    name: b.trainer.name,
                    image: b.trainer.image,
                },
            })),
        });
    } catch (err) {
        console.error("GET /api/bookings/me failed:", err);
        return res.status(500).json({
            ok: false,
            error: "Failed to load bookings",
        });
    }
});

router.get("/all", requireRole("admin"), async (req, res) => {
    try {
        const bookings = await Booking.aggregate([
            { $match: { status: "paid" } },
            {
                $lookup: {
                    from: "user",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user",
                }
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "classes",
                    localField: "classId",
                    foreignField: "_id",
                    as: "class",
                }
            },
            { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
            { $sort: { paidAt: -1 } },
        ]);

        return res.json({
            transactions: bookings.map((b) => ({
                id: String(b._id),
                userEmail: b.user?.email || "N/A",
                classTitle: b.class?.title || "N/A",
                amount: b.amount,
                paidAt: b.paidAt || b.createdAt,
                paymentIntentId: b.paymentIntentId || "N/A",
            })),
        });
    } catch (err) {
        console.error("GET /api/bookings/all failed:", err);
        return res.status(500).json({
            ok: false,
            error: "Failed to load transactions",
        });
    }
});

export default router;