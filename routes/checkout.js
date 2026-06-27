import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";

import { GymClass } from "../models/GymClasses.js";
import { Booking } from "../models/Booking.js";
import { User } from "../models/User.js";
import { verifyToken, requireActiveUser } from "../middleware/auth.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.use(verifyToken);

router.post("/session", requireActiveUser, async (req, res) => {
    try {
        const { classId } = req.body || {};

        if (!mongoose.isValidObjectId(classId)) {
            return res.status(400).json({ ok: false, error: "Invalid class ID" });
        }

        const cls = await GymClass.findOne({ _id: classId, status: "approved" });
        if (!cls) {
            return res.status(404).json({ ok: false, error: "Class not found" });
        }

        const existing = await Booking.findOne({
            userId: req.user.id,
            classId,
            status: "paid",
        });
        if (existing) {
            return res.status(409).json({
                ok: false,
                error: "You have already booked this class",
            });
        }

        const trainer = await User.findById(cls.trainerId).select("name").lean();

        const safeName = String(cls.title || "GymCraft Class").trim().slice(0, 100);
        const safeDescription = `Coached by ${trainer?.name || "GymCraft Trainer"} · ${cls.duration} min`;
        const safeImages =
            typeof cls.image === "string" && cls.image.startsWith("https://")
                ? [cls.image]
                : [];

        const unitAmountCents = Math.round(Number(cls.price) * 100);

        const session = await stripe.checkout.sessions.create({
            ui_mode: "embedded_page",
            mode: "payment",
            submit_type: "pay",
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: safeName,
                            description: safeDescription,
                            ...(safeImages.length ? { images: safeImages } : {}),
                        },
                        unit_amount: unitAmountCents,
                    },
                    quantity: 1,
                },
            ],
            return_url: `${process.env.FRONTEND_ORIGIN}/classes/${classId}/success?session_id={CHECKOUT_SESSION_ID}`,
            metadata: {
                userId:  String(req.user.id),
                classId: String(classId),
            },
        });

        return res.json({
            ok: true,
            clientSecret: session.client_secret,
            sessionId: session.id,
        });
    } catch (err) {
        console.error("POST /api/checkout/session failed:", err);
        return res.status(500).json({
            ok: false,
            error: err.message || "Failed to create checkout session",
        });
    }
});

router.get("/session-status/:sessionId", async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.metadata?.userId !== req.user.id) {
            return res.status(403).json({
                ok: false,
                error: "Session does not belong to current user",
            });
        }

        if (session.status === "complete" && session.payment_status === "paid") {
            const { userId, classId } = session.metadata;

            await Booking.findOneAndUpdate(
                { stripeSessionId: session.id },
                {
                    userId:  new mongoose.Types.ObjectId(userId),
                    classId: new mongoose.Types.ObjectId(classId),
                    status:  "paid",
                    amount:  session.amount_total / 100,
                    stripeSessionId: session.id,
                    paymentIntentId: session.payment_intent,
                    paidAt:  new Date(),
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            const cls = await GymClass.findById(classId).lean();
            const trainer = cls
                ? await User.findById(cls.trainerId).select("name image").lean()
                : null;

            return res.json({
                ok: true,
                status: "complete",
                amount: session.amount_total / 100,
                class: cls
                    ? {
                        id:           String(cls._id),
                        title:        cls.title,
                        image:        cls.image,
                        price:        cls.price,
                        duration:     cls.duration,
                        scheduleDays: cls.scheduleDays,
                        scheduleTime: cls.scheduleTime,
                        trainer: trainer
                            ? { name: trainer.name, image: trainer.image }
                            : null,
                    }
                    : null,
            });
        }

        return res.json({
            ok: true,
            status: session.status,
            paymentStatus: session.payment_status,
        });
    } catch (err) {
        console.error("GET /api/checkout/session-status failed:", err);
        return res.status(500).json({
            ok: false,
            error: err.message || "Failed to verify session",
        });
    }
});

export default router;