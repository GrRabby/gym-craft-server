import express from "express";
import mongoose from "mongoose";

import { Booking } from "../models/Booking.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Every bookings endpoint is auth-gated — these are per-user records
router.use(verifyToken);

/**
 * GET /api/bookings/me
 *
 * Returns the current user's paid bookings, joined to class + trainer data.
 * Sorted by most-recently-paid first. Used by the "Booked Classes" page on
 * the member dashboard.
 *
 * Aggregation rather than two queries to avoid N+1 — one DB round trip
 * returns everything the table needs.
 */
router.get("/me",requireRole("member"), async (req, res) => {
    try {
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);

        const bookings = await Booking.aggregate([
            {
                $match: {
                    userId: userObjectId,
                    status: "paid",   // only show successfully paid bookings
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

/**
 * GET /api/bookings/all (Admin only)
 *
 * Returns all paid bookings (Stripe transactions) across the platform.
 * Includes user email and class details.
 */
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