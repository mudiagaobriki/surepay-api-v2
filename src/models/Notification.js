import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const notificationSchema = new Schema(
    {
        recipient: { type: String, required: true }, // 'admin', 'all', or specific user ID
        type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
        title: { type: String, required: true },
        message: { type: String, required: true },
        read: { type: Boolean, default: false },
        target: { type: String, default: 'all' }, // For broadcast messages: 'all', 'user'
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Admin who created it
        isActive: { type: Boolean, default: true }
    },
    {
        collection: "notifications",
        timestamps: true,
        versionKey: false,
    }
);

notificationSchema.plugin(mongoosePaginate);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
