import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const billPaymentSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        serviceType: { type: String, required: true }, // e.g., "airtime", "data", "electricity", "cable", "education"
        serviceID: { type: String, required: true }, // VTpass service ID
        billersCode: { type: String }, // Customer ID/Smart Card Number/Meter Number etc.
        variation_code: { type: String }, // For services with variations like data plans
        amount: { type: Number, required: true },
        phone: { type: String, required: true },
        status: { 
            type: String, 
            enum: ["pending", "completed", "failed"], 
            default: "pending" 
        },
        transactionRef: { type: String, unique: true },
        vtpassRef: { type: String }, // Reference from VTpass
        responseData: { type: Object }, // Complete response from VTpass
        paymentMethod: { type: String, default: "wallet" }
    },
    {
        collection: "bill_payments",
        timestamps: true,
        versionKey: false,
    }
);

billPaymentSchema.plugin(mongoosePaginate);

const BillPayment = mongoose.model("BillPayment", billPaymentSchema);

export default BillPayment;