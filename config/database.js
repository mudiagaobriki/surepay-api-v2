import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MongoServer; // Make sure this is defined in .env

export const connect = () => {
    if (!MONGO_URI) {
        console.error("MongoServer environment variable not set.");
        process.exit(1);
    }

    mongoose
        .connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            dbName: process.env.DB_NAME,
        })
        .then(() => {
            console.log("Successfully connected to database");
        })
        .catch((error) => {
            console.log("Database connection failed. Exiting now...");
            console.error(error);
            process.exit(1);
        });
};
