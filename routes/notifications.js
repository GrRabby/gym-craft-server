import express from "express";
import mongoose from "mongoose";

import { Notification } from "../models/Notification.js";
import { verifyToken, requireActiveUser } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken, requireActiveUser);

/**
 * GET /api/notifications/me?limit=20
 *
 * Returns the user's recent notifications + their unread count.
 * Both come back in one trip so the bell badge stays in sync.
 */
router.get("/me", async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const userId = new mongoose.Types.ObjectId(req.user.id);

        const [notifications, unreadCount] = await Promise.all([
            Notification.find({ userId })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            Notification.countDocuments({ userId, isRead: false }),
        ]);

        return res.json({
            notifications: notifications.map((n) => ({
                id:        String(n._id),
                type:      n.type,
                title:     n.title,
                message:   n.message,
                link:      n.link,
                isRead:    n.isRead,
                createdAt: n.createdAt,
            })),
            unreadCount,
        });
    } catch (err) {
        console.error("GET /api/notifications/me failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load notifications" });
    }
});

/**
 * PATCH /api/notifications/:id/read
 *
 * Mark a single notification as read. Owner-only.
 */
router.patch("/:id/read", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid notification ID" });
        }

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ ok: false, error: "Notification not found" });
        }
        if (String(notification.userId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Not authorized" });
        }

        if (!notification.isRead) {
            notification.isRead = true;
            await notification.save();
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error("PATCH /api/notifications/:id/read failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to mark as read" });
    }
});

/**
 * PATCH /api/notifications/read-all
 *
 * Mark every unread notification as read for the current user.
 */
router.patch("/read-all", async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user.id);
        const result = await Notification.updateMany(
            { userId, isRead: false },
            { $set: { isRead: true } }
        );
        return res.json({ ok: true, updated: result.modifiedCount });
    } catch (err) {
        console.error("PATCH /api/notifications/read-all failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to mark all as read" });
    }
});

/**
 * DELETE /api/notifications/:id
 *
 * Hard delete a notification. Owner-only.
 */
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid notification ID" });
        }

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ ok: false, error: "Notification not found" });
        }
        if (String(notification.userId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Not authorized" });
        }

        await Notification.deleteOne({ _id: id });
        return res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/notifications/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to delete notification" });
    }
});

export default router;