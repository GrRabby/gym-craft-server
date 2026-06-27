import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema(
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
        status: {
            type: String,
            enum: ["pending", "paid", "cancelled", "refunded"],
            default: "paid",
        },
        amount: { type: Number, required: true },

        stripeSessionId: String,
        paymentIntentId: String,
        paidAt: Date,
    },
    { timestamps: true, collection: "bookings" },
);

BookingSchema.index(
    { userId: 1, classId: 1 },
    { unique: true, partialFilterExpression: { status: "paid" } },
);

BookingSchema.index(
    { stripeSessionId: 1 },
    { unique: true, sparse: true },
);

export const Booking =
    mongoose.models.Booking || mongoose.model("Booking", BookingSchema);