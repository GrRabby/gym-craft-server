import express from "express";
import mongoose from "mongoose";

import { ForumPost } from "../models/ForumPost.js";
import {
    verifyToken,
    requireRole,
    requireActiveUser,
} from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken);

/**
 * POST /api/forum-posts
 * Body: { title, description, image }
 *
 * Trainer creates a new forum post. The image URL is uploaded to Imgbb
 * by the Next.js server action BEFORE this endpoint is hit — we just
 * accept the resulting public URL here. Keeps Imgbb credentials off the
 * Express server entirely.
 */
router.post("/", requireRole("trainer", "admin"), requireActiveUser, async (req, res) => {
    try {
        const { title, description, image } = req.body || {};

        // Server-side guards — never trust the client
        const cleanTitle = String(title || "").trim();
        const cleanDesc  = String(description || "").trim();
        const cleanImage = String(image || "").trim();

        if (!cleanTitle) {
            return res.status(400).json({ ok: false, error: "Title is required" });
        }
        if (!cleanDesc) {
            return res.status(400).json({ ok: false, error: "Description is required" });
        }
        if (!cleanImage || !cleanImage.startsWith("http")) {
            return res.status(400).json({ ok: false, error: "Valid image URL is required" });
        }
        if (cleanTitle.length > 200) {
            return res.status(400).json({ ok: false, error: "Title must be 200 characters or fewer" });
        }
        if (cleanDesc.length > 5000) {
            return res.status(400).json({ ok: false, error: "Description must be 5000 characters or fewer" });
        }

        const post = await ForumPost.create({
            title:       cleanTitle,
            description: cleanDesc,
            image:       cleanImage,
            authorId:    new mongoose.Types.ObjectId(req.user.id),
        });

        return res.status(201).json({
            ok: true,
            post: {
                id:          String(post._id),
                title:       post.title,
                description: post.description,
                image:       post.image,
                createdAt:   post.createdAt,
            },
        });
    } catch (err) {
        console.error("POST /api/forum-posts failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to create post" });
    }
});
router.get("/me", requireActiveUser, async (req, res) => {
    try {
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);
 
        const posts = await ForumPost
            .find({ authorId: userObjectId })
            .sort({ createdAt: -1 })
            .lean();
 
        return res.json({
            posts: posts.map((p) => ({
                id:          String(p._id),
                title:       p.title,
                description: p.description,
                image:       p.image,
                status:      p.status,
                createdAt:   p.createdAt,
                updatedAt:   p.updatedAt,
            })),
        });
    } catch (err) {
        console.error("GET /api/forum-posts/me failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load posts" });
    }
});
router.delete("/:id", requireActiveUser, async (req, res) => {
    try {
        const { id } = req.params;
 
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }
 
        const post = await ForumPost.findById(id);
        if (!post) {
            return res.status(404).json({ ok: false, error: "Post not found" });
        }
 
        // Authorization: owner OR admin
        const isOwner = String(post.authorId) === req.user.id;
        const isAdmin = req.user.role === "admin";
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ ok: false, error: "Not authorized to delete this post" });
        }
 
        await ForumPost.deleteOne({ _id: id });
        return res.json({ ok: true });
    } catch (err) {
        console.error("DELETE /api/forum-posts/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to delete post" });
    }
});
router.get("/", requireRole("admin"), async (req, res) => {
    try {
        const posts = await ForumPost.aggregate([
            { $sort: { createdAt: -1 } },
            { $lookup: {
                from: "user",
                localField: "authorId",
                foreignField: "_id",
                as: "author",
            }},
            { $unwind: "$author" },
            { $project: {
                title: 1,
                description: 1,
                image: 1,
                status: 1,
                createdAt: 1,
                "author._id":   1,
                "author.name":  1,
                "author.email": 1,
                "author.image": 1,
                "author.role":  1,
            }},
        ]);
 
        return res.json({
            posts: posts.map((p) => ({
                id:          String(p._id),
                title:       p.title,
                description: p.description,
                image:       p.image,
                status:      p.status,
                createdAt:   p.createdAt,
                author: {
                    id:    String(p.author._id),
                    name:  p.author.name,
                    email: p.author.email,
                    image: p.author.image,
                    role:  p.author.role,
                },
            })),
        });
    } catch (err) {
        console.error("GET /api/forum-posts failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load posts" });
    }
});
export default router;