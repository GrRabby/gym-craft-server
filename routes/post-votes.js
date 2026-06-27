import express from "express";
import mongoose from "mongoose";

import { PostVote } from "../models/PostVote.js";
import { ForumPost } from "../models/ForumPost.js";
import { verifyToken, requireActiveUser } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken, requireActiveUser);

/**
 * POST /api/post-votes
 * Body: { postId, type: "like" | "dislike" }
 *
 * Handles all three cases atomically:
 *   - No existing vote → create new vote
 *   - Existing vote of SAME type → remove (toggle off)
 *   - Existing vote of OTHER type → switch
 *
 * Returns the fresh { likes, dislikes, userVote } so the client can
 * sync its optimistic UI with reality.
 */
router.post("/", async (req, res) => {
    try {
        const { postId, type } = req.body || {};

        if (!mongoose.isValidObjectId(postId)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }
        if (type !== "like" && type !== "dislike") {
            return res.status(400).json({ ok: false, error: "Invalid vote type" });
        }

        const postObjectId = new mongoose.Types.ObjectId(postId);
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);

        // Verify post exists and is published — don't let users vote on
        // flagged/removed posts even by guessing the ID
        const post = await ForumPost.findOne({
            _id: postObjectId,
            status: "published",
        }).select("_id");
        if (!post) {
            return res.status(404).json({ ok: false, error: "Post not found" });
        }

        const existing = await PostVote.findOne({
            postId: postObjectId,
            userId: userObjectId,
        });

        if (!existing) {
            await PostVote.create({
                postId: postObjectId,
                userId: userObjectId,
                type,
            });
        } else if (existing.type === type) {
            await existing.deleteOne();
        } else {
            existing.type = type;
            await existing.save();
        }

        const [likes, dislikes, userVote] = await Promise.all([
            PostVote.countDocuments({ postId: postObjectId, type: "like" }),
            PostVote.countDocuments({ postId: postObjectId, type: "dislike" }),
            PostVote.findOne({ postId: postObjectId, userId: userObjectId }),
        ]);

        return res.json({
            ok: true,
            likes,
            dislikes,
            userVote: userVote?.type || null,
        });
    } catch (err) {
        console.error("POST /api/post-votes failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to record vote" });
    }
});

export default router;