import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true,
            index: true,
        },
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

notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification =
    mongoose.models.Notification || mongoose.model("Notification", notificationSchema);