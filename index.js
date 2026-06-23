import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/Users.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/users", userRoutes);

const PORT = process.env.PORT || 5000;

mongoose
    .connect(process.env.MONGODB_URI, {
        dbName: process.env.AUTH_DB_NAME || "gym-craft",
    })
    .then(() => {
        console.log("✓ Mongo connected");
        app.listen(PORT, () => console.log(`✓ Express on :${PORT}`));
    })
    .catch((err) => {
        console.error("Mongo connection failed:", err);
        process.exit(1);
    });