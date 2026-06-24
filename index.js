import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import userRoutes from "./routes/Users.js";
import trainerRoutes from "./routes/trainer-applications.js"
import classRoutes from "./routes/classes.js";
const app = express();

app.use(cors());
app.use(express.json());


app.use("/api/users", userRoutes);
app.use("/api/trainer-applications", trainerRoutes);
app.use("/api/classes", classRoutes);
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