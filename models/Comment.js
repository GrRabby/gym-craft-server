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
        isEdited: { type: Boolean, default: false },
    },
    { timestamps: true, collection: "comments" }
);

commentSchema.index({ postId: 1, createdAt: 1 });

export const Comment =
    mongoose.models.Comment || mongoose.model("Comment", commentSchema);