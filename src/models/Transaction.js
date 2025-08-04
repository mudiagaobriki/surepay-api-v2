import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const transactionSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { 
            type: String, 
            enum: ["deposit", "withdrawal", "bill_payment", "refund"], 
            required: true 
        },
        amount: { type: Number, required: true },
        fee: { type: Number, default: 0 }, // Service fee if applicable
        currency: { type: String, default: "NGN" },
        status: { 
            type: String, 
            enum: ["pending", "completed", "failed", "reversed"], 
            default: "pending" 
        },
        reference: { type: String, unique: true },
        description: { type: String },
        metadata: { type: Object }, // Additional details like billPayment ID, etc.
        paymentMethod: { type: String }, // For deposits
        balanceBefore: { type: Number },
        balanceAfter: { type: Number }
    },
    {
        collection: "transactions",
        timestamps: true,
        versionKey: false,
    }
);

transactionSchema.plugin(mongoosePaginate);

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;