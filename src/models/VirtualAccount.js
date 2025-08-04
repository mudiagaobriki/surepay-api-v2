import mongoose from "mongoose";

const { Schema } = mongoose;

const virtualAccountSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        accountReference: { type: String, unique: true },
        accounts: [{
            bankName: { type: String },
            accountNumber: { type: String },
            accountName: { type: String }
        }],
        status: { 
            type: String, 
            enum: ["active", "inactive"], 
            default: "active" 
        },
        metadata: { type: Object }
    },
    {
        collection: "virtual_accounts",
        timestamps: true,
        versionKey: false,
    }
);

const VirtualAccount = mongoose.model("VirtualAccount", virtualAccountSchema);

export default VirtualAccount;