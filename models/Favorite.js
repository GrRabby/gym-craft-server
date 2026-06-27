import mongoose from "mongoose";

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

FavoriteSchema.index({ userId: 1, classId: 1 }, { unique: true });

export const Favorite =
    mongoose.models.Favorite || mongoose.model("Favorite", FavoriteSchema);