import mongoose from "mongoose";

const trainerApplicationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
            unique: true,
        },
        experience: { type: Number, required: true, min: 0, max: 60 },
        specialty:  {
            type: String,
            required: true,
            enum: ["strength", "cardio", "hiit", "yoga", "pilates", "mobility"],
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },
        rejectionReason: { type: String, default: null },
        reviewedBy:      { type: String, default: null },
        reviewedAt:      { type: Date,   default: null },
    },
    { timestamps: true, collection: "trainer_applications" }
);
export const TrainerApplication =
    mongoose.models.TrainerApplication ||
    mongoose.model("TrainerApplication", trainerApplicationSchema);