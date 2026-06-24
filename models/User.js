import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {                                                     
        name: String,
        email: { type: String, index: true },
        emailVerified: Boolean,
        image: String,
        role:   { type: String, enum: ["member", "trainer", "admin"], default: "member" },
        status: { type: String, enum: ["active", "blocked"],          default: "active" },
        createdAt: Date,
        updatedAt: Date,
    },
    {
        collection: "user",
        timestamps: false,
        strict: false,
    }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);