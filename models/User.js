import mongoose from "mongoose";

/**
 * Better Auth owns the `user` collection (singular). This schema just lets
 * Express read/update those documents. `strict: false` keeps any field Better
 * Auth might add in future versions from being dropped on update.
 */
const userSchema = new mongoose.Schema(
    {
        _id: { type: String },                                                       // Better Auth uses string IDs (cuid)
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
        _id: false,
    }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);