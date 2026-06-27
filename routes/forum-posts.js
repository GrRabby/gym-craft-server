import express from "express";
import mongoose from "mongoose";

import { ForumPost } from "../models/ForumPost.js";
import {
    verifyToken,
    requireRole,
    requireActiveUser,
} from "../middleware/auth.js";
import { PostVote } from "../models/PostVote.js";
import { Comment } from "../models/Comment.js";

const router = express.Router();

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
router.get("/public", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
        const skip = (page - 1) * limit;
        const search = String(req.query.search || "").trim();

        const searchMatch = search
            ? {
                $or: [
                    { title: { $regex: escapeRegex(search), $options: "i" } },
                    { description: { $regex: escapeRegex(search), $options: "i" } },
                    { "author.name": { $regex: escapeRegex(search), $options: "i" } },
                ],
            }
            : null;

        const pipeline = [
            { $match: { status: "published" } },
            {
                $lookup: {
                    from: "user",
                    localField: "authorId",
                    foreignField: "_id",
                    as: "author",
                }
            },
            { $unwind: "$author" },
        ];

        if (searchMatch) {
            pipeline.push({ $match: searchMatch });
        }

        pipeline.push({
            $facet: {
                data: [
                    { $sort: { createdAt: -1 } },
                    { $skip: skip },
                    { $limit: limit },
                    {
                        $project: {
                            title: 1,
                            description: 1,
                            image: 1,
                            createdAt: 1,
                            "author._id": 1,
                            "author.name": 1,
                            "author.image": 1,
                            "author.role": 1,
                        }
                    },
                ],
                meta: [{ $count: "total" }],
            },
        });

        const [result] = await ForumPost.aggregate(pipeline);
        const posts = result?.data || [];
        const total = result?.meta?.[0]?.total || 0;

        return res.json({
            posts: posts.map((p) => ({
                id: String(p._id),
                title: p.title,
                description: p.description,
                image: p.image,
                createdAt: p.createdAt,
                author: {
                    id: String(p.author._id),
                    name: p.author.name,
                    image: p.author.image,
                    role: p.author.role,
                },
            })),
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
            search,
        });
    } catch (err) {
        console.error("GET /api/forum-posts/public failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load posts" });
    }
});
router.get("/me", verifyToken, requireRole("trainer"), requireActiveUser, async (req, res) => {
    try {
        const userObjectId = new mongoose.Types.ObjectId(req.user.id);
        const posts = await ForumPost
            .find({ authorId: userObjectId })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            posts: posts.map((p) => ({
                id: String(p._id),
                title: p.title,
                description: p.description,
                image: p.image,
                status: p.status,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            })),
        });
    } catch (err) {
        console.error("GET /api/forum-posts/me failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load posts" });
    }
});
router.get("/:id", verifyToken, requireActiveUser, async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }

        const postId = new mongoose.Types.ObjectId(id);
        const userId = new mongoose.Types.ObjectId(req.user.id);

        const [postArr, likes, dislikes, userVote, commentCount] = await Promise.all([
            ForumPost.aggregate([
                { $match: { _id: postId, status: "published" } },
                {
                    $lookup: {
                        from: "user",
                        localField: "authorId",
                        foreignField: "_id",
                        as: "author",
                    }
                },
                { $unwind: "$author" },
                { $limit: 1 },
            ]),
            PostVote.countDocuments({ postId, type: "like" }),
            PostVote.countDocuments({ postId, type: "dislike" }),
            PostVote.findOne({ postId, userId }),
            Comment.countDocuments({ postId }),
        ]);

        if (!postArr.length) {
            return res.status(404).json({ ok: false, error: "Post not found" });
        }

        const post = postArr[0];
        return res.json({
            post: {
                id: String(post._id),
                title: post.title,
                description: post.description,
                image: post.image,
                createdAt: post.createdAt,
                author: {
                    id: String(post.author._id),
                    name: post.author.name,
                    image: post.author.image,
                    role: post.author.role,
                },
            },
            likes,
            dislikes,
            userVote: userVote?.type || null,
            commentCount,
        });
    } catch (err) {
        console.error("GET /api/forum-posts/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load post" });
    }
});
router.post("/", verifyToken, requireRole("trainer", "admin"), requireActiveUser, async (req, res) => {
    try {
        const { title, description, image } = req.body || {};

        const cleanTitle = String(title || "").trim();
        const cleanDesc = String(description || "").trim();
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
            title: cleanTitle,
            description: cleanDesc,
            image: cleanImage,
            authorId: new mongoose.Types.ObjectId(req.user.id),
        });

        return res.status(201).json({
            ok: true,
            post: {
                id: String(post._id),
                title: post.title,
                description: post.description,
                image: post.image,
                createdAt: post.createdAt,
            },
        });
    } catch (err) {
        console.error("POST /api/forum-posts failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to create post" });
    }
});

router.delete("/:id",verifyToken, requireActiveUser, async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }

        const post = await ForumPost.findById(id);
        if (!post) {
            return res.status(404).json({ ok: false, error: "Post not found" });
        }

        const isOwner = String(post.authorId) === req.user.id;
        const isAdmin = req.user.role === "admin";
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ ok: false, error: "Not authorized to delete this post" });
        }

        const postObjectId = post._id;

        const [votesResult, commentsResult] = await Promise.all([
            PostVote.deleteMany({ postId: postObjectId }),
            Comment.deleteMany({ postId: postObjectId }),
        ]);

        await ForumPost.deleteOne({ _id: postObjectId });

        return res.json({
            ok: true,
            deletedVotes:    votesResult.deletedCount    || 0,
            deletedComments: commentsResult.deletedCount || 0,
        });
    } catch (err) {
        console.error("DELETE /api/forum-posts/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to delete post" });
    }
});
router.get("/", verifyToken, requireRole("admin"), async (req, res) => {
    try {
        const posts = await ForumPost.aggregate([
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: "user",
                    localField: "authorId",
                    foreignField: "_id",
                    as: "author",
                }
            },
            { $unwind: "$author" },
            {
                $project: {
                    title: 1,
                    description: 1,
                    image: 1,
                    status: 1,
                    createdAt: 1,
                    "author._id": 1,
                    "author.name": 1,
                    "author.email": 1,
                    "author.image": 1,
                    "author.role": 1,
                }
            },
        ]);

        return res.json({
            posts: posts.map((p) => ({
                id: String(p._id),
                title: p.title,
                description: p.description,
                image: p.image,
                status: p.status,
                createdAt: p.createdAt,
                author: {
                    id: String(p.author._id),
                    name: p.author.name,
                    email: p.author.email,
                    image: p.author.image,
                    role: p.author.role,
                },
            })),
        });
    } catch (err) {
        console.error("GET /api/forum-posts failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load posts" });
    }
});

export default router;