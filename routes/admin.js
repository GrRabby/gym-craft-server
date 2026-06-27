import express from "express";
import { User } from "../models/User.js";
import { GymClass } from "../models/GymClasses.js";
import { Booking } from "../models/Booking.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(verifyToken, requireRole("admin"));
router.get("/stats", async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const [
            totalUsers,
            totalClasses,
            totalBookings,
            usersByRole,
            bookingsTimeSeries,
            bookingsByCategory,
        ] = await Promise.all([
            User.countDocuments({}),
            GymClass.countDocuments({}),
            Booking.countDocuments({ status: "paid" }),

            User.aggregate([
                { $group: { _id: "$role", count: { $sum: 1 } } },
            ]),

            Booking.aggregate([
                {
                    $match: {
                        status: "paid",
                        paidAt: { $gte: thirtyDaysAgo },
                    },
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),

            Booking.aggregate([
                { $match: { status: "paid" } },
                {
                    $lookup: {
                        from: "classes",
                        localField: "classId",
                        foreignField: "_id",
                        as: "class",
                    },
                },
                { $unwind: "$class" },
                { $group: { _id: "$class.category", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
        ]);

        return res.json({
            ok: true,
            totals: { totalUsers, totalClasses, totalBookings },
            usersByRole: usersByRole.map((r) => ({
                role:  r._id || "unknown",
                count: r.count,
            })),
            bookingsTimeSeries: bookingsTimeSeries.map((b) => ({
                date:     b._id,
                bookings: b.count,
            })),
            bookingsByCategory: bookingsByCategory.map((b) => ({
                category: b._id || "uncategorized",
                count:    b.count,
            })),
        });
    } catch (err) {
        console.error("GET /api/admin/stats failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load stats" });
    }
});

export default router;