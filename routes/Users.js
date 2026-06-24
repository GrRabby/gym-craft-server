import { Router } from "express";
import { User } from "../models/User.js";
import { requireRole, verifyToken } from "../middleware/auth.js";
import { TrainerApplication } from "../models/TrainerApplication.js";
const router = Router();
router.use(verifyToken, requireRole("admin"));
router.get("/", async (req, res) => {
    try {
        const filter = {};
        if (req.query.role && ["member", "trainer", "admin"].includes(req.query.role)) {
            filter.role = req.query.role;
        }
        const users = await User.find(
            filter,
            { name: 1, email: 1, role: 1, status: 1, image: 1, createdAt: 1 }
        )
            .sort({ createdAt: -1 })
            .lean();

        res.json(users.map((u) => ({ ...u, id: u._id, _id: undefined })));
    } catch (err) {
        console.error("GET /api/users failed:", err);
        res.status(500).json({ ok: false, error: "Failed to fetch users" });
    }
});

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


router.patch("/:id/role", async (req, res) => {
    try {
        const { role } = req.body;
        if (!["member", "trainer", "admin"].includes(role)) {
            return res.status(400).json({ ok: false, error: "Invalid role" });
        }

        // We need the previous role to know whether this is a trainer-demote
        const existing = await User.findById(req.params.id).lean();
        if (!existing) return res.status(404).json({ ok: false, error: "User not found" });

        const previousRole = existing.role;

        const updated = await User.findByIdAndUpdate(
            req.params.id,
            { role, updatedAt: new Date() },
            { new: true }
        ).lean();

        // If we just demoted a trainer back to member, clear their old approved
        // application so they can reapply from scratch.
        if (previousRole === "trainer" && role === "member") {
            await TrainerApplication.deleteOne({ userId: req.params.id });
        }

        res.json({ ok: true, user: { ...updated, id: updated._id, _id: undefined } });
    } catch (err) {
        console.error("PATCH /api/users/:id/role failed:", err);
        res.status(500).json({ ok: false, error: "Failed to update role" });
    }
});

export default router;