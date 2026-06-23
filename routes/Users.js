import { Router } from "express";
import { User } from "../models/User.js";

const router = Router();

/**
 * GET /api/users
 * Returns all users for the admin Manage Users table.
 * Sorted newest-first. Pagination/search happens on the frontend.
 */
router.get("/", async (req, res) => {
    try {
        const users = await User.find(
            {},
            { name: 1, email: 1, role: 1, status: 1, image: 1, createdAt: 1 }
        )
            .sort({ createdAt: -1 })
            .lean();

        // Map _id → id so the frontend stays storage-agnostic.
        res.json(users.map((u) => ({ ...u, id: u._id, _id: undefined })));
    } catch (err) {
        console.error("GET /api/users failed:", err);
        res.status(500).json({ ok: false, error: "Failed to fetch users" });
    }
});

/**
 * PATCH /api/users/:id/status
 * Body: { status: "active" | "blocked" }
 */
router.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body;
        if (!["active", "blocked"].includes(status)) {
            return res.status(400).json({ ok: false, error: "Invalid status" });
        }
        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { status, updatedAt: new Date() },
            { new: true }
        ).lean();
        if (!updated) return res.status(404).json({ ok: false, error: "User not found" });
        res.json({ ok: true, user: { ...updated, id: updated._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/users/:id/status failed:", err);
        res.status(500).json({ ok: false, error: "Failed to update status" });
    }
});

/**
 * PATCH /api/users/:id/role
 * Body: { role: "member" | "trainer" | "admin" }
 */
router.patch("/:id/role", async (req, res) => {
    try {
        const { role } = req.body;
        if (!["member", "trainer", "admin"].includes(role)) {
            return res.status(400).json({ ok: false, error: "Invalid role" });
        }
        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { role, updatedAt: new Date() },
            { new: true }
        ).lean();
        if (!updated) return res.status(404).json({ ok: false, error: "User not found" });
        res.json({ ok: true, user: { ...updated, id: updated._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/users/:id/role failed:", err);
        res.status(500).json({ ok: false, error: "Failed to update role" });
    }
});

export default router;