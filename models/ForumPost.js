import mongoose from "mongoose";

/**
 * ForumPost — a community forum entry created by a trainer.
 *
 * Posts go live immediately on creation. Status field exists so admins can
 * flag or remove content later without a schema migration. Index on
 * createdAt for the eventual "feed" listing (newest first).
 */
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
            type: String,  // Imgbb URL
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

// Newest-first feed queries
ForumPostSchema.index({ createdAt: -1 });

export const ForumPost =
    mongoose.models.ForumPost || mongoose.model("ForumPost", ForumPostSchema);