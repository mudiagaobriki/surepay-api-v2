import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const auditLogSchema = new Schema(
    {
        admin: { type: Schema.Types.ObjectId, ref: "User", required: true },
        action: { type: String, required: true }, // e.g., 'CREATE', 'UPDATE', 'DELETE', 'TOGGLE', 'VIEW'
        target: { type: String }, // ID or name of the target
        targetModel: { type: String }, // e.g., 'Service', 'User', 'Transaction'
        details: { type: String },
        metadata: { type: Object }, // Store changed fields or diffs
        ipAddress: { type: String },
        userAgent: { type: String }
    },
    {
        collection: "audit_logs",
        timestamps: true,
        versionKey: false,
    }
);

auditLogSchema.plugin(mongoosePaginate);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
