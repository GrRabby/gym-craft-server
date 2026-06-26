import mongoose from "mongoose";

/**
 * Favorite — a saved class for a user.
 *
 * One row per (userId, classId). The unique index prevents duplicates at
 * the DB level even if the API check is bypassed somehow. The POST route
 * uses findOneAndUpdate with upsert:true so an attempted duplicate insert
 * is a no-op rather than an error.
 */
const FavoriteSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GymClass",
            required: true,
            index: true,
        },
    },
    { timestamps: true, collection: "favorites" },
);

// One favorite per (user, class) — enforced at DB level
FavoriteSchema.index({ userId: 1, classId: 1 }, { unique: true });

export const Favorite =
    mongoose.models.Favorite || mongoose.model("Favorite", FavoriteSchema);