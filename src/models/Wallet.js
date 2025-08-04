import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const walletSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        balance: { type: Number, default: 0 },
        currency: { type: String, default: "NGN" },
        status: { type: String, enum: ["active", "suspended", "locked"], default: "active" }
    },
    {
        collection: "wallets",
        timestamps: true,
        versionKey: false,
    }
);

walletSchema.plugin(mongoosePaginate);

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;