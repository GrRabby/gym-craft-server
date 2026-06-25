import mongoose from "mongoose";

const CATEGORIES   = ["strength", "cardio", "hiit", "yoga", "pilates", "mobility"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const DAYS         = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const gymClassSchema = new mongoose.Schema(
    {
        title:       { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        image:       { type: String, default: null },

        category:   { type: String, required: true, enum: CATEGORIES },
        difficulty: { type: String, required: true, enum: DIFFICULTIES },

        duration: { type: Number, required: true, min: 5,  max: 240 }, // minutes
        price:    { type: Number, required: true, min: 0 },             // BDT or your currency

        scheduleDays: { type: [{ type: String, enum: DAYS }], default: [] },
        scheduleTime: { type: String, default: null },                  // "HH:MM" 24-hour

        trainerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },

        // Approval workflow — same shape as TrainerApplication for consistency
        status:   {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },
        feedback:   { type: String, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
        reviewedAt: { type: Date,   default: null },
    },
    { timestamps: true, collection: "classes" }
);

export const GymClass =
    mongoose.models.GymClass || mongoose.model("GymClass", gymClassSchema);

// Re-export the enums so routes can validate against the same source of truth
export const CLASS_CATEGORIES   = CATEGORIES;
export const CLASS_DIFFICULTIES = DIFFICULTIES;
export const CLASS_DAYS         = DAYS;