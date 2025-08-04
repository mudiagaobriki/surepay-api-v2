import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const paymentSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true },
        currency: { type: String, default: "NGN" },
        reference: { type: String, unique: true, required: true },
        gateway: { type: String, enum: ["paystack", "monnify"], required: true },
        gatewayResponse: { type: Object },
        gatewayReference: { type: String },
        paymentUrl: { type: String },
        status: { 
            type: String, 
            enum: ["pending", "success", "failed"], 
            default: "pending" 
        },
        channel: { type: String },
        metadata: { type: Object },
        paidAt: { type: Date },
        verifiedAt: { type: Date },
        walletId: { type: Schema.Types.ObjectId, ref: "Wallet" }
    },
    {
        collection: "payments",
        timestamps: true,
        versionKey: false,
    }
);

paymentSchema.plugin(mongoosePaginate);

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;