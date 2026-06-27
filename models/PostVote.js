import mongoose from "mongoose";

const postVoteSchema = new mongoose.Schema(
    {
        postId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumPost",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
        },
        type: {
            type: String,
            enum: ["like", "dislike"],
            required: true,
        },
    },
    { timestamps: true, collection: "post_votes" }
);

// One vote per user per post — DB-level guarantee.
// Switching like→dislike updates the same row; the API never creates dupes.
postVoteSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const PostVote =
    mongoose.models.PostVote || mongoose.model("PostVote", postVoteSchema);