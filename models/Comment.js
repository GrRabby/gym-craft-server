import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
    {
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumPost",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        // null = top-level. If non-null, points to a top-level comment ID.
        // Replies-to-replies collapse to the same top-level parent (one-level
        // threading by design — see route logic).
        parentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Comment", 
            default: null,
        },
        content: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        isEdited:  { type: Boolean, default: false },
    },
    { timestamps: true, collection: "comments" }
);

// Fast listing per post, oldest-first
commentSchema.index({ postId: 1, createdAt: 1 });

export const Comment =
    mongoose.models.Comment || mongoose.model("Comment", commentSchema);