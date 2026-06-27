import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
        // Freeform string — UI maps type → icon/color. Examples:
        // "trainer_approved", "trainer_rejected", "trainer_demoted", "info"
        type: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        // Optional destination — clicking the notification navigates here
        link: {
            type: String,
            default: null,
            trim: true,
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true, collection: "notifications" }
);

// Compound index — used by the "fetch recent + count unread" path
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification =
    mongoose.models.Notification || mongoose.model("Notification", notificationSchema);