import mongoose from "mongoose";

const { Schema } = mongoose;

const systemSettingSchema = new Schema(
    {
        key: { type: String, required: true, unique: true },
        value: { type: Schema.Types.Mixed, required: true },
        type: { type: String, enum: ['string', 'number', 'boolean', 'json'], required: true },
        description: { type: String, required: true },
        group: { type: String, enum: ['general', 'finance', 'limits', 'security', 'notifications'], required: true },
        isPublic: { type: Boolean, default: false },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    {
        collection: "system_settings",
        timestamps: true,
        versionKey: false,
    }
);

const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);

export default SystemSetting;
