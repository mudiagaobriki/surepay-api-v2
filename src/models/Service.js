import mongoose from "mongoose";

const { Schema } = mongoose;

const serviceSchema = new Schema(
    {
        name: { type: String, required: true, unique: true }, // e.g., 'airtime', 'data'
        displayName: { type: String, required: true },
        category: { type: String, required: true }, // 'utilities', 'lifestyle', 'financial', 'other'
        isActive: { type: Boolean, default: true },
        description: { type: String },
        maintenanceMessage: { type: String },
        provider: { type: String, default: 'VTPass' }
    },
    {
        collection: "services",
        timestamps: true,
        versionKey: false,
    }
);

const Service = mongoose.model("Service", serviceSchema);

export default Service;
