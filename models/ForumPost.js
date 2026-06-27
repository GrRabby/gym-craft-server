import mongoose from "mongoose";

const ForumPostSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000,
        },
        image: {
            type: String,
            required: true,
        },
        authorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["published", "flagged", "removed"],
            default: "published",
        },
    },
    { timestamps: true, collection: "forum_posts" },
);

ForumPostSchema.index({ createdAt: -1 });

export const ForumPost =
    mongoose.models.ForumPost || mongoose.model("ForumPost", ForumPostSchema);