import mongoose from "mongoose";

/**
 * Booking — a paid (or pending) seat in a class.
 *
 * Created exclusively by:
 *  1. The Stripe webhook (`checkout.session.completed` event), or
 *  2. The /session-status endpoint when the success page calls it
 *
 * Both paths use `findOneAndUpdate({ stripeSessionId }, ..., { upsert: true })`
 * so whichever fires first wins; the other becomes a no-op. The sparse unique
 * index on stripeSessionId enforces this at the DB level even if the upsert
 * race somehow gets through.
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
        amount: { type: Number, required: true }, // amount paid in smallest unit/100

        // Stripe fields
        stripeSessionId: String,
        paymentIntentId: String,
        paidAt: Date,
    },
    { timestamps: true, collection: "bookings" },
);

// One PAID booking per (user, class) — prevents double-charging. Pending
// or cancelled rows don't count toward this constraint thanks to partialFilterExpression.
BookingSchema.index(
    { userId: 1, classId: 1 },
    { unique: true, partialFilterExpression: { status: "paid" } },
);

// One booking per Stripe session — enables idempotent upserts from both
// the webhook and the return URL handler without race conditions
BookingSchema.index(
    { stripeSessionId: 1 },
    { unique: true, sparse: true },
);

export const Booking =
    mongoose.models.Booking || mongoose.model("Booking", BookingSchema);