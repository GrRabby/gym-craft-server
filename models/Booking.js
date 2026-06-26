import mongoose from "mongoose";

/**
 * Booking — a paid (or pending) seat in a class.
 *
 * For MVP, a booking row is only created when Stripe checkout completes
 * successfully. Until then, no record exists, so a user can retry Book Now
 * as many times as needed without being blocked by a stale "pending" row.
 *
 * The status enum is broader than current usage so the Stripe webhook
 * (added later) can write "pending"/"paid"/"cancelled"/"refunded" without
 * a schema migration.
 */
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
        amount: { type: Number, required: true }, // BDT snapshot at booking time

        // Stripe fields — populated when payment integration goes live
        stripeSessionId: String,
        paymentIntentId: String,
        paidAt: Date,
    },
    { timestamps: true, collection: "bookings" },
);

// Composite index for fast "is this user booked in this class?" lookups
BookingSchema.index({ userId: 1, classId: 1 });

export const Booking =
    mongoose.models.Booking || mongoose.model("Booking", BookingSchema);