import express from "express";
import mongoose from "mongoose";

import { Comment } from "../models/Comment.js";
import { ForumPost } from "../models/ForumPost.js";
import { verifyToken, requireActiveUser } from "../middleware/auth.js";

const router = express.Router();

router.use(verifyToken, requireActiveUser);

router.get("/", async (req, res) => {
    try {
        const { postId } = req.query;

        if (!mongoose.isValidObjectId(postId)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }

        const comments = await Comment.aggregate([
            { $match: { postId: new mongoose.Types.ObjectId(postId) } },
            { $sort: { createdAt: 1 } },
            { $lookup: {
                from: "user",
                localField: "userId",
                foreignField: "_id",
                as: "author",
            }},
            { $unwind: { path: "$author", preserveNullAndEmptyArrays: true } },
        ]);

        return res.json({
            comments: comments.map((c) => ({
                id:        String(c._id),
                postId:    String(c.postId),
                parentId:  c.parentId ? String(c.parentId) : null,
                content:   c.content,
                isEdited:  c.isEdited,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                author: c.author ? {
                    id:    String(c.author._id),
                    name:  c.author.name,
                    image: c.author.image,
                    role:  c.author.role,
                } : null,
            })),
        });
    } catch (err) {
        console.error("GET /api/comments failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to load comments" });
    }
});

router.post("/", async (req, res) => {
    try {
        const { postId, parentId, content } = req.body || {};

        if (!mongoose.isValidObjectId(postId)) {
            return res.status(400).json({ ok: false, error: "Invalid post ID" });
        }
        const text = String(content || "").trim();
        if (!text) return res.status(400).json({ ok: false, error: "Comment cannot be empty" });
        if (text.length > 2000) return res.status(400).json({ ok: false, error: "Comment too long (max 2000)" });

        const post = await ForumPost.findOne({
            _id: postId,
            status: "published",
        }).select("_id");
        if (!post) return res.status(404).json({ ok: false, error: "Post not found" });

        let resolvedParentId = null;
        if (parentId) {
            if (!mongoose.isValidObjectId(parentId)) {
                return res.status(400).json({ ok: false, error: "Invalid parent ID" });
            }
            const parent = await Comment.findById(parentId).select("_id parentId postId");
            if (!parent || String(parent.postId) !== String(post._id)) {
                return res.status(404).json({ ok: false, error: "Parent comment not found" });
            }
            resolvedParentId = parent.parentId || parent._id;
        }

        const created = await Comment.create({
            postId:   post._id,
            userId:   new mongoose.Types.ObjectId(req.user.id),
            parentId: resolvedParentId,
            content:  text,
        });

        const [withAuthor] = await Comment.aggregate([
            { $match: { _id: created._id } },
            { $lookup: {
                from: "user",
                localField: "userId",
                foreignField: "_id",
                as: "author",
            }},
            { $unwind: "$author" },
        ]);

        return res.status(201).json({
            ok: true,
            comment: {
                id:        String(withAuthor._id),
                postId:    String(withAuthor.postId),
                parentId:  withAuthor.parentId ? String(withAuthor.parentId) : null,
                content:   withAuthor.content,
                isEdited:  false,
                createdAt: withAuthor.createdAt,
                updatedAt: withAuthor.updatedAt,
                author: {
                    id:    String(withAuthor.author._id),
                    name:  withAuthor.author.name,
                    image: withAuthor.author.image,
                    role:  withAuthor.author.role,
                },
            },
        });
    } catch (err) {
        console.error("POST /api/comments failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to post comment" });
    }
});

router.patch("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid comment ID" });
        }
        const text = String(req.body?.content || "").trim();
        if (!text) return res.status(400).json({ ok: false, error: "Comment cannot be empty" });
        if (text.length > 2000) return res.status(400).json({ ok: false, error: "Comment too long (max 2000)" });

        const comment = await Comment.findById(id);
        if (!comment) return res.status(404).json({ ok: false, error: "Comment not found" });
        if (String(comment.userId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Not authorized" });
        }

        comment.content = text;
        comment.isEdited = true;
        await comment.save();

        return res.json({
            ok: true,
            comment: {
                id:        String(comment._id),
                content:   comment.content,
                isEdited:  true,
                updatedAt: comment.updatedAt,
            },
        });
    } catch (err) {
        console.error("PATCH /api/comments/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to edit comment" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ ok: false, error: "Invalid comment ID" });
        }

        const comment = await Comment.findById(id);
        if (!comment) return res.status(404).json({ ok: false, error: "Comment not found" });
        if (String(comment.userId) !== req.user.id) {
            return res.status(403).json({ ok: false, error: "Not authorized" });
        }

        const deletedIds = [String(comment._id)];

        if (!comment.parentId) {
            const replies = await Comment.find({ parentId: comment._id })
                .select("_id")
                .lean();
            if (replies.length > 0) {
                deletedIds.push(...replies.map((r) => String(r._id)));
                await Comment.deleteMany({ parentId: comment._id });
            }
        }

        await Comment.deleteOne({ _id: comment._id });

        return res.json({ ok: true, deletedIds });
    } catch (err) {
        console.error("DELETE /api/comments/:id failed:", err);
        return res.status(500).json({ ok: false, error: "Failed to delete comment" });
    }
});

export default router;